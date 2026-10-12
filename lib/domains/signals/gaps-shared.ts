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

/**
 * japan：中国有、日本还没有（中国的条目问"日本有没有"）；china：日本有、中国还没有（反方向）；
 * us：美国有、日本还没有（美国的条目问"日本有没有"，和 japan 共用同一组字段，靠 origin 分开）。
 */
export type GapSide = "japan" | "china" | "us";

/** 一条报告条目在某个方向上的比较结果（两个方向存在不同的字段里）。 */
function sideOf(item: BriefItem, side: GapSide) {
  return side === "china"
    ? { text: item.china_side, check: item.china_check, whyNow: item.china_why_now, funded: item.china_funded }
    : { text: item.japan, check: item.japan_check, whyNow: item.japan_why_now, funded: item.japan_funded };
}

/** 两个"问日本有没有"的方向靠出发地分开；老数据没有 origin，都算中国的。 */
function originMatches(item: BriefItem, side: GapSide): boolean {
  if (side === "us") return item.origin === "us";
  if (side === "japan") return item.origin !== "us";
  return true;
}

/** 每个方向上"那边 / 这边"叫什么。 */
export function gapPlaces(side: GapSide): { there: string; here: string } {
  if (side === "china") return { there: "日本", here: "中国" };
  return { there: side === "us" ? "美国" : "中国", here: "日本" };
}

export function isJapanGap(item: BriefItem, side: GapSide = "japan"): boolean {
  const s = sideOf(item, side);
  if (item.extra || !s.text || !s.check || !originMatches(item, side)) return false;
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
    `${gapPlaces(side).there}有、${gapPlaces(side).here}还没有：${gap.headline}`,
    `${gapPlaces(side).here}这边：${gap.japan}`,
    `读到：${gap.title}（${gap.source}）`,
    gap.url ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 变成一个想法时预填的内容：只填清单里有依据的两格（替代方案 = 这边现在怎样，方案 = 把那边的做法搬过来），
 * 目标用户、痛点、愿付多少留给他自己写 —— 那几格才是要去验证的。状态是"观察"，不跳级。
 */
export function gapIdeaDraft(gap: JapanGap, side: GapSide = "japan") {
  const { there, here } = gapPlaces(side);
  return {
    title: `${here}版：${gap.headline}`.slice(0, 60),
    hypothesis: {
      alternative: `${here}这边：${gap.japan}`,
      solution: `把${there}已经跑通的做法带到${here}：${gap.headline}`,
      ...(gap.whyNow ? { why_insufficient: `为什么是现在：${gap.whyNow}` } : {}),
    },
    tags: ["外部", side === "us" ? "美日差距" : "中日差距"],
  };
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
