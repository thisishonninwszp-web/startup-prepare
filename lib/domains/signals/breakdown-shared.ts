/**
 * 判断前的拆解卡里浏览器端也要用的部分：类型、"偏向哪边"的叫法、拼给挑刺看的那段话。不碰数据库。
 *
 * "先判断再看答案"防的是被 AI 的结论带偏，不是不给思路。拆解卡给地图不给方向：
 * 这件事由哪几个因素决定、每个因素怎么起作用、现在是什么情况（查过、有出处）、去哪看；
 * 每个因素偏向哪边由他自己点，AI 一个字不说。
 */

export type BreakdownFactor = {
  /** 因素名（"通胀离 2% 目标有多远"）。 */
  factor: string;
  /** 它怎么影响结果：两个方向都写成条件句。AI 写的原理，不是查来的。 */
  mechanism: string;
  /** 去哪看：哪个指标、谁发布、多久一次。 */
  indicator: string;
  /** 现在是什么情况（只根据查到的资料；没查到就写没查到）。 */
  now: string;
  /** now 的原文依据（逐字，由代码核对）。 */
  basis: { url: string; title: string; excerpt: string }[];
};

export const LEANS = { yes: "偏向会", no: "偏向不会", unclear: "看不出" } as const;
export type Lean = keyof typeof LEANS;

export type Breakdown = {
  factors: BreakdownFactor[];
  generated_at: string;
  /** 他对每个因素点的偏向（和 factors 一一对应，没点的是 null）。 */
  leans?: (Lean | null)[];
};

/** 交判断时一起给挑刺看：他判断前对每个因素是怎么看的。一个都没点就是空串。 */
export function leanSummary(breakdown: Breakdown | null | undefined, leans: (Lean | null)[]): string {
  if (!breakdown) return "";
  const lines = breakdown.factors
    .map((f, i) => (leans[i] ? `${f.factor}：${LEANS[leans[i]!]}` : ""))
    .filter(Boolean);
  return lines.join("；");
}

/** 点了几个偏向会、几个偏向不会、几个看不出。只数次数。 */
export function tallyLeans(leans: (Lean | null)[]): Record<Lean, number> {
  return {
    yes: leans.filter((l) => l === "yes").length,
    no: leans.filter((l) => l === "no").length,
    unclear: leans.filter((l) => l === "unclear").length,
  };
}
