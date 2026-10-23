import type { JudgmentFeedback } from "@/lib/ai";
import type { InferenceEvidence } from "./inference-shared";

/**
 * 判断练习里浏览器端也要用的部分：选项、类型、纯函数。不碰数据库。
 */

export const HORIZONS = {
  "3d": { label: "三天后", days: 3 },
  "1m": { label: "一个月后", days: 30 },
  "3m": { label: "三个月后", days: 91 },
  "6m": { label: "半年后", days: 182 },
  "1y": { label: "一年后", days: 365 },
  "3y": { label: "三年后", days: 1095 },
} as const;
export type HorizonKey = keyof typeof HORIZONS;

/** 题目里写了"到某年某月底"时，按那个日子对账，再多留一周等消息出来。 */
export const DEADLINE_GRACE_DAYS = 7;
/** 离对账超过这么多天就算长期判断，可以另押一个苗头。 */
export const LONG_JUDGMENT_DAYS = 300;

/** "2027-12-31" → "2027年12月底"；不是月底的（"一年内"算出来的）写到哪一天："2027年10月12日"。 */
export function deadlineLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d === lastDay ? `${y}年${m}月底` : `${y}年${m}月${d}日`;
}

/** 按题目日期对账时，离今天多少天（含一周余量）。 */
export function deadlineDays(date: string, now = Date.now()): number {
  return Math.ceil((new Date(`${date}T23:59:00+09:00`).getTime() - now) / 86_400_000) + DEADLINE_GRACE_DAYS;
}

/** 一年以上的判断要等很久才能对账：可以另写一个半年内就能看到的"苗头"，自动多押一条。 */
export const LONG_HORIZONS: HorizonKey[] = ["1y", "3y"];
export const MILESTONE_PREFIX = "【苗头】";

export function milestoneQuestion(question: string): string {
  return `${MILESTONE_PREFIX}${question}`;
}

/** 看错时选的原因：几个月后看自己总栽在哪一类上。只数次数。 */
export const MISS_REASONS = {
  info: "信息不够：有个关键事实当时不知道",
  reasoning: "推理断了：前提对，中间想当然了",
  timing: "时间估错：会发生，只是比我想的慢或快",
  emotion: "被情绪带了：我希望它发生（或不发生）",
  luck: "纯属意外：谁也料不到的事打乱了",
} as const;
export type MissReason = keyof typeof MISS_REASONS;

/** 把握度只给三档，由用户自己选；它唯一的用途是和实际对错对账。 */
export const CONFIDENCE_LEVELS = {
  low: { label: "没什么把握", value: 55 },
  mid: { label: "有点把握", value: 70 },
  high: { label: "很有把握", value: 90 },
} as const;
export type ConfidenceKey = keyof typeof CONFIDENCE_LEVELS;

/** 判断怎么来的：blind 先判（看不到 AI）、agree 点了「行」同意 AI、override 点了「不行」改判。迁移 099 以前的为空，算先判。 */
export type JudgmentMode = "blind" | "agree" | "override";

export const JUDGMENT_MODE_LABELS: Record<JudgmentMode, string> = { blind: "你自己先判的", agree: "你同意 AI 的", override: "你改判的" };

/** AI 先判、他表态的判断都带这个标签（账本按标签数的时候分得开）。 */
export const AI_FIRST_TAG = "AI 先判";

/** 练习题的 AI 先判（经用户明确裁决，2026-10-23）：三种思路各说几成、代码取中间（存在那一天报告的 practice.ai_draft）。 */
export type PracticeDraft = {
  probability: number;
  perspectives: { source: "ai_outside" | "ai_inside" | "ai_devil"; probability: number; reason: string }[];
  made_at: string;
};

/** 几成可能换成三档把握：离五成越远越有把握。 */
export function confidenceFor(p: number): ConfidenceKey {
  const d = Math.max(p, 1 - p);
  return d < 0.63 ? "low" : d < 0.8 ? "mid" : "high";
}

/** AI 先判的那一句（代码拼，不让 AI 另写）；flip = 反过来，就是他点「不行」时预填的那句。 */
export function draftVerdict(p: number, question: string, flip = false): { will: boolean; sentence: string; confidence: ConfidenceKey } {
  const will = p >= 0.5 !== flip;
  return { will, sentence: `${will ? "会" : "不会"}：${question.trim()}`, confidence: confidenceFor(p) };
}

