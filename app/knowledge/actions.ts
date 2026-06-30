"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { CardType, CompanyType } from "./types";

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

// ── Knowledge Cards ───────────────────────────────────────────────────────────

export async function createKnowledgeCard(
  content: string,
  cardType: CardType,
  tags: string[],
  sourceType: "manual" | "extracted" = "manual",
  sourceRef?: string
): Promise<{ id: string }> {
  if (!content.trim()) throw new Error("内容不能为空");
  const userId = await requireUserId();
  const { data, error } = await supabaseAdmin
    .from("knowledge_cards")
    .insert({
      user_id: userId,
      content: content.trim(),
      card_type: cardType,
      tags: tags.filter(Boolean),
      source_type: sourceType,
      source_ref: sourceRef ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function archiveKnowledgeCard(cardId: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabaseAdmin
    .from("knowledge_cards")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", cardId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

// ── Companies ─────────────────────────────────────────────────────────────────

export async function createCompany(
  name: string,
  companyType: CompanyType,
  ceoNotes: string
): Promise<{ id: string }> {
  if (!name.trim()) throw new Error("公司名不能为空");
  const userId = await requireUserId();
  const { data, error } = await supabaseAdmin
    .from("companies")
    .insert({
      user_id: userId,
      name: name.trim(),
      company_type: companyType,
      ceo_notes: ceoNotes.trim(),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateCompany(
  companyId: string,
  name: string,
  companyType: CompanyType,
  ceoNotes: string
): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabaseAdmin
    .from("companies")
    .update({
      name: name.trim(),
      company_type: companyType,
      ceo_notes: ceoNotes.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", companyId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function archiveCompany(companyId: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabaseAdmin
    .from("companies")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", companyId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

// ── Company Events ─────────────────────────────────────────────────────────────

export async function addCompanyEvent(
  companyId: string,
  description: string,
  year: number | null,
  relatedParty: string
): Promise<void> {
  if (!description.trim()) throw new Error("描述不能为空");
  const userId = await requireUserId();
  // Verify ownership
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("user_id")
    .eq("id", companyId)
    .maybeSingle();
  if (!company || company.user_id !== userId) throw new Error("无权访问");

  const { error } = await supabaseAdmin.from("company_events").insert({
    company_id: companyId,
    description: description.trim(),
    year: year ?? null,
    related_party: relatedParty.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function deleteCompanyEvent(eventId: string): Promise<void> {
  const userId = await requireUserId();
  const { data: event } = await supabaseAdmin
    .from("company_events")
    .select("company_id")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return;

  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("user_id")
    .eq("id", event.company_id)
    .maybeSingle();
  if (!company || company.user_id !== userId) throw new Error("无权访问");

  await supabaseAdmin.from("company_events").delete().eq("id", eventId);
}

// ── Company Notes ──────────────────────────────────────────────────────────────

export async function addCompanyNote(
  companyId: string,
  content: string,
  ideaId?: string
): Promise<void> {
  if (!content.trim()) throw new Error("内容不能为空");
  const userId = await requireUserId();
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("user_id")
    .eq("id", companyId)
    .maybeSingle();
  if (!company || company.user_id !== userId) throw new Error("无权访问");

  const { error } = await supabaseAdmin.from("company_notes").insert({
    company_id: companyId,
    content: content.trim(),
    idea_id: ideaId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function deleteCompanyNote(noteId: string): Promise<void> {
  const userId = await requireUserId();
  const { data: note } = await supabaseAdmin
    .from("company_notes")
    .select("company_id")
    .eq("id", noteId)
    .maybeSingle();
  if (!note) return;

  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("user_id")
    .eq("id", note.company_id)
    .maybeSingle();
  if (!company || company.user_id !== userId) throw new Error("无权访问");

  await supabaseAdmin.from("company_notes").delete().eq("id", noteId);
}
