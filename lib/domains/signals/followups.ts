import { sameEvent } from "@/lib/ai/signals";
import type { BriefItem } from "./brief";

/**
 * 跟住一件事：重要的事都是连续剧（日银加息、物流 2024 年问题），隔几天冒出一次新进展。
 * 今天报告里的一条，如果之前的报告里出现过同一件事（事件标签相同或互相包含），
 * 就标出上次是哪天、那次的标题，以及你那次写下的判断 —— 看当初的判断是不是在朝对的方向走。
 */

export type EarlierJudgment = { judgment: string; due_at: string; outcome: "pending" | "hit" | "miss" };

export type EarlierMention = {
  /** 最近一次出现在哪天的报告。 */
  brief_date: string;
  signal_id: string;
  headline: string;
  /** 之前一共出现过几次（不算今天）。 */
  times: number;
  /** 之前出现的那几次里，你写过判断的最近一条。 */
  judgment?: EarlierJudgment & { brief_date: string };
};

type PastBrief = { brief_date: string; items: BriefItem[] };

/** briefs 不需要排好序；同一条新闻（signal_id 相同）不算"之前出现过"。 */
export function findEarlierMentions(
  today: Pick<BriefItem, "signal_id" | "event" | "extra">[],
  past: PastBrief[],
  judgments: Map<string, EarlierJudgment>
): Record<string, EarlierMention> {
  const sorted = [...past].sort((a, b) => b.brief_date.localeCompare(a.brief_date));
  const out: Record<string, EarlierMention> = {};
  for (const item of today) {
    if (item.extra || !item.event) continue;
    const hits = sorted.flatMap((b) =>
      b.items
        .filter((x) => !x.extra && x.event && x.signal_id !== item.signal_id && sameEvent(x.event, item.event!))
        .map((x) => ({ brief_date: b.brief_date, item: x }))
    );
    if (hits.length === 0) continue;
    const judged = hits.find((h) => judgments.has(h.item.signal_id));
    out[item.signal_id] = {
      brief_date: hits[0].brief_date,
      signal_id: hits[0].item.signal_id,
      headline: hits[0].item.headline,
      times: new Set(hits.map((h) => h.brief_date)).size,
      judgment: judged ? { ...judgments.get(judged.item.signal_id)!, brief_date: judged.brief_date } : undefined,
    };
  }
  return out;
}