/** 每周一的练习是先判题（东京日期 YYYY-MM-DD）：照旧先自己判、可以先拆一拆。 */
export function isBlindPracticeDate(date: string): boolean {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 1;
}

/** 判断账本按来路数：几条、看对几条、看错几条（只数次数，不算比率）。 */
export function tallyModes(rows: { mode?: JudgmentMode | null; outcome: JudgmentRow["outcome"] }[]): Record<JudgmentMode, { n: number; hit: number; miss: number }> {
  const out: Record<JudgmentMode, { n: number; hit: number; miss: number }> = {
    blind: { n: 0, hit: 0, miss: 0 },
    agree: { n: 0, hit: 0, miss: 0 },
    override: { n: 0, hit: 0, miss: 0 },
  };
  for (const r of rows) {
    const t = out[r.mode ?? "blind"];
    t.n += 1;
    if (r.outcome === "hit") t.hit += 1;
    if (r.outcome === "miss") t.miss += 1;
  }
  return out;
}

const PERSPECTIVE_NAMES: Record<PracticeDraft["perspectives"][number]["source"], string> = { ai_outside: "先看基准率", ai_inside: "只看这件事", ai_devil: "唱反调" };

/** 改判时交给挑刺的那一段（走 critiqueJudgment 的 reasoning）：AI 原来判的哪边、三种思路的理由。 */
export function overrideReasoning(draft: PracticeDraft, question: string): string {
  const v = draftVerdict(draft.probability, question);
  const views = draft.perspectives.map((x) => `${PERSPECTIVE_NAMES[x.source]}说 ${Math.round(x.probability * 100)}%：${x.reason}`).join("；");
  return `AI 先判的是「${v.will ? "会" : "不会"}」（${Math.round(draft.probability * 100)}%），他不同意、改判了。AI 的理由：${views}`;
}

export const GENERIC_QUESTION = "这件事接下来会怎样？写一句几个月后能说清对错的话。";

export type JudgmentRow = {
  id: string;
  signal_id: string | null;
  prediction_id: string;
  news_title: string;
  news_url: string | null;
  question: string;
  judgment: string;
  feedback: JudgmentFeedback | null;
  created_at: string;
  due_at: string;
  outcome: "pending" | "hit" | "miss";
  confidence: number | null;
  resolved_at: string | null;
  note: string | null;
  /** 账本标签（迁移 059 之前的数据为空数组）。 */
  tags: string[];
  /** 从问题页押进来的判断连着的问题（这种没有对应的新闻）。 */
  question_id: string | null;
  /** 看错时选的原因（迁移 062 之前没有）。 */
  miss_reason?: MissReason | null;
  /** 到期时上网查到的"现在实际怎样"。null：还没查；undefined：迁移 064 没跑、这一列还不存在。 */
  outcome_evidence?: OutcomeEvidence | null;
  /** 怎么来的（迁移 099 之前没有这一列：undefined；跑过、为空的是以前记的，都算先判）。 */
  mode?: JudgmentMode | null;
};

/** 到期时上网查到的事实，原文由代码逐字核对过；stance 是对他那句判断而言的。查过但一条没查到时 evidence 为空。 */
export type OutcomeEvidence = { checked_at: string; evidence: InferenceEvidence[] };

/**
 * 自己判卷手松不松：标了"看对了"、查到的证据却是反对的多，或者反过来，各几次。
 * 只数次数（原则 1）；还没对账的、没查到证据的不算。
 */
export function tallyEvidenceDisagreement(rows: JudgmentRow[]): { checked: number; hitButAgainst: number; missButFor: number } {
  let checked = 0;
  let hitButAgainst = 0;
  let missButFor = 0;
  for (const r of rows) {
    const evidence = r.outcome_evidence?.evidence ?? [];
    if (r.outcome === "pending" || evidence.length === 0) continue;
    const pro = evidence.filter((e) => e.stance === "supports").length;
    const con = evidence.filter((e) => e.stance === "contradicts").length;
    checked += 1;
    if (r.outcome === "hit" && con > pro) hitButAgainst += 1;
    if (r.outcome === "miss" && pro > con) missButFor += 1;
  }
  return { checked, hitButAgainst, missButFor };
}

