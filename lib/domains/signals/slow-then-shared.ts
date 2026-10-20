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

/** 顺风 / 逆风的一条：哪个慢变量、他手上的哪样东西（差距的条目或想法）、为什么。 */
export type WindLink = {
  key: string;
  dir: "tail" | "head";
  kind: "gap" | "idea";
  /** 差距：signal_id；想法：idea id。 */
  ref: string;
  side?: GapSide;
  title: string;
  why: string;
};

/** 他手上的东西对慢变量是顺风还是逆风（一次看完所有慢变量，存成 signal_slow_thens 里 key = "_wind" 的那一行）。 */
export type SlowWind = { links: WindLink[]; created_at: string };

export const WIND_KEY = "_wind";

export const WIND_LABEL: Record<WindLink["dir"], string> = { tail: "顺风", head: "逆风" };

/** 某一样东西的顺风、逆风（差距按 side + signal_id，想法按 id）。 */
export function windFor(wind: SlowWind | null, kind: WindLink["kind"], ref: string, side?: GapSide): WindLink[] {
  return (wind?.links ?? []).filter((l) => l.kind === kind && l.ref === ref && (kind === "idea" || l.side === side));
}

