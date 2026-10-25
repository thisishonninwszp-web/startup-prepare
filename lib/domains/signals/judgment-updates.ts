import { supabaseAdmin } from "@/lib/supabase";
import { parseJudgmentUpdate, type JudgmentUpdate, type JudgmentUpdateInput } from "./judgment-updates-shared";

const COLUMNS = "id, judgment_id, judgment, reason, source_url, created_at";
const MIGRATION_MESSAGE = "判断历史还没有启用，请先执行数据库迁移 103_signal_judgment_updates.sql。";

function databaseError(error: { message: string; code?: string }): Error {
  if (error.code === "42P01" || error.code === "PGRST205") return new Error(MIGRATION_MESSAGE);
  return new Error(error.message);
}

export async function requireOwnJudgment(userId: string, judgmentId: string): Promise<void> {
  const { data, error } = await supabaseAdmin.from("signal_judgments").select("id").eq("id", judgmentId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("找不到这个判断，或无权访问");
}

export async function listJudgmentUpdates(userId: string, judgmentId: string): Promise<JudgmentUpdate[]> {
  await requireOwnJudgment(userId, judgmentId);
  const { data, error } = await supabaseAdmin.from("signal_judgment_updates").select(COLUMNS)
    .eq("judgment_id", judgmentId).eq("user_id", userId).order("created_at", { ascending: true }).order("id", { ascending: true });
  if (error) throw databaseError(error);
  return (data ?? []) as JudgmentUpdate[];
}

export async function appendJudgmentUpdate(userId: string, judgmentId: string, input: JudgmentUpdateInput): Promise<JudgmentUpdate> {
  const update = parseJudgmentUpdate(input);
  await requireOwnJudgment(userId, judgmentId);
  const { data, error } = await supabaseAdmin.from("signal_judgment_updates")
    .insert({ user_id: userId, judgment_id: judgmentId, ...update }).select(COLUMNS).single();
  if (error) throw databaseError(error);
  if (!data) throw new Error("新判断没有保存，请重试");
  return data as JudgmentUpdate;
}
