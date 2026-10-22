/**
 * 预测账本（浏览器端也要用的部分，不碰数据库、不碰网络）：题目和各方概率的样子、市场接口的解析、
 * 挑哪些市场题、三个 AI 怎么合成一个数、怎么记分、校准表。
 *
 * 原则 1 例外四（经用户同意，2026-10-22）：对世界事件的预测可以有概率和分数 ——
 * 只用于 AI、他、市场对世界事件的预测；分数全部由代码算、能看到是哪几道题；样本不够只显示件数；对想法/机会仍然不打分。
 */

export type ForecastKind = "market" | "data" | "business" | "arrival";
export type ForecastSource = "ai_outside" | "ai_inside" | "ai_devil" | "ai" | "me" | "market";

export const KIND_LABELS: Record<ForecastKind, string> = { market: "市场题", data: "数据题", business: "生意题", arrival: "到日本题" };

/** 到期要程序查证据、出题的人确认的几种题（生意题、到日本题）。 */
export function needsConfirm(kind: ForecastKind): boolean {
  return kind === "business" || kind === "arrival";
}
export const SOURCE_LABELS: Record<ForecastSource, string> = {
  ai_outside: "AI · 先看基准率",
  ai_inside: "AI · 只看这件事",
  ai_devil: "AI · 唱反调",
  ai: "AI（三个取中间）",
  me: "你",
  market: "市场",
};

/** 出题时给的类别（AI 只能从这几个里挑）。 */
export const FORECAST_CATEGORIES = ["日本经济", "日本政治社会", "中国", "中日关系", "科技", "世界"] as const;

export type MarketRef = { platform: "manifold" | "polymarket"; id: string; url: string };

export type ForecastQuestion = {
  id: string;
  kind: ForecastKind;
  title: string;
  original_title: string | null;
  criteria: string;
  resolve_on: string;
  category: string | null;
  /** 到日本题还带着：哪个方向的差距、时差图谱的类别和那一类的历史（base，一句话）。 */
  source: Partial<MarketRef> & { signal_id?: string; headline?: string; side?: string; atlas?: string; base?: string };
  context: string | null;
  status: "open" | "resolved" | "void";
  outcome: boolean | null;
  resolved_at: string | null;
  resolution_note: string | null;
  resolution_url: string | null;
  pending: PendingResolution | null;
  revealed_at: string | null;
  created_at: string;
};

export type Forecast = { question_id: string; source: ForecastSource; probability: number; reason: string | null; made_at: string };

export type PendingResolution = {
  suggested: "yes" | "no" | "unclear";
  note: string;
  evidence: { url: string; title: string; excerpt: string }[];
  checked_on: string;
};

/** 他押的时候点的几档（概率）。 */
export const MY_TIERS = [0.05, 0.15, 0.3, 0.5, 0.7, 0.85, 0.95] as const;

export function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

// ── 市场 ────────────────────────────────────────────────────────────────────

export type MarketCandidate = {
  platform: "manifold" | "polymarket";
  id: string;
  question: string;
  url: string;
  /** 到期（YYYY-MM-DD）。 */
  closes: string;
  probability: number;
  /** 有多少人在押（Manifold 是下注人数，Polymarket 是成交额）。 */
  depth: number;
  description: string;
};

/** Manifold 的一个市场（search-markets 或 /v0/market/{id}）。不是二选一的返回 null。 */
export function parseManifoldMarket(m: unknown): (MarketCandidate & { resolved: "yes" | "no" | "void" | null }) | null {
  const o = (m ?? {}) as Record<string, unknown>;
  if (o.outcomeType !== "BINARY" || typeof o.id !== "string" || typeof o.question !== "string") return null;
  const close = typeof o.closeTime === "number" ? new Date(o.closeTime).toISOString().slice(0, 10) : "";
  const resolution = typeof o.resolution === "string" ? o.resolution : null;
  return {
    platform: "manifold",
    id: o.id,
    question: o.question,
    url: typeof o.url === "string" ? o.url : `https://manifold.markets/market/${o.id}`,
    closes: close,
    probability: typeof o.probability === "number" ? o.probability : NaN,
    depth: typeof o.uniqueBettorCount === "number" ? o.uniqueBettorCount : 0,
    description: typeof o.textDescription === "string" ? o.textDescription.slice(0, 1500) : "",
    resolved: o.isResolved === true ? (resolution === "YES" ? "yes" : resolution === "NO" ? "no" : "void") : null,
  };
}

