import { supabaseAdmin } from "@/lib/supabase";
import { thinkSlowThen } from "@/lib/ai";
import type { BriefItem } from "./brief";
import { tokyoToday } from "./brief";
import { listGapBoard } from "./gaps";
import { weekStartOf } from "./issue-shared";
import { fetchSlowSeries, SLOW_VARIABLES, slowSummary } from "./slow";
import type { SlowThen } from "./slow-then-shared";

export * from "./slow-then-shared";

/**
 * 慢变量 · 知道这个之后呢（and then?）：每个慢变量一周推一次（点了才推）。
 * 拿代码算好的数字和走势，写两三条"如果这个势头继续"的链，每条带对生意的意思、去哪看、什么情况下会断；
 * 再标出这一周报告里哪几条新闻是它的表面、差距清单里哪几条靠它撑着（标题由代码核对，对不上的丢掉）。
 */

const MISSING_MIGRATION = "迁移 086 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/086_signal_slow_thens.sql。";

/** 给 AI 看的新闻、清单最多几条（太多了它挑不准，也费钱）。 */
const MAX_NEWS = 40;
const MAX_GAPS = 30;

function missing(error: { message: string }): boolean {
  return /signal_slow_thens/.test(error.message);
}

/** 这一周推过的（键是慢变量的 key）。表还没建返回空。 */
export async function loadSlowThens(userId: string, weekStart = weekStartOf(tokyoToday())): Promise<Record<string, SlowThen>> {
  const { data, error } = await supabaseAdmin.from("signal_slow_thens").select("key, analysis").eq("user_id", userId).eq("week_start", weekStart);
  if (error) {
    if (missing(error)) return {};
    throw new Error(error.message);
  }
  return Object.fromEntries((data ?? []).map((r) => [r.key as string, r.analysis as SlowThen]));
}

/** 这一周报告里的新闻（新的在前，同一条只留一次；"也值得一看"那一行不算）。 */
async function weekNews(userId: string): Promise<{ signal_id: string; title: string }[]> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from("signal_briefs")
    .select("items")
    .eq("user_id", userId)
    .gte("brief_date", weekAgo)
    .order("brief_date", { ascending: false });
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  const out: { signal_id: string; title: string }[] = [];
  for (const row of data ?? []) {
    const items = Array.isArray(row.items) ? (row.items as BriefItem[]) : [];
    for (const it of items) {
      if (!it || it.extra || !it.signal_id || !it.title || seen.has(it.signal_id)) continue;
      seen.add(it.signal_id);
      out.push({ signal_id: it.signal_id, title: it.title });
    }
  }
  return out.slice(0, MAX_NEWS);
}

export async function thinkSlowVariable(userId: string, key: string): Promise<SlowThen> {
  const variable = SLOW_VARIABLES.find((v) => v.key === key);
  if (!variable) throw new Error("不认识这个慢变量");
  const today = tokyoToday();
  const [series, news, board] = await Promise.all([fetchSlowSeries(variable), weekNews(userId), listGapBoard(userId, today)]);
  const summary = slowSummary(series);
  if (!summary) throw new Error("这次没取到这个数字，晚点再来");
  const gaps = [...board.sides.japan.open.map((g) => ({ ...g, side: "japan" as const })), ...board.sides.us.open.map((g) => ({ ...g, side: "us" as const }))]
    .slice(0, MAX_GAPS)
    .map((g) => ({ signal_id: g.signal_id, side: g.side, headline: g.headline }));

  const draft = await thinkSlowThen({
    label: variable.label,
    why: variable.why,
    summary,
    news: news.map((n) => n.title),
    gaps: gaps.map((g) => g.headline),
  });
  const analysis: SlowThen = {
    summary,
    chains: draft.chains,
    surfaces: draft.surfaces.map((s) => ({ signal_id: news[s.i].signal_id, title: news[s.i].title, how: s.how })),
    gaps: draft.gaps.map((g) => ({ signal_id: gaps[g.i].signal_id, side: gaps[g.i].side, headline: gaps[g.i].headline, how: g.how })),
    created_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from("signal_slow_thens")
    .upsert({ user_id: userId, week_start: weekStartOf(today), key, analysis }, { onConflict: "user_id,week_start,key" });
  if (error) {
    if (missing(error)) throw new Error(MISSING_MIGRATION);
    throw new Error(error.message);
  }
  return analysis;
}
