import type { SignalKind } from "./feeds";

/**
 * 版面按他的阅读习惯排 —— 不碰数据库的部分。只看他做了什么（点开、标记、「有用 / 没用」），不调 AI、不打分给他看。
 * 最近 30 天里点得多、标得多的那一节排前面；一直没碰过的收起来（数据够了才收，免得刚开始用就把东西藏起来）。
 */

export const HABIT_DAYS = 30;
/** 一共点开过这么多次以后，才把一次都没碰过的那节收起来。 */
export const FOLD_MIN_OPENS = 15;
/** 一共有这么多次动作以后才按习惯重排（少了是噪音，照默认顺序）。 */
export const ORDER_MIN_ACTIONS = 5;

export type SectionHabit = { kind: SignalKind; opens: number; marks: number; useful: number; useless: number };

export function habitScore(h: SectionHabit): number {
  return h.opens + 2 * h.marks + h.useful - 2 * h.useless;
}

/** 排好的顺序（同分照默认顺序）和要收起来的几节。 */
export function orderSections(defaults: SignalKind[], habits: SectionHabit[]): { order: SignalKind[]; folded: SignalKind[] } {
  const by = new Map(habits.map((h) => [h.kind, h]));
  const get = (k: SignalKind) => by.get(k) ?? { kind: k, opens: 0, marks: 0, useful: 0, useless: 0 };
  const actions = defaults.reduce((n, k) => {
    const h = get(k);
    return n + h.opens + h.marks + h.useful + h.useless;
  }, 0);
  const order = actions >= ORDER_MIN_ACTIONS ? [...defaults].sort((a, b) => habitScore(get(b)) - habitScore(get(a)) || defaults.indexOf(a) - defaults.indexOf(b)) : [...defaults];
  const totalOpens = defaults.reduce((n, k) => n + get(k).opens, 0);
  const folded = totalOpens >= FOLD_MIN_OPENS ? order.filter((k) => get(k).opens === 0 && get(k).marks === 0 && get(k).useful === 0) : [];
  return { order, folded };
}