function jsonList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v !== "string") return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Polymarket 的一个市场（gamma 接口）。只认 Yes/No 两个结果的；eventSlug 用来拼网址。 */
export function parsePolymarketMarket(m: unknown, eventSlug?: string): (MarketCandidate & { resolved: "yes" | "no" | "void" | null }) | null {
  const o = (m ?? {}) as Record<string, unknown>;
  const outcomes = jsonList(o.outcomes);
  const prices = jsonList(o.outcomePrices).map(Number);
  if (typeof o.id !== "string" || typeof o.question !== "string" || outcomes.length !== 2 || outcomes[0] !== "Yes" || prices.length !== 2) return null;
  const closed = o.closed === true || o.closed === "true";
  const settled = closed && o.umaResolutionStatus === "resolved";
  const resolved = settled ? (prices[0] === 1 ? "yes" : prices[0] === 0 ? "no" : "void") : null;
  const slug = eventSlug ?? (typeof o.slug === "string" ? o.slug : "");
  return {
    platform: "polymarket",
    id: o.id,
    question: o.question,
    url: slug ? `https://polymarket.com/event/${slug}` : "https://polymarket.com",
    closes: typeof o.endDate === "string" ? o.endDate.slice(0, 10) : "",
    probability: prices[0],
    depth: Number(o.volumeNum ?? o.volume ?? 0) || 0,
    description: typeof o.description === "string" ? o.description.slice(0, 1500) : "",
    resolved,
  };
}

/** 两个日子之间隔几天。 */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

export const MARKET_RULES = {
  /** 太快到期的来不及押，太远的对账要等太久。 */
  minDays: 14,
  maxDays: 400,
  /** 市场几乎定了的题学不到东西。 */
  minP: 0.07,
  maxP: 0.93,
  minManifoldBettors: 10,
  minPolymarketVolume: 5000,
};

/** 跟日本有关的题（先挑这些，不够再挑中国的）。 */
export function isJapanQuestion(q: string): boolean {
  return /\b(japan|japanese|yen|boj|bank of japan|nikkei|tokyo|osaka|takaichi|ishiba)\b/i.test(q);
}

/** 「落在 X 到 Y 之间吗」这种分段题（一组好几道，单看一道学不到什么），不收。 */
export function isBracketQuestion(q: string): boolean {
  return /\bbetween\b[^?]*\band\b/i.test(q) || /\b(\d+(\.\d+)?)\s*[-–]\s*(\d+(\.\d+)?)\s*%/.test(q);
}

/**
 * 从搜到的市场里挑可以进账本的：二选一、还开着、到期在两周到一年多之间、市场没几乎定、有足够多人在押、还没进过账本、
 * 不是分段题。一次最多挑 n 道，同一个事件（同一个网址）只挑一道：一半挑最快到期的（反馈快），一半挑押的人最多的。
 */
export function pickMarkets(candidates: MarketCandidate[], today: string, already: Set<string>, n: number): MarketCandidate[] {
  const ok = candidates.filter((c) => {
    if (already.has(`${c.platform}:${c.id}`) || !c.closes || !Number.isFinite(c.probability)) return false;
    const days = daysBetween(today, c.closes);
    if (days < MARKET_RULES.minDays || days > MARKET_RULES.maxDays) return false;
    if (c.probability < MARKET_RULES.minP || c.probability > MARKET_RULES.maxP) return false;
    if (isBracketQuestion(c.question)) return false;
    return c.platform === "manifold" ? c.depth >= MARKET_RULES.minManifoldBettors : c.depth >= MARKET_RULES.minPolymarketVolume;
  });
  const unique = Array.from(new Map(ok.map((c) => [`${c.platform}:${c.id}`, c])).values());
  const soonest = [...unique].sort((a, b) => a.closes.localeCompare(b.closes));
  const deepest = [...unique].sort((a, b) => b.depth - a.depth);
  const out: MarketCandidate[] = [];
  for (let i = 0; out.length < n && i < unique.length; i += 1) {
    for (const list of [soonest, deepest]) {
      const c = list[i];
      if (c && out.length < n && !out.some((x) => (x.platform === c.platform && x.id === c.id) || (c.url && x.url === c.url))) out.push(c);
    }
  }
  return out;
}

