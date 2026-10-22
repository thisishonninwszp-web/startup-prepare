import { supabaseAdmin } from "@/lib/supabase";
import { parsePageviews } from "./attention-shared";
import { parseYahooChart } from "./fast";
import { toTokyoDay, type DailyClose, type MonthViews } from "./data-questions-shared";

/**
 * 数据题的取数（kind = data，出题和对账在 forecast.ts）：Yahoo 的公开图表接口（日线）、Wikimedia 的按月浏览数。都不用 Key。
 */

const UA = "IdeaOS/1.0 (https://github.com/thisishonninwszp-web/startup-prepare)";

async function getJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { "User-Agent": UA } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** 日线收盘（日本日期）。取不到返回 null。 */
export async function yahooDaily(symbol: string, range = "3y"): Promise<DailyClose[] | null> {
  const json = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`);
  if (!json) return null;
  const points = parseYahooChart(json).map((p) => ({ day: toTokyoDay(p.t), close: p.close }));
  return points.length > 0 ? points : null;
}

/** 日文维基一页从 from 到 to（YYYY-MM）每个月的浏览数（真人访问、所有设备）。取不到返回 null。 */
export async function wikiMonths(title: string, from: string, to: string): Promise<MonthViews[] | null> {
  const page = encodeURIComponent(title.replace(/ /g, "_"));
  const json = await getJson(
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/ja.wikipedia/all-access/user/${page}/monthly/${from.replace("-", "")}0100/${to.replace("-", "")}0100`
  );
  if (!json) return null;
  return parsePageviews(json);
}

/** 他「听一听」过的差距清单那几条里，找到了日文维基页面的（标题去重）。 */
export async function wikiTopics(userId: string): Promise<{ title: string; signalId: string }[]> {
  const { data, error } = await supabaseAdmin.from("signal_gap_voices").select("signal_id, analysis").eq("user_id", userId).limit(500);
  if (error) return [];
  const out = new Map<string, string>();
  for (const r of (data ?? []) as { signal_id: string; analysis: { attention?: { wiki?: { title?: string } | null } | null } | null }[]) {
    const title = r.analysis?.attention?.wiki?.title;
    if (title && !out.has(title)) out.set(title, r.signal_id);
  }
  return Array.from(out.entries()).map(([title, signalId]) => ({ title, signalId }));
}
