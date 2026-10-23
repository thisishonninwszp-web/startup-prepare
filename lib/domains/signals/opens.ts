import { supabaseAdmin } from "@/lib/supabase";
import { OPEN_VIAS, opensBySource, type OpenRow, type OpenVia } from "./opens-shared";

export * from "./opens-shared";

/** 东京的日子（不从 brief 引：memory 会引这个文件，brief 又引 memory）。 */
const tokyoDay = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);

/**
 * 他点开了哪几条（迁移 100，经用户同意 2026-10-23）：报告里展开一条、打开新闻详情页、从邮件里点进来，记一次；
 * 同一条一天只记一次。迁移没跑、记不上就算了 —— 这是顺手记的，不能拦着他看新闻。
 */
export async function recordOpen(userId: string, signalId: string, via: OpenVia): Promise<void> {
  if (!OPEN_VIAS.includes(via) || !/^[0-9a-f-]{36}$/i.test(signalId)) return;
  const { error } = await supabaseAdmin
    .from("signal_opens")
    .upsert({ user_id: userId, signal_id: signalId, opened_on: tokyoDay(), via }, { onConflict: "user_id,signal_id,opened_on", ignoreDuplicates: true });
  if (error && !/signal_opens|does not exist|schema cache/.test(error.message)) console.error("record open", error.message);
}

/** 最近 days 天他点开过的（迁移没跑是空的）。 */
export async function recentOpens(userId: string, days: number): Promise<OpenRow[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from("signal_opens")
    .select("signal_id, opened_on, first_at")
    .eq("user_id", userId)
    .gte("opened_on", since)
    .order("opened_on", { ascending: false })
    .limit(2000);
  if (error) return [];
  return (data ?? []) as OpenRow[];
}

/** 每个源最近 days 天点开过几条（信息源体检用；迁移没跑是空的）。 */
export async function openCounts(userId: string, days: number): Promise<Map<string, number>> {
  const rows = await recentOpens(userId, days);
  if (rows.length === 0) return new Map();
  const ids = Array.from(new Set(rows.map((r) => r.signal_id)));
  const sources: { signal_id: string; source: string }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabaseAdmin.from("external_signals").select("id, source").in("id", ids.slice(i, i + 200));
    for (const r of (data ?? []) as { id: string; source: string }[]) sources.push({ signal_id: r.id, source: r.source });
  }
  return opensBySource(sources);
}
