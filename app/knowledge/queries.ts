import { supabaseAdmin } from "@/lib/supabase";
import type { CardType, CompanyDetail, CompanyType, KnowledgeCard } from "./types";

// ── Knowledge Cards ───────────────────────────────────────────────────────────

export async function listKnowledgeCards(
  userId: string,
  cardType?: CardType
): Promise<KnowledgeCard[]> {
  let q = supabaseAdmin
    .from("knowledge_cards")
    .select("id, content, card_type, tags, source_type, source_ref, created_at")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (cardType) q = q.eq("card_type", cardType);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as KnowledgeCard[];
}

export async function countKnowledgeCards(userId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("knowledge_cards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("archived_at", null);
  if (error) return 0;
  return count ?? 0;
}

/**
 * Fetch top N relevant knowledge cards for a given idea's context.
 * Uses simple keyword overlap between idea tags/hypothesis and card tags/content.
 */
export async function getRelevantKnowledgeCards(
  userId: string,
  keywords: string[],
  limit = 4
): Promise<KnowledgeCard[]> {
  if (keywords.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("knowledge_cards")
    .select("id, content, card_type, tags, source_type, source_ref, created_at")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) return [];

  const cards = (data ?? []) as KnowledgeCard[];
  const lower = keywords.map((k) => k.toLowerCase());

  const scored = cards.map((c) => {
    const target = [c.content, ...c.tags].join(" ").toLowerCase();
    const hits = lower.filter((k) => target.includes(k)).length;
    return { card: c, hits };
  });

  return scored
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit)
    .map((s) => s.card);
}

// ── Companies ─────────────────────────────────────────────────────────────────

export async function listCompanies(
  userId: string,
  companyType?: CompanyType
): Promise<{ id: string; name: string; company_type: CompanyType; created_at: string }[]> {
  let q = supabaseAdmin
    .from("companies")
    .select("id, name, company_type, created_at")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });

  if (companyType) q = q.eq("company_type", companyType);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function countCompanies(userId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("companies")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("archived_at", null);
  if (error) return 0;
  return count ?? 0;
}

export async function getCompanyDetail(
  companyId: string,
  userId: string
): Promise<CompanyDetail | null> {
  const { data: company, error } = await supabaseAdmin
    .from("companies")
    .select("id, user_id, name, company_type, ceo_notes, created_at, updated_at")
    .eq("id", companyId)
    .maybeSingle();
  if (error || !company || company.user_id !== userId) return null;

  const [eventsResult, notesResult] = await Promise.all([
    supabaseAdmin
      .from("company_events")
      .select("id, company_id, year, description, related_party, created_at")
      .eq("company_id", companyId)
      .order("year", { ascending: true, nullsFirst: false }),
    supabaseAdmin
      .from("company_notes")
      .select("id, company_id, content, idea_id, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
  ]);

  return {
    id: company.id,
    name: company.name,
    company_type: company.company_type as CompanyType,
    ceo_notes: company.ceo_notes ?? "",
    created_at: company.created_at,
    updated_at: company.updated_at,
    events: eventsResult.data ?? [],
    notes: notesResult.data ?? [],
  };
}
