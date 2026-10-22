import { daysBetween, isBracketQuestion, isJapanQuestion } from "./forecast-shared";

/**
 * 历史回测（迁移 094；原则 1 例外四：只用于对世界事件的预测）—— 不碰数据库、不碰网络的部分。
 *
 * 项目用的 AI（Gemini 2.5 Flash）知识停在 2025 年 1 月：2025 年 3 月以后开、现在已经结算的预测市场题，它不知道答案。
 * 选开盘后、结算前的某一天当「今天」，只给那天以前的新闻，问它几成；跟那天市场给的几成、后来的结果比。
 */

/** 只收这天以后开的市场（AI 的知识停在 2025 年 1 月，留一个月余量）。 */
export const HISTORY_EARLIEST = "2025-03-01";
/** 题库攒到这么多道就不再加（一道要调四次 AI，约 0.0075 美元；500 道约 4 美元，学校准要 100 道就够）。 */
export const HISTORY_TARGET = 500;
/** 「今天」那天市场已经几乎定了的不收（太容易，学不到东西）。 */
export const HISTORY_MIN_P = 0.03;
export const HISTORY_MAX_P = 0.97;
/** 每天练几道。 */
export const DAILY_DRILL = 10;

export type HistoryCandidate = {
  platform: "manifold" | "polymarket";
  marketId: string;
  url: string;
  token: string | null;
  title: string;
  description: string;
  createdOn: string;
  resolveOn: string;
  outcome: boolean;
  depth: number;
};

const toDay = (v: unknown): string => {
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v).toISOString().slice(0, 10);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return "";
};

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

/** Manifold 搜索结果里已经结算成「会 / 不会」的二选一题（作废的、多选的返回 null）。 */
export function parseManifoldResolved(m: unknown): HistoryCandidate | null {
  const o = (m ?? {}) as Record<string, unknown>;
  if (o.outcomeType !== "BINARY" || typeof o.id !== "string" || typeof o.question !== "string") return null;
  if (o.resolution !== "YES" && o.resolution !== "NO") return null;
  const createdOn = toDay(o.createdTime);
  const resolveOn = toDay(o.resolutionTime ?? o.closeTime);
  if (!createdOn || !resolveOn) return null;
  return {
    platform: "manifold",
    marketId: o.id,
    url: typeof o.url === "string" ? o.url : `https://manifold.markets/market/${o.id}`,
    token: null,
    title: o.question,
    description: typeof o.textDescription === "string" ? o.textDescription.slice(0, 1500) : "",
    createdOn,
    resolveOn,
    outcome: o.resolution === "YES",
    depth: typeof o.uniqueBettorCount === "number" ? o.uniqueBettorCount : 0,
  };
}

/** Polymarket（gamma）里已经结算的 Yes/No 题。 */
export function parsePolymarketResolved(m: unknown): HistoryCandidate | null {
  const o = (m ?? {}) as Record<string, unknown>;
  const outcomes = jsonList(o.outcomes);
  const prices = jsonList(o.outcomePrices).map(Number);
  const tokens = jsonList(o.clobTokenIds);
  if (typeof o.id !== "string" || typeof o.question !== "string" || outcomes[0] !== "Yes" || outcomes.length !== 2) return null;
  if (o.umaResolutionStatus !== "resolved" || !(prices[0] === 1 || prices[0] === 0) || !tokens[0]) return null;
  const createdOn = toDay(o.startDate ?? o.createdAt);
  const resolveOn = toDay(o.closedTime ?? o.endDate);
  if (!createdOn || !resolveOn) return null;
  const events = Array.isArray(o.events) ? (o.events as { slug?: string }[]) : [];
  const slug = events[0]?.slug ?? (typeof o.slug === "string" ? o.slug : "");
  return {
    platform: "polymarket",
    marketId: o.id,
    url: slug ? `https://polymarket.com/event/${slug}` : "https://polymarket.com",
    token: tokens[0],
    title: o.question,
    description: typeof o.description === "string" ? o.description.slice(0, 1500) : "",
    createdOn,
    resolveOn,
    outcome: prices[0] === 1,
    depth: Number(o.volumeNum ?? o.volume ?? 0) || 0,
  };
}

/** 不收的题：体育、加密货币价格、「会不会说某个词 / 发几条推」、天气 —— 练了对他的判断没用。 */
export function isExcludedTopic(q: string): boolean {
  return (
    /\b(vs\.?|fifa|nba|nfl|mlb|nhl|ufc|f1|grand prix|premier league|champions league|world cup|super bowl|stanley cup|world series|wimbledon|open championship|tennis|golf|boxing|match|playoffs?|league|draft|mvp|ballon|olympics?)\b/i.test(q) ||
    /\b(bitcoin|btc|eth|ethereum|solana|sol|xrp|doge|dogecoin|crypto|token|airdrop|fdv|memecoin|pump\.fun|coin)\b/i.test(q) ||
    /\b(up or down|say|says|mention|mentions|tweets?|posts?|temperature|weather|rain|snow)\b/i.test(q)
  );
}

