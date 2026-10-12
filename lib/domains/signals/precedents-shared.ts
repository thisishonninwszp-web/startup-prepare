import { sameEvent } from "@/lib/ai/signals";
import type { BriefItem } from "./brief";

/**
 * 先例：某个方向"有人试过的结果"（撤退、停服、转型、失败，或者在别处做成了）。
 * 一个方向前人试过没有、为什么没成，比方向本身更有信息量 —— 攒起来，想一个方向时先翻这里。
 * 不加表，从存下的报告里挑。
 */

export type Precedent = {
  signal_id: string;
  brief_date: string;
  headline: string;
  source: string;
  url: string | null;
  /** 它对想走这个方向的人说明了什么。 */
  lesson: string;
  event?: string;
};

/** briefs 不需要排好序；同一条新闻、同一件事只留最新的那次。 */
export function collectPrecedents(briefs: { brief_date: string; items: BriefItem[] }[]): Precedent[] {
  const sorted = [...briefs].sort((a, b) => b.brief_date.localeCompare(a.brief_date));
  const out: Precedent[] = [];
  for (const b of sorted) {
    for (const item of b.items) {
      if (item.extra || !item.precedent) continue;
      if (out.some((p) => p.signal_id === item.signal_id)) continue;
      if (item.event && out.some((p) => p.event && sameEvent(p.event, item.event!))) continue;
      out.push({
        signal_id: item.signal_id,
        brief_date: b.brief_date,
        headline: item.headline,
        source: item.source,
        url: item.url,
        lesson: item.precedent,
        event: item.event,
      });
    }
  }
  return out;
}
