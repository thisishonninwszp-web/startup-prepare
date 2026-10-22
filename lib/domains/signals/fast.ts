/**
 * 快变量：日经平均、美元日元、人民币日元、原油、美国十年国债利率。每天都在动，平时不用看；
 * 只有一周动得特别大的时候提醒一句 —— "近两年里一周这么大的变化只有几次"。
 * 只数次数（拿最近一周的变化，跟近两年每一周比），不算概率、不做预测、不给投资建议。
 * 数据来自 Yahoo Finance 的公开图表接口（周线），取不到就当这一项今天没有。
 * 预测账本的数据题（forecast.ts 的 createDataQuestions）用同样的数出「一周后会不会高于今天」—— 那是原则 1 例外四，
 * 只练判断准不准，不是投资建议；这里的提醒照旧只数次数。
 */

export type FastVariable = {
  key: string;
  symbol: string;
  label: string;
  /** pct：按涨跌幅比；diff：按差值比（利率用百分点）。 */
  mode: "pct" | "diff";
  digits: number;
};

export const FAST_VARIABLES: FastVariable[] = [
  { key: "nikkei", symbol: "^N225", label: "日经平均", mode: "pct", digits: 0 },
  { key: "usdjpy", symbol: "JPY=X", label: "美元日元", mode: "pct", digits: 2 },
  { key: "cnyjpy", symbol: "CNYJPY=X", label: "人民币日元", mode: "pct", digits: 2 },
  { key: "oil", symbol: "CL=F", label: "原油（WTI）", mode: "pct", digits: 2 },
  { key: "us10y", symbol: "^TNX", label: "美国十年国债利率", mode: "diff", digits: 2 },
];

export type FastPoint = { t: number; close: number };

export type FastMove = {
  variable: FastVariable;
  latest: FastPoint;
  /** 一周前（最近一个不晚于 latest 前 6 天的点）。 */
  prev: FastPoint;
  /** pct 是百分比（+1.5 = 涨 1.5%），diff 是差值。 */
  change: number;
  /** 拿来比的历史周数。 */
  weeks: number;
  /** 其中变化幅度不小于这一周的有几周。 */
  asBig: number;
};

/** 少于一年的数据不比；两年里一周这么大的不超过这么多次才提醒。 */
export const MIN_WEEKS = 52;
export const ALERT_MAX_TIMES = 4;

function changeOf(v: FastVariable, from: number, to: number): number {
  return v.mode === "pct" ? ((to - from) / from) * 100 : to - from;
}

/** points 按时间从旧到新。最后一个点常是"本周到现在"，跟一周前的点比；历史用相邻两周比。 */
export function weeklyMove(v: FastVariable, points: FastPoint[]): FastMove | null {
  const pts = points.filter((p) => Number.isFinite(p.close) && p.close > 0);
  if (pts.length < 3) return null;
  const latest = pts[pts.length - 1];
  let prevIdx = -1;
  for (let i = pts.length - 2; i >= 0; i--) {
    if (pts[i].t <= latest.t - 6 * 86_400) {
      prevIdx = i;
      break;
    }
  }
  if (prevIdx < 1) return null;
  const prev = pts[prevIdx];
  const change = changeOf(v, prev.close, latest.close);
  const history: number[] = [];
  for (let i = 1; i <= prevIdx; i++) history.push(changeOf(v, pts[i - 1].close, pts[i].close));
  return {
    variable: v,
    latest,
    prev,
    change,
    weeks: history.length,
    asBig: history.filter((h) => Math.abs(h) >= Math.abs(change)).length,
  };
}

export function isUnusual(m: FastMove): boolean {
  return m.weeks >= MIN_WEEKS && m.asBig <= ALERT_MAX_TIMES && m.change !== 0;
}

/** "美元日元这一周+2.31%（152.10 → 155.61），近两年 104 周里，一周动这么大的只有 2 次。"平常的周说"算平常"。 */
export function describeMove(m: FastMove): string {
  const { variable: v } = m;
  const sign = m.change > 0 ? "+" : "";
  const amount = v.mode === "pct" ? `${sign}${m.change.toFixed(2)}%` : `${sign}${m.change.toFixed(2)} 个百分点`;
  const fmt = (x: number) => x.toLocaleString("ja-JP", { minimumFractionDigits: v.digits, maximumFractionDigits: v.digits });
  const head = `${v.label}这一周${amount}（${fmt(m.prev.close)} → ${fmt(m.latest.close)}）`;
  if (m.asBig > ALERT_MAX_TIMES) return `${head}，近两年 ${m.weeks} 周里有 ${m.asBig} 周动得至少这么大，算平常。`;
  const times = m.asBig === 0 ? "一次都没有" : `只有 ${m.asBig} 次`;
  return `${head}，近两年 ${m.weeks} 周里，一周动这么大的${times}。`;
}

/** 解析 Yahoo 图表接口的返回。 */
export function parseYahooChart(json: unknown): FastPoint[] {
  const result = (json as { chart?: { result?: unknown[] } })?.chart?.result?.[0] as
    | { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }
    | undefined;
  const ts = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const out: FastPoint[] = [];
  ts.forEach((t, i) => {
    const c = closes[i];
    if (typeof c === "number") out.push({ t, close: c });
  });
  return out;
}

export async function fetchFastMove(v: FastVariable): Promise<FastMove | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(v.symbol)}?range=2y&interval=1wk`,
      { headers: { "User-Agent": "Mozilla/5.0 (IdeaOS signals)" }, next: { revalidate: 3600 }, signal: AbortSignal.timeout(15_000) }
    );
    if (!res.ok) return null;
    return weeklyMove(v, parseYahooChart(await res.json()));
  } catch {
    return null;
  }
}

export async function fetchFastMoves(): Promise<FastMove[]> {
  const all = await Promise.all(FAST_VARIABLES.map(fetchFastMove));
  return all.filter((m): m is FastMove => m !== null);
}

/** 只要动得不寻常的那几项。 */
export async function unusualFastMoves(): Promise<FastMove[]> {
  return (await fetchFastMoves()).filter(isUnusual);
}
