import type { Breakdown } from "./breakdown-shared";
import type { Anchor, Forecast, ForecastQuestion } from "./forecast-shared";

/**
 * 读报时就地判断（经用户同意，2026-10-30）：他会读、会标，不会专门去做题 —— 10-23 到 10-30 一周，
 * 点开新闻 15 次、标了 6 条，预测和练习加起来 2 道。所以一条新闻挂着题（生意题、到日本题都从新闻出，
 * source.signal_id 就是那条新闻）的话，他展开这条时就在原地摆出来，点一下就记。这里是不碰数据库的部分。
 */
export type InlineQuestion = { q: ForecastQuestion; blind: boolean; anchor: Anchor | null; three: Forecast[]; breakdown: Breakdown | null };

/** 一条新闻最多就地摆几道（多了就不是读报了）。 */
export const INLINE_PER_ITEM = 2;

const THREE_VIEWS = ["ai_outside", "ai_inside", "ai_devil"];

/**
 * 把等他判断的题按新闻分好：只收挂着这一份报告里某条新闻的；先判题在前，再按截止早的在前；每条最多 INLINE_PER_ITEM 道。
 * waiting 是 boardSections 的 toForecast（已经去掉了判过的、跳过的、到期的）。
 */
export function groupBySignal(
  waiting: ForecastQuestion[],
  itemIds: string[],
  blind: Set<string>,
  anchorFor: (q: ForecastQuestion) => Anchor | null,
  forecasts: Forecast[],
  breakdowns: Map<string, Breakdown>
): Record<string, InlineQuestion[]> {
  const ids = new Set(itemIds);
  const out: Record<string, InlineQuestion[]> = {};
  const sorted = [...waiting].sort((a, b) => Number(blind.has(b.id)) - Number(blind.has(a.id)) || a.resolve_on.localeCompare(b.resolve_on));
  for (const q of sorted) {
    const sid = q.source.signal_id;
    if (!sid || !ids.has(sid)) continue;
    const list = (out[sid] ??= []);
    if (list.length >= INLINE_PER_ITEM) continue;
    const isBlind = blind.has(q.id);
    list.push({
      q,
      blind: isBlind,
      anchor: isBlind ? null : anchorFor(q),
      three: forecasts.filter((f) => f.question_id === q.id && THREE_VIEWS.includes(f.source)),
      breakdown: breakdowns.get(q.id) ?? null,
    });
  }
  return out;
}