// ── 合成和记分 ─────────────────────────────────────────────────────────────

const clampP = (p: number) => Math.min(0.99, Math.max(0.01, p));
const logit = (p: number) => Math.log(clampP(p) / (1 - clampP(p)));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** 几个 AI 的概率取中间值（在对数几率上取，三个时就是中间那个）。 */
export function medianProbability(ps: number[]): number | null {
  const xs = ps.filter((p) => Number.isFinite(p) && p > 0 && p < 1).map(logit).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = xs.length % 2 === 1 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
  return Math.round(sigmoid(mid) * 1000) / 1000;
}

/** 一道题的 Brier 分：(概率 − 结果)²，0 最好，押 50% 永远是 0.25。 */
export function brier(p: number, outcome: boolean): number {
  return (p - (outcome ? 1 : 0)) ** 2;
}

/** 样本够了才显示分数和比率（例外四：样本不够只显示件数）。 */
export const MIN_SCORED = 10;
export const MIN_BIN = 5;

export type SourceScore = { source: ForecastSource; n: number; brier: number | null };

/** 每一方在已对账的题上的平均 Brier 分；不够 MIN_SCORED 道只给件数。 */
export function scoreBySource(questions: Pick<ForecastQuestion, "id" | "status" | "outcome">[], forecasts: Forecast[], sources: ForecastSource[]): SourceScore[] {
  const outcome = new Map(questions.filter((q) => q.status === "resolved" && q.outcome !== null).map((q) => [q.id, q.outcome as boolean]));
  return sources.map((source) => {
    const scored = forecasts.filter((f) => f.source === source && outcome.has(f.question_id));
    const n = scored.length;
    const b = n > 0 ? scored.reduce((s, f) => s + brier(f.probability, outcome.get(f.question_id) as boolean), 0) / n : null;
    return { source, n, brier: n >= MIN_SCORED && b !== null ? Math.round(b * 1000) / 1000 : null };
  });
}

export type HeadToHead = { a: ForecastSource; b: ForecastSource; n: number; aBetter: number; bBetter: number; tie: number; aBrier: number | null; bBrier: number | null };

/** 两方在同一批题上比（两边都押过、已对账的题）：各自平均分、哪边离结果更近的有几道。 */
export function headToHead(questions: Pick<ForecastQuestion, "id" | "status" | "outcome">[], forecasts: Forecast[], a: ForecastSource, b: ForecastSource): HeadToHead {
  const outcome = new Map(questions.filter((q) => q.status === "resolved" && q.outcome !== null).map((q) => [q.id, q.outcome as boolean]));
  const pa = new Map(forecasts.filter((f) => f.source === a).map((f) => [f.question_id, f.probability]));
  const pb = new Map(forecasts.filter((f) => f.source === b).map((f) => [f.question_id, f.probability]));
  let n = 0;
  let aBetter = 0;
  let bBetter = 0;
  let tie = 0;
  let sa = 0;
  let sb = 0;
  for (const [id, o] of Array.from(outcome)) {
    if (!pa.has(id) || !pb.has(id)) continue;
    const ba = brier(pa.get(id) as number, o);
    const bb = brier(pb.get(id) as number, o);
    n += 1;
    sa += ba;
    sb += bb;
    if (Math.abs(ba - bb) < 1e-9) tie += 1;
    else if (ba < bb) aBetter += 1;
    else bBetter += 1;
  }
  const show = n >= MIN_SCORED;
  return { a, b, n, aBetter, bBetter, tie, aBrier: show ? Math.round((sa / n) * 1000) / 1000 : null, bBrier: show ? Math.round((sb / n) * 1000) / 1000 : null };
}

