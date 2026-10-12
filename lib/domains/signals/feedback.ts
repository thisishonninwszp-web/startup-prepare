import { supabaseAdmin } from "@/lib/supabase";

/**
 * 每天每一节"有用 / 没用"：攒两周，看哪节一直被跳过，该砍还是该改。
 * 只数次数，不算比率（判断这一节值不值得留的是他，不是一个百分比）。
 */

export type FeedbackKind = "news" | "calendar" | "voices" | "money" | "tools";

/** 迁移 062 没跑时返回空对象。 */
export async function getFeedback(userId: string, date: string): Promise<Partial<Record<FeedbackKind, boolean>>> {
  const { data, error } = await supabaseAdmin
    .from("signal_feedback")
    .select("kind, useful")
    .eq("user_id", userId)
    .eq("brief_date", date);
  if (error) return {};
  return Object.fromEntries((data ?? []).map((r) => [r.kind as string, r.useful as boolean]));
}

export async function setFeedback(userId: string, date: string, kind: FeedbackKind, useful: boolean): Promise<void> {
  const { error } = await supabaseAdmin
    .from("signal_feedback")
    .upsert({ user_id: userId, brief_date: date, kind, useful }, { onConflict: "user_id,brief_date,kind" });
  if (error) {
    if (/signal_feedback/.test(error.message)) throw new Error("迁移 062 还没跑");
    throw new Error(error.message);
  }
}

export type FeedbackTally = { kind: string; useful: number; useless: number };

/** 最近 days 天每一节点了几次有用、几次没用。 */
export async function tallyFeedback(userId: string, days = 14): Promise<FeedbackTally[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from("signal_feedback")
    .select("kind, useful")
    .eq("user_id", userId)
    .gte("brief_date", since);
  if (error) return [];
  return countFeedback((data ?? []) as { kind: string; useful: boolean }[]);
}

export function countFeedback(rows: { kind: string; useful: boolean }[]): FeedbackTally[] {
  const order = ["news", "calendar", "voices", "money", "tools"];
  return order.map((kind) => ({
    kind,
    useful: rows.filter((r) => r.kind === kind && r.useful).length,
    useless: rows.filter((r) => r.kind === kind && !r.useful).length,
  }));
}
