import { supabaseAdmin } from "@/lib/supabase";

/**
 * 新闻的「记成观察 / 只是知道了」每人一份（迁移 092）：主账号照旧记在 external_signals.status 上（别的老功能也读它），
 * 朋友的账号记在 signal_user_states —— 他点了「只是知道了」，主账号的列表不受影响。
 */

export const STATES_MISSING = "迁移 092 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/092_signal_members.sql。";

function missing(error: { message: string } | null): boolean {
  return !!error && /signal_user_states|does not exist|schema cache/.test(error.message);
}

/** 这个账号处理过的新闻（id）；迁移没跑返回空。 */
export async function handledSignalIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin.from("signal_user_states").select("signal_id").eq("user_id", userId);
  if (error) {
    if (missing(error)) return new Set();
    throw new Error(error.message);
  }
  return new Set(((data ?? []) as { signal_id: string }[]).map((r) => r.signal_id));
}

/** 这一条在这个账号这里处理过没有。 */
export async function userSignalState(userId: string, signalId: string): Promise<"pending" | "promoted" | "dismissed"> {
  const { data, error } = await supabaseAdmin.from("signal_user_states").select("status").eq("user_id", userId).eq("signal_id", signalId).maybeSingle();
  if (error) {
    if (missing(error)) return "pending";
    throw new Error(error.message);
  }
  return (data?.status as "promoted" | "dismissed" | undefined) ?? "pending";
}

export async function setUserSignalState(userId: string, signalId: string, status: "promoted" | "dismissed", observationId: string | null = null): Promise<void> {
  const { error } = await supabaseAdmin
    .from("signal_user_states")
    .upsert({ user_id: userId, signal_id: signalId, status, observation_id: observationId }, { onConflict: "user_id,signal_id" });
  if (error) throw new Error(missing(error) ? STATES_MISSING : error.message);
}
