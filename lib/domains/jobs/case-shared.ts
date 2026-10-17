/**
 * 「这家可能会问的 case」的类型和纯规则（不碰数据库、不调 AI，可测）。
 * 宪法原则 1：不打分，只数练了几道、卡在哪一步几次；用了几分钟是事实，由代码算。
 */

export const CASE_TYPES = {
  analysis: "分析設計",
  improvement: "業務・利益の改善",
  new_business: "新規事業",
  sizing: "市場規模の推定",
  china: "中国市場",
} as const;
export type CaseType = keyof typeof CASE_TYPES;

/** 卡在哪一步：和判断账本"错在哪一步"一样只数次数。AI 只提名，记下的是他点的。 */
export const STUCK_STEPS = {
  define: "题目没问清就开始答",
  split: "拆法有漏、有重",
  numbers: "数字没根据、算不对",
  prioritize: "方案没排先后",
  conclude: "没先说结论",
} as const;
export type StuckStep = keyof typeof STUCK_STEPS;

export const CASE_STATUSES = ["asked", "answered", "reviewed"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  asked: "还没写",
  answered: "在回答追问",
  reviewed: "复盘好了",
};

export type CaseQuestion = {
  type: CaseType;
  /** 题目（日文，像面试官当面问的）。 */
  prompt_ja: string;
  /** 前提（日文：能不能自己假设数字、要答到什么程度）。 */
  premise_ja: string;
  /** 为什么出这道（中文一句）。 */
  why: string;
  /** 支撑 why 的招聘页原话（代码逐字核对过）。 */
  quote: string;
};

/** 追问：q_ja 日文；cites 是被追问的他写的原话（核对过）；a 是他的回答（没答为空）。 */
export type CaseFollowup = { q_ja: string; cites: string; a: string };

export type CaseReview = {
  /** 参考结构（日文要点，AI 写的一种拆法，不是标准答案）。 */
  reference_ja: string[];
  /** 最容易被问穿的地方：quote 是他写的原话（核对过），why 中文。 */
  weak: { quote: string; why: string }[];
  /** AI 提名的"卡在哪一步"。 */
  suggested_step: StuckStep;
};

export type CaseDrill = {
  id: string;
  posting_id: string;
  status: CaseStatus;
  question: CaseQuestion;
  answer: string | null;
  answered_at: string | null;
  followups: CaseFollowup[] | null;
  review: CaseReview | null;
  stuck_step: StuckStep | null;
  started_at: string;
  reviewed_at: string | null;
  created_at: string;
};

export type CaseDrillSummary = Pick<CaseDrill, "id" | "posting_id" | "status" | "stuck_step" | "created_at"> & { prompt_ja: string };

/** 交结构至少写这么多字（太短的没东西可追问）。 */
export const MIN_ANSWER_CHARS = 20;
/** /jobs 上"最近几道"的那个几。 */
export const RECENT_DRILLS = 10;

export function isCaseType(v: unknown): v is CaseType {
  return typeof v === "string" && Object.hasOwn(CASE_TYPES, v);
}

export function isStuckStep(v: unknown): v is StuckStep {
  return typeof v === "string" && Object.hasOwn(STUCK_STEPS, v);
}

/** 从出题到交结构用了几分钟（至少 1 分钟）；还没交返回 null。 */
export function minutesTaken(startedAt: string, answeredAt: string | null): number | null {
  if (!answeredAt) return null;
  const ms = Date.parse(answeredAt) - Date.parse(startedAt);
  return Number.isFinite(ms) ? Math.max(1, Math.round(ms / 60_000)) : null;
}

/** 最近 RECENT_DRILLS 道他点了"卡在哪一步"的，各卡了几次；total 是一共练了几道（出过题的都算）。 */
export function stuckCounts(drills: Pick<CaseDrill, "stuck_step" | "created_at">[]): {
  total: number;
  recent: number;
  counts: Record<StuckStep, number>;
} {
  const counts = Object.fromEntries(Object.keys(STUCK_STEPS).map((k) => [k, 0])) as Record<StuckStep, number>;
  const marked = drills
    .filter((d): d is Pick<CaseDrill, "created_at"> & { stuck_step: StuckStep } => d.stuck_step !== null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, RECENT_DRILLS);
  for (const d of marked) counts[d.stuck_step] += 1;
  return { total: drills.length, recent: marked.length, counts };
}

/** 对他说的日文里不许夸（宪法原则 2）。 */
export const JA_PRAISE = ["素晴らしい", "すばらしい", "よくできて", "良い回答", "いい回答", "いいですね", "完璧", "さすが", "見事"];

export function assertNoPraiseJa(texts: string[]): void {
  const all = texts.join("\n");
  const hit = JA_PRAISE.find((w) => all.includes(w));
  if (hit) throw new Error(`出现了夸奖：${hit}`);
}
