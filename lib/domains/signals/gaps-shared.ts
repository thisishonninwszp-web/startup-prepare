import type { AnalogCheck } from "@/lib/ai/signals";
import { sameEvent } from "@/lib/ai/signals";
import type { BriefItem } from "./brief";

/**
 * 中国有、日本还没有：报告里中文媒体的那几条，"日本这边"核实下来是"没有"或"有类似的，但没普及"的，攒成一张清单。
 * 不加表 —— 直接从每天存下的报告（signal_briefs.items）里挑出来。
 * 只收查到出处的（supported / corrected）；没查到出处的只是 AI 的印象，不进清单。
 */

export type JapanGap = {
  signal_id: string;
  brief_date: string;
  headline: string;
  title: string;
  url: string | null;
  source: string;
  /** 日本这边（核实过的版本）。 */
  japan: string;
  check: AnalogCheck;
  event?: string;
};

const GAP_OPENERS = ["没有", "有类似的"];

export function isJapanGap(item: BriefItem): boolean {
  if (item.extra || !item.japan || !item.japan_check) return false;
  if (item.japan_check.status === "unverified") return false;
  return GAP_OPENERS.some((o) => item.japan!.startsWith(o));
}

/** briefs 要从新到旧排好。同一条新闻、同一件事（事件标签相同）只留最新的那次。 */
export function collectJapanGaps(briefs: { brief_date: string; items: BriefItem[] }[]): JapanGap[] {
  const out: JapanGap[] = [];
  for (const brief of briefs) {
    for (const item of brief.items) {
      if (!isJapanGap(item)) continue;
      if (out.some((g) => g.signal_id === item.signal_id)) continue;
      if (item.event && out.some((g) => g.event && sameEvent(g.event, item.event!))) continue;
      out.push({
        signal_id: item.signal_id,
        brief_date: brief.brief_date,
        headline: item.headline,
        title: item.title,
        url: item.url,
        source: item.source,
        japan: item.japan!,
        check: item.japan_check!,
        event: item.event,
      });
    }
  }
  return out;
}

/** 记成观察时的正文：你的那句话放最前面，后面是中国那边是什么、日本这边怎样、出处。 */
export function gapObservationText(gap: JapanGap, note: string): string {
  return [
    note.trim(),
    `中国有、日本还没有：${gap.headline}`,
    `日本这边：${gap.japan}`,
    `读到：${gap.title}（${gap.source}）`,
    gap.url ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 这条是不是已经记成过观察：观察正文里出现过它的链接或那句话。 */
export function isGapObserved(gap: JapanGap, observationTexts: string[]): boolean {
  return observationTexts.some(
    (t) => (gap.url && t.includes(gap.url)) || t.includes(`中国有、日本还没有：${gap.headline}`)
  );
}
