import type { GapSide } from "./gaps-shared";

/** 慢变量往下推的结果（浏览器端也要用，不碰数据库、不碰 AI）。 */
export type SlowThen = {
  /** 推的时候给 AI 的那句数字（代码算的），页面上照着显示，看得出是拿什么推的。 */
  summary: string;
  chains: { steps: string[]; meaning: string; watch: string; breaks: string }[];
  /** 这一周报告里，它的表面。 */
  surfaces: { signal_id: string; title: string; how: string }[];
  /** 差距清单里靠它撑着的。 */
  gaps: { signal_id: string; side: GapSide; headline: string; how: string }[];
  created_at: string;
};
