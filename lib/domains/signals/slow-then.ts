import { supabaseAdmin } from "@/lib/supabase";
import { thinkSlowThen, windSlowVariables } from "@/lib/ai";
import type { BriefItem } from "./brief";
import { tokyoToday } from "./brief";
import { listGapBoard } from "./gaps";
import { weekStartOf } from "./issue-shared";
import { fetchSlowSeries, SLOW_VARIABLES, slowSummary } from "./slow";
import { WIND_KEY, type SlowThen, type SlowWind, type WindLink } from "./slow-then-shared";
import type { GapSide } from "./gaps-shared";

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
  return Object.fromEntries((data ?? []).filter((r) => r.key !== WIND_KEY).map((r) => [r.key as string, r.analysis as SlowThen]));
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

// ── 你手上的东西：顺风还是逆风 ─────────────────────────────────────────────

/** 给 AI 看的东西最多几样（清单 + 想法）。 */
const MAX_WIND_GAPS = 30;
const MAX_WIND_IDEAS = 20;

/** 最近一次看的结果（不限这一周：页面上写明是哪天看的）。表还没建、没看过返回 null。 */
export async function loadSlowWind(userId: string): Promise<SlowWind | null> {
  const { data, error } = await supabaseAdmin
    .from("signal_slow_thens")
    .select("analysis")
    .eq("user_id", userId)
    .eq("key", WIND_KEY)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (missing(error)) return null;
    throw new Error(error.message);
  }
  return (data?.analysis as SlowWind | undefined) ?? null;
}

/**
 * 一次看完所有慢变量：差距清单（三个方向，还开着的）和想法库（没归档的）里，哪些顺着、哪些逆着哪个数字走。
 * 编号加照抄的标题由代码核对，对不上的丢掉。存成这一周 key = "_wind" 的那一行。
 */
export async function computeSlowWind(userId: string): Promise<SlowWind> {
  const today = tokyoToday();
  const [series, board, ideas] = await Promise.all([
    Promise.all(SLOW_VARIABLES.map((v) => fetchSlowSeries(v))),
    listGapBoard(userId, today),
    supabaseAdmin
      .from("ideas")
      .select("id, title, hypothesis, status")
      .eq("user_id", userId)
      .neq("status", "归档")
      .order("last_activity_at", { ascending: false })
      .limit(MAX_WIND_IDEAS),
  ]);
  if (ideas.error) throw new Error(ideas.error.message);
  const variables = series.flatMap((s) => {
    const summary = slowSummary(s);
    return summary ? [{ key: s.variable.key, label: s.variable.label, summary }] : [];
  });
  if (variables.length === 0) throw new Error("这次一个慢变量的数字都没取到，晚点再来");

  type Item = { kind: WindLink["kind"]; ref: string; side?: GapSide; title: string; text: string };
  const gapItems: Item[] = (["japan", "us", "china"] as GapSide[])
    .flatMap((side) => board.sides[side].open.map((g) => ({ kind: "gap" as const, ref: g.signal_id, side, title: g.headline, text: g.japan })))
    .slice(0, MAX_WIND_GAPS);
  const ideaItems: Item[] = (ideas.data ?? [])
    .filter((i) => typeof i.title === "string" && i.title.trim())
    .map((i) => {
      const h = (i.hypothesis ?? {}) as { solution?: string };
      return { kind: "idea" as const, ref: i.id as string, title: (i.title as string).trim(), text: `想法库里的想法${h.solution ? `：${h.solution.slice(0, 80)}` : ""}` };
    });
  const items = [...gapItems, ...ideaItems];

  const draft = await windSlowVariables({ variables, items: items.map((it) => ({ title: it.title, text: it.text })) });
  const wind: SlowWind = {
    links: draft.map((l) => {
      const it = items[l.item];
      return { key: l.key, dir: l.dir, kind: it.kind, ref: it.ref, ...(it.side ? { side: it.side } : {}), title: it.title, why: l.why };
    }),
    created_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from("signal_slow_thens")
    .upsert({ user_id: userId, week_start: weekStartOf(today), key: WIND_KEY, analysis: wind }, { onConflict: "user_id,week_start,key" });
  if (error) {
    if (missing(error)) throw new Error(MISSING_MIGRATION);
    throw new Error(error.message);
  }
  return wind;
}