/** 先做哪些：跟日本、中国、经济、科技有关的在前。 */
export function historyPriority(q: string): number {
  let p = 0;
  if (isJapanQuestion(q)) p += 3;
  if (/\b(china|chinese|xi jinping|beijing|taiwan|hong kong|korea|korean|asia|asian)\b/i.test(q)) p += 2;
  if (/\b(fed|interest rates?|inflation|cpi|gdp|recession|unemployment|tariffs?|trade|oil|stocks?|s&p|nasdaq|ipo|bank|yen|dollar|economy)\b/i.test(q)) p += 2;
  if (/\b(ai|openai|anthropic|google|apple|microsoft|nvidia|tesla|meta|amazon|tiktok|bytedance|chip|semiconductor|robot|startup)\b/i.test(q)) p += 1;
  if (/\b(election|prime minister|president|parliament|congress|minister|government)\b/i.test(q)) p += 1;
  return p;
}

/** 当成「今天」的那天：开盘后过了寿命的四分之一（至少 3 天），离结算至少 7 天；寿命不到两周的不收。 */
export function chooseAsOf(createdOn: string, resolveOn: string): string | null {
  const life = daysBetween(createdOn, resolveOn);
  if (life < 14) return null;
  const offset = Math.max(3, Math.round(life * 0.25));
  const asOf = new Date(Date.parse(`${createdOn}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
  return daysBetween(asOf, resolveOn) >= 7 ? asOf : null;
}

/** 能进题库的：AI 不知道答案（开盘在 HISTORY_EARLIEST 以后）、已经结算、有够多人押、不是分段题、不是不收的话题、选得出「今天」。 */
export function historyEligible(c: HistoryCandidate, today: string): boolean {
  if (c.createdOn < HISTORY_EARLIEST || c.resolveOn >= today) return false;
  if (isBracketQuestion(c.title) || isExcludedTopic(c.title)) return false;
  if (c.platform === "manifold" ? c.depth < 15 : c.depth < 20_000) return false;
  return chooseAsOf(c.createdOn, c.resolveOn) !== null;
}

/** 价格序列（秒、概率）里那天以前的最后一个价；那天以前一个都没有返回 null。 */
export function probAt(series: { t: number; p: number }[], asOf: string): number | null {
  const cut = Date.parse(`${asOf}T00:00:00Z`) / 1000;
  let last: number | null = null;
  for (const s of series) if (s.t < cut && Number.isFinite(s.p)) last = s.p;
  return last;
}

// ── GDELT：那天以前的新闻 ────────────────────────────────────────────────────

export type HistoryNews = { title: string; url: string; domain: string; date: string };

const fmt = (d: Date) => d.toISOString().replace(/[-:T]/g, "").slice(0, 14);

/** 查哪段：那天以前 30 天到那天 0 点（不含那天）。 */
export function gdeltWindow(asOf: string, days = 30): { start: string; end: string } {
  const end = new Date(`${asOf}T00:00:00Z`);
  return { start: fmt(new Date(end.getTime() - days * 86_400_000)), end: fmt(end) };
}

/** GDELT 的结果：只留那天以前的、英文日文中文的，同一个标题只留一次，最多 n 条。 */
export function parseGdelt(json: unknown, asOf: string, n = 12): HistoryNews[] {
  const articles = ((json ?? {}) as { articles?: unknown[] }).articles ?? [];
  const cut = `${asOf.replace(/-/g, "")}T000000Z`;
  const seen = new Set<string>();
  const out: HistoryNews[] = [];
  for (const a of articles) {
    const o = (a ?? {}) as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.replace(/\s+/g, " ").trim() : "";
    const seendate = typeof o.seendate === "string" ? o.seendate : "";
    const lang = typeof o.language === "string" ? o.language : "";
    if (!title || !seendate || seendate >= cut || !/^(English|Japanese|Chinese)$/.test(lang)) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title: title.slice(0, 200),
      url: typeof o.url === "string" ? o.url : "",
      domain: typeof o.domain === "string" ? o.domain : "",
      date: `${seendate.slice(0, 4)}-${seendate.slice(4, 6)}-${seendate.slice(6, 8)}`,
    });
    if (out.length >= n) break;
  }
  return out;
}

/** 新闻检索词只许是英文字母、数字、空格、引号和几个符号（AI 写的，进 URL 之前再筛一遍）。 */
export function cleanSearchQuery(q: string): string | null {
  const t = q.replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
  if (!t || t.length > 120 || /[^A-Za-z0-9 "'&.\-]/.test(t)) return null;
  // GDELT 不收太短的词
  if (t.replace(/"/g, "").split(" ").every((w) => w.length < 3)) return null;
  return t;
}
