import type { AnalogCheck } from "@/lib/ai";
import { CONFIDENCE_LEVELS, type ConfidenceKey } from "./practice-shared";

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
};

export function drillHit(d: Pick<AnsweredDrill, "guess" | "answer">): boolean {
  return d.guess === d.answer;
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
