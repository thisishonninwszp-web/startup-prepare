import type { JudgmentFeedback } from "@/lib/ai";

/**
 * 判断练习里浏览器端也要用的部分：选项、类型、纯函数。不碰数据库。
 */

export const HORIZONS = {
  "1m": { label: "一个月后", days: 30 },
  "3m": { label: "三个月后", days: 91 },
  "6m": { label: "半年后", days: 182 },
} as const;
export type HorizonKey = keyof typeof HORIZONS;

/** 把握度只给三档，由用户自己选；它唯一的用途是和实际对错对账。 */
export const CONFIDENCE_LEVELS = {
  low: { label: "没什么把握", value: 55 },
  mid: { label: "有点把握", value: 70 },
  high: { label: "很有把握", value: 90 },
} as const;
export type ConfidenceKey = keyof typeof CONFIDENCE_LEVELS;

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
};

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
