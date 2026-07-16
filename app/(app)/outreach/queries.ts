import { supabaseAdmin } from "@/lib/supabase";
import type { AiChallenge, OutreachCanvas, UseCase } from "./types";

export async function listCanvases(userId: string): Promise<OutreachCanvas[]> {
  const { data, error } = await supabaseAdmin
    .from("outreach_canvases")
    .select(
      "id, user_id, title, use_case, scenario, source_id, source_type, person_notes, place_notes, time_notes, message_draft, ai_challenges, created_at, updated_at"
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToCanvas);
}

export async function getCanvas(
  id: string,
  userId: string
): Promise<OutreachCanvas | null> {
  const { data, error } = await supabaseAdmin
    .from("outreach_canvases")
    .select(
      "id, user_id, title, use_case, scenario, source_id, source_type, person_notes, place_notes, time_notes, message_draft, ai_challenges, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) return null;
  return rowToCanvas(data);
}

function rowToCanvas(row: Record<string, unknown>): OutreachCanvas {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    title: String(row.title ?? ""),
    use_case: (row.use_case as UseCase) ?? "other",
    scenario: String(row.scenario ?? ""),
    source_id: row.source_id ? String(row.source_id) : null,
    source_type: (row.source_type as "idea" | "company" | null) ?? null,
    person_notes: String(row.person_notes ?? ""),
    place_notes: String(row.place_notes ?? ""),
    time_notes: String(row.time_notes ?? ""),
    message_draft: String(row.message_draft ?? ""),
    ai_challenges: Array.isArray(row.ai_challenges)
      ? (row.ai_challenges as AiChallenge[])
      : [],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}