export type CalibrationBin = { lo: number; hi: number; n: number; happened: number; meanP: number | null };

/** 校准表：按说的概率分五格（0–20%……80–100%），每格几道、真的发生了几道。比率由页面在 n 够时才算。 */
export function calibrationBins(questions: Pick<ForecastQuestion, "id" | "status" | "outcome">[], forecasts: Forecast[], source: ForecastSource): CalibrationBin[] {
  const outcome = new Map(questions.filter((q) => q.status === "resolved" && q.outcome !== null).map((q) => [q.id, q.outcome as boolean]));
  const bins: CalibrationBin[] = [0, 0.2, 0.4, 0.6, 0.8].map((lo) => ({ lo, hi: lo + 0.2, n: 0, happened: 0, meanP: null }));
  const sums = bins.map(() => 0);
  for (const f of forecasts) {
    if (f.source !== source || !outcome.has(f.question_id)) continue;
    const i = Math.min(4, Math.floor(f.probability / 0.2));
    bins[i].n += 1;
    sums[i] += f.probability;
    if (outcome.get(f.question_id)) bins[i].happened += 1;
  }
  return bins.map((b, i) => ({ ...b, meanP: b.n > 0 ? Math.round((sums[i] / b.n) * 100) / 100 : null }));
}

/** 生意题对账建议的日子：到期那天以后才查。 */
export function isDue(q: Pick<ForecastQuestion, "status" | "resolve_on">, today: string): boolean {
  return q.status === "open" && q.resolve_on <= today;
}

export type BoardSections = {
  /** 等他判断：还开着、他没判断过、没先看答案、还没到期。 */
  toForecast: ForecastQuestion[];
  /** 生意题到期了、程序查好了证据，等出题的主账号确认（别的账号看不到这一组）。 */
  toConfirm: ForecastQuestion[];
  /** 他判断过（或先看了答案）、还没对账的。 */
  open: ForecastQuestion[];
  /** 对过账（或作废）的，新的在前。 */
  done: ForecastQuestion[];
  /** done 里最近 recentDays 天对账、他判断过或看过答案的：「今天」一页给他看谁说中了。 */
  justResolved: ForecastQuestion[];
};

/** 预测页和「今天」一页用同一套分组。 */
export function boardSections(
  board: { questions: ForecastQuestion[]; forecasts: Forecast[]; canConfirm: boolean },
  today: string,
  recentDays = 7
): BoardSections {
  const { questions, forecasts } = board;
  const mine = new Set(forecasts.filter((f) => f.source === "me").map((f) => f.question_id));
  const toForecast = questions.filter((q) => q.status === "open" && !q.revealed_at && !mine.has(q.id) && daysBetween(today, q.resolve_on) > 0);
  const toConfirm = board.canConfirm ? questions.filter((q) => q.status === "open" && needsConfirm(q.kind) && q.pending) : [];
  const open = questions.filter((q) => q.status === "open" && (q.revealed_at || mine.has(q.id)) && !(board.canConfirm && needsConfirm(q.kind) && q.pending));
  const done = questions.filter((q) => q.status !== "open").sort((a, b) => (b.resolved_at ?? "").localeCompare(a.resolved_at ?? ""));
  const justResolved = done.filter(
    (q) => q.resolved_at && daysBetween(q.resolved_at.slice(0, 10), today) <= recentDays && (mine.has(q.id) || q.revealed_at)
  );
  return { toForecast, toConfirm, open, done, justResolved };
}

/** 这道题各方给的几成（没有的那方是 null）。 */
export function sidesOf(forecasts: Forecast[], questionId: string): Record<"me" | "ai" | "market", number | null> {
  const get = (s: ForecastSource) => forecasts.find((f) => f.question_id === questionId && f.source === s)?.probability ?? null;
  return { me: get("me"), ai: get("ai"), market: get("market") };
}
