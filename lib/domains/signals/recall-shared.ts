/**
 * 回想（迁移 098）：间隔重复 —— 不碰数据库的部分。
 * 认知科学里最稳的结论之一：自己想起来一次，比再看一遍记得牢；隔一段再想一次更牢。
 * 他标过、记成观察、写过判断的那条，先问「当时为什么在意？后来怎样了？」，他想过再看答案，按记得 / 模糊 / 忘了排下一次。
 */

export type RecallResult = "remembered" | "vague" | "forgot";

export const RECALL_LABELS: Record<RecallResult, string> = { remembered: "记得", vague: "模糊", forgot: "忘了" };

/** 第一次在他做了那件事一周后问。 */
export const FIRST_INTERVAL = 7;
/** 最长隔一年。 */
export const MAX_INTERVAL = 365;
/** 「今天」一页一次最多放几条。 */
export const RECALL_PER_DAY = 3;

/** 下一次隔多少天：记得的乘 2.5，模糊的乘 1.2（至少一周），忘了的回到一周。 */
export function nextInterval(prev: number, r: RecallResult): number {
  if (r === "forgot") return FIRST_INTERVAL;
  const next = Math.round(prev * (r === "remembered" ? 2.5 : 1.2));
  return Math.min(MAX_INTERVAL, Math.max(FIRST_INTERVAL, next));
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
