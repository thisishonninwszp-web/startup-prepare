import { supabaseAdmin } from "@/lib/supabase";

export type DeferredQuestionItem = { id: string; ideaId: string; question: string; questions: string[]; recheckOn: string | null };
export async function loadDeferredExperimentQuestions(userId: string): Promise<{ available: boolean; items: DeferredQuestionItem[]; capped: boolean }> {
  const { data, error } = await supabaseAdmin.from("idea_experiments").select("id,idea_id,series_id,question,deferred_questions,recheck_on").eq("user_id", userId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(51);
  if (error) {
    if (["42P01", "PGRST205"].includes(error.code ?? "") && error.message.includes("idea_experiments")) return { available: false, items: [], capped: false };
    throw new Error(error.message);
  }
  const seen = new Set<string>(); const items: DeferredQuestionItem[] = [];
  for (const row of (data ?? []).slice(0, 50)) {
    if (seen.has(row.series_id)) continue; seen.add(row.series_id);
    const questions = Array.isArray(row.deferred_questions) ? row.deferred_questions.filter((q: unknown): q is string => typeof q === "string" && !!q.trim()) : [];
    if (questions.length) items.push({ id: row.id, ideaId: row.idea_id, question: row.question, questions, recheckOn: row.recheck_on });
  }
  return { available: true, items, capped: (data?.length ?? 0) > 50 };
}
