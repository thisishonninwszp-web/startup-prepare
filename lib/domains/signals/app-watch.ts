import { supabaseAdmin } from "@/lib/supabase";
import { selectAll } from "@/lib/supabase-all";
import { APP_JP_SOURCE, CN_APP_SOURCE } from "./feeds";
import { appNameFromChartTitle, EVENT_LABELS, parseLookup, watchTransition, type WatchState } from "./app-watch-shared";

/**
 * 中国 App 来日本的迹象（迁移 096）：上过中国免费榜的 App（external_signals 里中国 App 榜那些），
 * 每天查日本 App Store 上有没有、支不支持日语；从没有变成有，记成一条新闻（进存档、进「今天」、能被「在跟的事」接上）。
 * 苹果的查询接口一次可以查很多个 id，不用 Key，不调 AI。
 */

export const WATCH_MISSING = "迁移 096 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/096_signal_indicators.sql。";

function missing(error: { message: string } | null): boolean {
  return !!error && /app_watch|does not exist|schema cache/.test(error.message);
}

const BATCH = 100;

async function lookup(ids: string[], country: "jp" | "cn") {
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?id=${ids.join(",")}&country=${country}`, { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "IdeaOS/1.0" } });
    return res.ok ? parseLookup(await res.json()) : null;
  } catch {
    return null;
  }
}

type WatchRow = WatchState & { app_id: string; name: string };

/** 把榜单上见过、还没在看的 App 加进来，然后全部查一遍。返回查了几个、记了几件事。 */
export async function refreshAppWatch(today: string): Promise<{ checked: number; events: number }> {
  const [chart, watched] = await Promise.all([
    selectAll<{ source_id: string; title: string | null; fetched_at: string }>((a, b) =>
      supabaseAdmin.from("external_signals").select("source_id, title, fetched_at").eq("source", CN_APP_SOURCE).order("id").range(a, b)
    ),
    selectAll<WatchRow>((a, b) => supabaseAdmin.from("app_watch").select("app_id, name, in_jp, has_ja, checked_on").order("app_id").range(a, b)),
  ]);
  if (watched.error) throw new Error(missing(watched.error) ? WATCH_MISSING : watched.error.message);
  if (chart.error) throw new Error(chart.error.message);
  const known = new Set(watched.data.map((w) => w.app_id));
  const fresh = chart.data
    .filter((c) => !known.has(c.source_id))
    .map((c) => ({ app_id: c.source_id, name: appNameFromChartTitle(c.title ?? c.source_id), first_seen: c.fetched_at.slice(0, 10) }));
  if (fresh.length > 0) {
    const { error } = await supabaseAdmin.from("app_watch").upsert(fresh, { onConflict: "app_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  const rows: WatchRow[] = [
    ...watched.data,
    ...fresh.map((f) => ({ app_id: f.app_id, name: f.name, in_jp: null, has_ja: null, checked_on: null })),
  ].filter((r) => r.checked_on !== today);

  let checked = 0;
  let events = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const jp = await lookup(batch.map((r) => r.app_id), "jp");
    if (!jp) continue;
    // 日本区没有的，到中国区查语言（同一个 App 两个区的语言一样）
    const notInJp = batch.filter((r) => !jp.has(r.app_id)).map((r) => r.app_id);
    const cn = notInJp.length > 0 ? await lookup(notInJp, "cn") : new Map();
    for (const r of batch) {
      const hit = jp.get(r.app_id) ?? cn?.get(r.app_id) ?? null;
      const { patch, events: happened } = watchTransition(r, { inJp: jp.has(r.app_id), hasJa: hit ? hit.hasJa : null }, today);
      if (hit) Object.assign(patch, { developer: hit.developer || null, url: hit.url || null });
      const { error } = await supabaseAdmin.from("app_watch").update(patch).eq("app_id", r.app_id);
      if (error) throw new Error(error.message);
      checked += 1;
      if (happened.length === 0) continue;
      const name = hit?.name || r.name;
      const { error: insertError } = await supabaseAdmin.from("external_signals").upsert(
        happened.map((e) => ({
          source: APP_JP_SOURCE,
          source_id: `${r.app_id}:${e}:${today}`,
          url: hit?.url || null,
          title: `上过中国 App 榜的「${name}」${EVENT_LABELS[e]}`,
          raw_text: `「${name}」${hit?.developer ? `（开发者：${hit.developer}）` : ""}${EVENT_LABELS[e]}（${today} 查到；之前查的时候还没有）。中国公司要进日本，常常先在日本上架、加日语，几个月后才有正式的消息。`,
          published_at: new Date().toISOString(),
        })),
        { onConflict: "source,source_id", ignoreDuplicates: true }
      );
      if (insertError) throw new Error(insertError.message);
      events += happened.length;
    }
  }
  return { checked, events };
}

export type WatchSummary = {
  total: number;
  inJp: number;
  withJa: number;
  recent: { app_id: string; name: string; developer: string | null; url: string | null; jp_since: string | null; ja_since: string | null }[];
};

/** 领先指标页：一共看着几个、几个已经在日本上架、几个支持日语，最近 90 天变了的。迁移没跑返回 null。 */
export async function appWatchSummary(): Promise<WatchSummary | null> {
  const { data, error } = await selectAll((a, b) => supabaseAdmin.from("app_watch").select("app_id, name, developer, url, in_jp, has_ja, jp_since, ja_since").order("app_id").range(a, b));
  if (error) {
    if (missing(error)) return null;
    throw new Error(error.message);
  }
  const rows = (data ?? []) as (WatchSummary["recent"][number] & { in_jp: boolean | null; has_ja: boolean | null })[];
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const latest = (r: { jp_since: string | null; ja_since: string | null }) => [r.jp_since ?? "", r.ja_since ?? ""].sort()[1];
  return {
    total: rows.length,
    inJp: rows.filter((r) => r.in_jp).length,
    withJa: rows.filter((r) => r.has_ja).length,
    recent: rows.filter((r) => latest(r) >= since).sort((a, b) => latest(b).localeCompare(latest(a))),
  };
}
