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
  /** 那边是怎么回事（报告里写的背景）；一个月后重查时拿它去问。早期数据可能是空的。 */
  background: string;
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
        background: item.background,
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

// ── 每月重查 ───────────────────────────────────────────────────────────────

/** 进清单（或上次重查）满多少天再查一次"这边现在有没有"。 */
export const RECHECK_AFTER_DAYS = 30;

/** 一天最多重查几条（每条要上网搜两次，Tavily 免费额度有限）。攒多了就一天几条慢慢查。 */
export const RECHECKS_PER_DAY = 3;

/**
 * 一次重查的结果。still：还没有 / 没普及（查到出处）；arrived：有了（查到出处）；
 * unclear：没查到出处或说拿不准 —— 只算"查过了"，不挪动清单。
 */
export type GapRecheck = {
  signal_id: string;
  side: GapSide;
  checked_on: string;
  verdict: "still" | "arrived" | "unclear";
  japan: string;
  source_check: AnalogCheck | null;
  funded: JapanGap["funded"] | null;
};

/** 重查的结论只认查到出处的：没出处的"有了"可能是 AI 的印象，不能把一条从清单里挪走。 */
export function recheckVerdict(japan: string, check: AnalogCheck | undefined): GapRecheck["verdict"] {
  if (!check || check.status === "unverified") return "unclear";
  if (japan.startsWith("有，")) return "arrived";
  if (GAP_OPENERS.some((o) => japan.startsWith(o))) return "still";
  return "unclear";
}

/** 每条在每个方向上最近的那次重查（rechecks 不要求排好序）。 */
function latestRechecks(rechecks: GapRecheck[]): Map<string, GapRecheck> {
  const latest = new Map<string, GapRecheck>();
  for (const r of rechecks) {
    const key = `${r.side}:${r.signal_id}`;
    const prev = latest.get(key);
    if (!prev || r.checked_on > prev.checked_on) latest.set(key, r);
  }
  return latest;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export type OpenGap = JapanGap & {
  /** 最近一次查是哪天：重查过就是重查那天，否则是进清单那天。 */
  lastChecked: string;
  /** 最近一次重查（结论还是没有，或没查清）。没重查过就没有。 */
  recheck?: { on: string; verdict: "still" | "unclear" };
};

export type ArrivedGap = JapanGap & {
  arrivedOn: string;
  /** 重查时写的"这边现在怎样"，和它的出处。 */
  now: string;
  nowCheck: AnalogCheck | null;
  nowFunded: JapanGap["funded"] | null;
};

/** 把重查结果贴回清单：最近一次重查说"有了"的挪出来单列，其余标上最近一次查是哪天。 */
export function applyRechecks(
  gaps: JapanGap[],
  rechecks: GapRecheck[],
  side: GapSide
): { open: OpenGap[]; arrived: ArrivedGap[] } {
  const latest = latestRechecks(rechecks.filter((r) => r.side === side));
  const open: OpenGap[] = [];
  const arrived: ArrivedGap[] = [];
  for (const g of gaps) {
    const r = latest.get(`${side}:${g.signal_id}`);
    if (r?.verdict === "arrived") {
      arrived.push({ ...g, arrivedOn: r.checked_on, now: r.japan, nowCheck: r.source_check, nowFunded: r.funded });
    } else {
      open.push({
        ...g,
        lastChecked: r && r.checked_on > g.brief_date ? r.checked_on : g.brief_date,
        ...(r ? { recheck: { on: r.checked_on, verdict: r.verdict as "still" | "unclear" } } : {}),
      });
    }
  }
  return { open, arrived: arrived.sort((a, b) => b.arrivedOn.localeCompare(a.arrivedOn)) };
}

/** 该重查的：上次查已经过了 RECHECK_AFTER_DAYS 天，最久没查的排前面，最多 max 条。 */
export function dueForRecheck(open: (OpenGap & { side: GapSide })[], today: string, max: number): (OpenGap & { side: GapSide })[] {
  return open
    .filter((g) => daysBetween(g.lastChecked, today) >= RECHECK_AFTER_DAYS)
    .sort((a, b) => a.lastChecked.localeCompare(b.lastChecked))
    .slice(0, max);
}
