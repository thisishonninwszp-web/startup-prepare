/**
 * 想法的信息缺口：浏览器端也要用的部分（叫法、类型、退路）。不碰数据库、不碰 AI。
 *
 * 信息只有改变一个决定时才有用。从想法的最关键假设和退出条件出发，列出"继续还是 Kill"还缺哪几样信息；
 * 每样写清它会改变什么、看到什么就该放弃（反证）、去哪拿、几天内拿到。
 * 去哪拿按可信度排：找真人 > 已经有人在花钱花时间的痕迹 > 网上的原话 > 外部视角（那边的同类、以前来日本的同类）。
 * 人"说的"不如人"做的"：没有人脉时，痕迹往往比聊天更可信。
 */

export const ROUTE_KINDS = {
  contact: "找真人",
  trace: "已经有人在花钱的痕迹",
  voices: "网上的原话",
  outside: "外部视角",
} as const;
export type RouteKind = keyof typeof ROUTE_KINDS;

/** 可信度从高到低（页面上按这个顺序排）。 */
export const ROUTE_ORDER: RouteKind[] = ["contact", "trace", "voices", "outside"];

export const GAP_STATUS = { open: "还缺", got: "拿到了", none: "拿不到" } as const;
export type GapStatus = keyof typeof GAP_STATUS;

export type GapEvidence = {
  at: string;
  /** 从外部信号哪一条补进来的（他自己记的没有）。 */
  signal_id?: string;
  title: string;
  url?: string | null;
  note?: string;
};

export type InfoGap = {
  id: string;
  idea_id: string;
  question: string;
  matters: string;
  disconfirm: string;
  routes: { kind: RouteKind; how: string }[];
  due_on: string;
  status: GapStatus;
  evidence: GapEvidence[];
  note: string | null;
  created_at: string;
};

/** 用上了的优势、碰到了的约束：fact 是他写的原话（代码逐字核对过）。 */
export type IdeaFit = {
  uses: { fact: string; how: string }[];
  hits: { fact: string; how: string }[];
  created_at: string;
};

/** 他写的约束和优势最多多长。 */
export const FOUNDER_FACTS_MAX = 1000;

/** 标了"拿不到"之后的退路（固定的几条，不让 AI 写）。 */
export const UNOBTAINABLE_ADVICE = [
  "拿不到本身就是信息：说明你没有进这个市场的通道。连调研都碰不到客户，以后卖东西也碰不到 —— 这常常是 Kill 或先搁置的理由，不是「再多查查」的理由。",
  "把注改小，让行动去产生数据：做一个两周内能做完、错了损失很小的版本（手工替一个人办一次、只有一页的东西）。",
  "把这次押注写进判断账本（带期限），没有数据，到期也能学到你的直觉准不准。",
  "换一个数据拿得到的方向 —— 这本身就是你的约束之一。",
] as const;

/** 还缺的、离截止最近的在前；截止过了的算"该拿了"。 */
export function dueGaps(gaps: Pick<InfoGap, "status" | "due_on">[], today: string): number {
  return gaps.filter((g) => g.status === "open" && g.due_on <= today).length;
}