/** 看错的那几条，每种原因各几次。 */
export function tallyMissReasons(rows: JudgmentRow[]): { reason: MissReason; label: string; count: number }[] {
  return (Object.keys(MISS_REASONS) as MissReason[]).map((reason) => ({
    reason,
    label: MISS_REASONS[reason],
    count: rows.filter((r) => r.outcome === "miss" && r.miss_reason === reason).length,
  }));
}

const MAX_TAGS = 5;
const MAX_TAG_LENGTH = 12;

/**
 * 标签（借鉴 Fatebook）：自由填写，空格或逗号分开。去掉 #、去重，最多 5 个、每个最多 12 个字。
 * 用处是看你在哪类事上写得多、各中了几次 —— 有人用它发现自己看自己的事很准，看世界大事总看错。
 */
export function normalizeTags(raw: string | string[]): string[] {
  const parts = (Array.isArray(raw) ? raw : raw.split(/[\s,，、]+/))
    .map((t) => t.trim().replace(/^[#＃]+/, "").slice(0, MAX_TAG_LENGTH))
    .filter(Boolean);
  return Array.from(new Set(parts)).slice(0, MAX_TAGS);
}

export type TagTally = { tag: string; total: number; hit: number; miss: number; pending: number };

/** 按标签数次数（只给次数，不给比率），写得多的排前面。没打标签的不算进来。 */
export function tallyByTag(rows: JudgmentRow[]): TagTally[] {
  const map = new Map<string, TagTally>();
  for (const r of rows) {
    for (const tag of r.tags ?? []) {
      const t = map.get(tag) ?? { tag, total: 0, hit: 0, miss: 0, pending: 0 };
      t.total += 1;
      t[r.outcome] += 1;
      map.set(tag, t);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total || a.tag.localeCompare(b.tag));
}

/** 用过的标签，写新判断时给出来点选，免得同一类事写成好几种叫法。 */
export function knownTags(rows: JudgmentRow[]): string[] {
  return tallyByTag(rows).map((t) => t.tag);
}

/** 到期、还没对账的判断。 */
export function dueJudgments(rows: JudgmentRow[], now = Date.now()): JudgmentRow[] {
  return rows
    .filter((r) => r.outcome === "pending" && new Date(r.due_at).getTime() <= now)
    .sort((a, b) => a.due_at.localeCompare(b.due_at));
}

/** 账本上的计数：只给次数，不给比率。 */
export function tallyJudgments(rows: JudgmentRow[]) {
  return {
    hit: rows.filter((r) => r.outcome === "hit").length,
    miss: rows.filter((r) => r.outcome === "miss").length,
    pending: rows.filter((r) => r.outcome === "pending").length,
  };
}

/**
 * "押这一条"：在往下推的某一步上下的判断。question 以这个前缀开头，
 * 好和"这条新闻本身的判断"（每日练习、详情页那道门）分开 —— 一条新闻可以有一个总判断、再押几步推论。
 */
export const NODE_BET_PREFIX = "【往下推】";

export function nodeBetQuestion(claim: string): string {
  return `${NODE_BET_PREFIX}${claim}`;
}

export function isNodeBet(question: string): boolean {
  return question.startsWith(NODE_BET_PREFIX);
}

/** 从"我的问题"页押进账本的判断，question 以这个前缀开头。 */
export const QUESTION_BET_PREFIX = "【我的问题】";

/** 周刊发出去时自动押进账本的判断（公开过的判断），question 以这个前缀开头。 */
export const ISSUE_BET_PREFIX = "【周刊】";

/** 界面上显示的问题：押推论的、押自己问题的，去掉前缀换成人话。 */
export function displayQuestion(question: string): string {
  if (isNodeBet(question)) return `往下推的一步会不会发生：${question.slice(NODE_BET_PREFIX.length)}`;
  if (question.startsWith(QUESTION_BET_PREFIX)) return `我在追的问题：${question.slice(QUESTION_BET_PREFIX.length)}`;
  if (question.startsWith(ISSUE_BET_PREFIX)) return `周刊上公开判断的：${question.slice(ISSUE_BET_PREFIX.length)}`;
  if (question.startsWith(MILESTONE_PREFIX)) return `长期判断的中途苗头：${displayQuestion(question.slice(MILESTONE_PREFIX.length))}`;
  return question;
}
