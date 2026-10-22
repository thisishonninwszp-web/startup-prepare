import type { BriefItem } from "./brief";
import type { EarlierMention } from "./followups";
import type { MonthlyLine } from "./monthly-shared";

/**
 * 共用的那一份（主账号的报告、周报、月报、提醒邮件）给别的账号看之前，去掉只关于主账号的东西：
 * 「跟你 / 你的优势」那一句、跟他在追的问题有关的标记、以前他写的判断、月报里跟他的差距清单和想法的关联和下一步。
 * 浏览器端也要用，不碰数据库。
 */

/** 一条精选去掉只关于主账号的几样。 */
export function publicItem<T extends Partial<BriefItem>>(item: T): T {
  const { personal: _p, personal_edge: _e, related_question: _q, ...rest } = item;
  void _p;
  void _e;
  void _q;
  return rest as T;
}

/** 「之前上过」去掉那次主账号写的判断。 */
export function publicEarlier(earlier: Record<string, EarlierMention>): Record<string, EarlierMention> {
  return Object.fromEntries(
    Object.entries(earlier).map(([k, m]) => {
      const { judgment: _j, ...rest } = m;
      void _j;
      return [k, rest];
    })
  );
}

/** 月报的一条线去掉跟主账号的差距清单、想法的关联和下一步（那是给他的）。 */
export function publicMonthlyLine(line: MonthlyLine): MonthlyLine {
  return { ...line, related: [], next: null, why: "" };
}
