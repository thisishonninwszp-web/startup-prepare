import { loadQuestionBreakdowns } from "./breakdown";
import { anchorOf, boardSections, loadForecastBoard } from "./forecast";
import { groupBySignal, type InlineQuestion } from "./inline-questions-shared";

export * from "./inline-questions-shared";

/** 这一份报告里哪几条新闻挂着等他判断的题（题库是主账号那一池的，判断是他自己的）。迁移没跑、取不到就当没有。 */
export async function inlineQuestions(userId: string, today: string, itemIds: string[]): Promise<Record<string, InlineQuestion[]>> {
  if (itemIds.length === 0) return {};
  const board = await loadForecastBoard(userId);
  if (board === "missing-schema") return {};
  const s = boardSections(board, today);
  const linked = s.toForecast.filter((q) => q.source.signal_id && itemIds.includes(q.source.signal_id));
  if (linked.length === 0) return {};
  const breakdowns = await loadQuestionBreakdowns(linked.map((q) => q.id));
  return groupBySignal(linked, itemIds, s.blind, (q) => anchorOf(q, board.forecasts), board.forecasts, breakdowns);
}
