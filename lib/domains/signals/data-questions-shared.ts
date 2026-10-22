/**
 * 数据题（原则 1 例外四：kind = data）—— 不碰数据库、不碰网络的部分。
 * 系统本来就在取的数，出成「到某天会不会高于某个数」，到期由代码对账，题目上带统计基准（历史上这种情况几成会发生）。
 * 两类：
 * - 市场数据（汇率、日经、原油、美债利率；Yahoo 的公开图表接口）：一周后会不会比今天高 —— 这类数接近随机游走，
 *   统计基准大约五成，AI 和他能不能比五成准，本身就是要知道的事。只练判断准不准，不是投资建议。
 * - 关注度（日文维基某一页一个月的浏览，他「听一听」过的差距清单那几条）：这个月会不会比上个月多 —— 跟需求有关，有季节性。
 */

export type DailyClose = { day: string; close: number };

/** Yahoo 的时间戳（秒，收盘时刻）→ 日本日期。 */
export function toTokyoDay(t: number): string {
  return new Date(t * 1000 + 9 * 3_600_000).toISOString().slice(0, 10);
}

/** 到某天（含）为止最后一个收盘；那天以前一个都没有返回 null。 */
export function closeOnOrBefore(series: DailyClose[], day: string): DailyClose | null {
  let last: DailyClose | null = null;
  for (const p of series) if (p.day <= day) last = p;
  return last;
}

/** 统计基准：历史上隔 h 个交易日以后比当时高的比例（只数次数）；样本不够返回 null。 */
export function upShare(closes: number[], h = 5): number | null {
  let up = 0;
  let n = 0;
  for (let i = 0; i + h < closes.length; i++) {
    if (closes[i + h] === closes[i]) continue;
    n += 1;
    if (closes[i + h] > closes[i]) up += 1;
  }
  return n >= 100 ? Math.round((up / n) * 100) / 100 : null;
}

/** 一周后（同一个星期几）；碰上周末往前挪到周五。 */
export function weekAhead(today: string): string {
  const d = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000);
  const dow = d.getUTCDay();
  const back = dow === 6 ? 1 : dow === 0 ? 2 : 0;
  return new Date(d.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}

export type MonthViews = { month: string; views: number };

const prevMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
};

/**
 * 「这个月会不会比上个月多」的统计基准：往年同一个月比前一个月多的比例（满两年才用，有季节性）；
 * 不够两年就用最近 24 个月里「比前一个月多」的比例。样本太少返回 null。
 */
export function monthUpShare(history: MonthViews[], target: string): { p: number; how: string } | null {
  const by = new Map(history.map((h) => [h.month, h.views]));
  const mm = target.slice(5);
  const years = history
    .filter((h) => h.month.slice(5) === mm && h.month < target && by.has(prevMonth(h.month)))
    .map((h) => h.views > (by.get(prevMonth(h.month)) as number));
  if (years.length >= 2) {
    const p = years.filter(Boolean).length / years.length;
    return { p: Math.min(0.95, Math.max(0.05, Math.round(p * 100) / 100)), how: `往年 ${years.length} 次里同一个月比前一个月多的比例` };
  }
  const recent = history.filter((h) => h.month < target).slice(-24);
  const pairs = recent.filter((h) => by.has(prevMonth(h.month))).map((h) => h.views > (by.get(prevMonth(h.month)) as number));
  if (pairs.length < 6) return null;
  const p = pairs.filter(Boolean).length / pairs.length;
  return { p: Math.min(0.95, Math.max(0.05, Math.round(p * 100) / 100)), how: `最近 ${pairs.length} 个月里比前一个月多的比例` };
}

/** 这个月最后一天再过三天（维基按月的数要月底以后才全）。 */
export function monthResolveOn(month: string): string {
  const [y, mo] = month.split("-").map(Number);
  return new Date(Date.UTC(y, mo, 3)).toISOString().slice(0, 10);
}

export { prevMonth };
