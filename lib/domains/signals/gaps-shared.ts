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
  /** 为什么是现在（或者还缺什么）。 */
  whyNow?: string;
  /** 日本已经有公司为这件事拉到投资：说明方向被验证过，也说明你晚了一步。 */
  funded?: { company: string; url: string; excerpt: string };
};

const GAP_OPENERS = ["没有", "有类似的"];

/** japan：中国有、日本还没有（中国的条目问"日本有没有"）；china：日本有、中国还没有（反方向）。 */
export type GapSide = "japan" | "china";

/** 一条报告条目在某个方向上的比较结果（两个方向存在不同的字段里）。 */
function sideOf(item: BriefItem, side: GapSide) {
  return side === "japan"
    ? { text: item.japan, check: item.japan_check, whyNow: item.japan_why_now, funded: item.japan_funded }
    : { text: item.china_side, check: item.china_check, whyNow: item.china_why_now, funded: item.china_funded };
}

export function isJapanGap(item: BriefItem, side: GapSide = "japan"): boolean {
  const s = sideOf(item, side);
  if (item.extra || !s.text || !s.check) return false;
  if (s.check.status === "unverified") return false;
  return GAP_OPENERS.some((o) => s.text!.startsWith(o));
}

/** briefs 要从新到旧排好。同一条新闻、同一件事（事件标签相同）只留最新的那次。 */
export function collectJapanGaps(briefs: { brief_date: string; items: BriefItem[] }[], side: GapSide = "japan"): JapanGap[] {
  const out: JapanGap[] = [];
  for (const brief of briefs) {
    for (const item of brief.items) {
      if (!isJapanGap(item, side)) continue;
      const s = sideOf(item, side);
      if (out.some((g) => g.signal_id === item.signal_id)) continue;
      if (item.event && out.some((g) => g.event && sameEvent(g.event, item.event!))) continue;
      out.push({
        signal_id: item.signal_id,
        brief_date: brief.brief_date,
        headline: item.headline,
        title: item.title,
        url: item.url,
        source: item.source,
        japan: s.text!,
        check: s.check!,
        event: item.event,
        whyNow: s.whyNow,
        funded: s.funded,
      });
    }
  }
  return out;
}

/** 记成观察时的正文：你的那句话放最前面，后面是那边是什么、这边怎样、出处。 */
export function gapObservationText(gap: JapanGap, note: string, side: GapSide = "japan"): string {
  return [
    note.trim(),
    side === "japan" ? `中国有、日本还没有：${gap.headline}` : `日本有、中国还没有：${gap.headline}`,
    side === "japan" ? `日本这边：${gap.japan}` : `中国那边：${gap.japan}`,
    `读到：${gap.title}（${gap.source}）`,
    gap.url ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 这条是不是已经记成过观察：观察正文里出现过它的链接或那句话。 */
export function isGapObserved(gap: JapanGap, observationTexts: string[]): boolean {
  return observationTexts.some(
    (t) =>
      (gap.url && t.includes(gap.url)) ||
      t.includes(`中国有、日本还没有：${gap.headline}`) ||
      t.includes(`日本有、中国还没有：${gap.headline}`)
  );
}
