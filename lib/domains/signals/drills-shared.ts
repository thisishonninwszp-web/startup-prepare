import type { AnalogCheck } from "@/lib/ai";
import { CONFIDENCE_LEVELS, MISS_REASONS, type ConfidenceKey, type MissReason } from "./practice-shared";

/**
 * 历史题里浏览器端也要用的部分：类型和只数次数的统计。不碰数据库。
 */

/** 还没答的题：不带答案（答案只在答完以后才从服务器出来）。 */
export type OpenDrill = {
  id: string;
  topic: string | null;
  setup: string;
  question: string;
  /** 怎么才算"会"（迁移 068 之前出的题没有）。 */
  criterion: string | null;
};

/** 觉得这题出得不好、跳过时选的原因。跳过的不算进次数，攒着拿来调出题。 */
export const DRILL_FLAGS = {
  mismatch: "题面讲的和问题问的不是一回事",
  vague: "怎么才算「会」说不清",
  famous: "答案太有名，一看就知道",
  other: "别的问题",
} as const;
export type DrillFlag = keyof typeof DRILL_FLAGS;

export type DrillBasis = { url: string; title: string; excerpt: string }[];

export type AnsweredDrill = OpenDrill & {
  deadline: string;
  answer: boolean;
  what_happened: string;
  why_similar: string | null;
  source_check: AnalogCheck;
  guess: boolean;
  confidence: number | null;
  reasoning: string | null;
  answered_at: string;
  /** 实际是什么决定了结果（只取资料里写明的原因；069 之前出的题、资料没写原因的为 null）。 */
  decided_by: string | null;
  decided_basis: DrillBasis | null;
  /** 他自己标的"我当时的理由对上了没有"；没标为 null。 */
  reason_match: boolean | null;
  /** 这道题像的是哪条新闻 / 哪个在追的问题（070 之前出的题没有）。 */
  topic_signal_id: string | null;
  topic_question_id: string | null;
  /** 揭晓后问他的"今天那件事会不会也这样"。 */
  today_question: string | null;
  /** 裁判独立判的"理由对上没有"（只提名）；没判过为 null。 */
  reason_judge: boolean | null;
  /** 猜错时选的"错在哪一步"。 */
  miss_reason: MissReason | null;
};

/** 他标的和裁判判的不一样的次数：标了对上、裁判看来没对上的多，说明对理由时手松。只数次数。 */
export function tallyReasonJudge(drills: AnsweredDrill[]): { judged: number; selfYesJudgeNo: number; selfNoJudgeYes: number } {
  const judged = drills.filter((d) => d.reason_match !== null && d.reason_judge !== null);
  return {
    judged: judged.length,
    selfYesJudgeNo: judged.filter((d) => d.reason_match && !d.reason_judge).length,
    selfNoJudgeYes: judged.filter((d) => !d.reason_match && d.reason_judge).length,
  };
}

/** 猜错的那几道，每种原因各几次（和判断账本同一套五类）。 */
export function tallyDrillMissReasons(drills: AnsweredDrill[]): Record<MissReason, number> {
  const out = Object.fromEntries((Object.keys(MISS_REASONS) as MissReason[]).map((r) => [r, 0])) as Record<MissReason, number>;
  for (const d of drills) if (d.miss_reason && !drillHit(d)) out[d.miss_reason] += 1;
  return out;
}

export function drillHit(d: Pick<AnsweredDrill, "guess" | "answer">): boolean {
  return d.guess === d.answer;
}

/**
 * 答案"会""不会"各几道，他选"会""不会"各几次。只出"发生过的事"的话答案会偏向"会"，
 * 一直选"会"就能对一大半 —— 摆出来，偏了一眼就看得到。
 */
export function tallyAnswerBalance(drills: AnsweredDrill[]): { answerYes: number; answerNo: number; guessYes: number; guessNo: number } {
  return {
    answerYes: drills.filter((d) => d.answer).length,
    answerNo: drills.filter((d) => !d.answer).length,
    guessYes: drills.filter((d) => d.guess).length,
    guessNo: drills.filter((d) => !d.guess).length,
  };
}

/** 最近答过的题里"会""不会"差到几道，下一道就优先出少的那种。 */
export const BALANCE_GAP = 2;

/**
 * 从没答的题里挑下一道：最近答过的题答案偏向哪边，就优先挑另一边的；不偏就随便挑。
 * 用随机而不是轮流，免得他摸出"上一道是会、这一道该是不会"的规律。
 */
export function pickBalanced<T extends { answer: boolean }>(pool: T[], recentAnswers: boolean[], random: () => number = Math.random): T | null {
  if (pool.length === 0) return null;
  const yes = recentAnswers.filter(Boolean).length;
  const no = recentAnswers.length - yes;
  const want = yes - no >= BALANCE_GAP ? false : no - yes >= BALANCE_GAP ? true : null;
  const preferred = want === null ? pool : pool.filter((d) => d.answer === want);
  const from = preferred.length > 0 ? preferred : pool;
  return from[Math.floor(random() * from.length)];
}

/**
 * 结论和理由放在一起数（只数他标过"理由对上了没有"的）。
 * 猜对、理由没对上的，其实是运气；猜错、理由对上的，判断没毛病，是结果有变数。
 */
export function tallyReasons(drills: AnsweredDrill[]): { bothRight: number; luckyRight: number; unluckyWrong: number; bothWrong: number } {
  const marked = drills.filter((d) => d.reason_match !== null);
  const count = (hit: boolean, match: boolean) => marked.filter((d) => drillHit(d) === hit && d.reason_match === match).length;
  return { bothRight: count(true, true), luckyRight: count(true, false), unluckyWrong: count(false, true), bothWrong: count(false, false) };
}

/**
 * 做了几道、对了几道，按当时的把握分开数。只数次数、不算比率（原则 1）：
 * "很有把握的 8 道里对了 5 道"比一个百分比更难被忽略。
 */
export function tallyDrills(drills: AnsweredDrill[]): {
  total: number;
  hit: number;
  byConfidence: { key: ConfidenceKey; label: string; total: number; hit: number }[];
} {
  const byConfidence = (Object.keys(CONFIDENCE_LEVELS) as ConfidenceKey[]).map((key) => {
    const rows = drills.filter((d) => d.confidence === CONFIDENCE_LEVELS[key].value);
    return { key, label: CONFIDENCE_LEVELS[key].label, total: rows.length, hit: rows.filter(drillHit).length };
  });
  return { total: drills.length, hit: drills.filter(drillHit).length, byConfidence };
}
