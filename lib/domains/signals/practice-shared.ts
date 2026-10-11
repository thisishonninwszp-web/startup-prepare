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

/** 界面上显示的问题：押推论的那种，去掉前缀换成人话。 */
export function displayQuestion(question: string): string {
  return isNodeBet(question) ? `往下推的一步会不会发生：${question.slice(NODE_BET_PREFIX.length)}` : question;
}
