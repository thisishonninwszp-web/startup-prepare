import { boardSections, loadForecastBoard, sidesOf, type ForecastQuestion } from "./forecast";
import { followedSignals, resurfacedOne, storyUpdates, type Resurfaced } from "./memory";
import type { StoryUpdate } from "./memory-shared";
import { sharedViewFor } from "./users";

/**
 * 「今天」一页（外部信号重构第三步）里因人而异的几块，邮件也用同一份：
 * 他在跟的事有没有新消息、回头看一条、预测题里等他做的。全是代码算的，不调 AI。
 */

/** 「有新消息」看最近多少小时抓到的：早上 6 点的邮件要盖住前一天一整天。 */
export const STORY_WINDOW_HOURS = 30;

export type TodayForecast = {
  toForecast: ForecastQuestion[];
  toConfirm: number;
  justResolved: { q: ForecastQuestion; me: number | null; ai: number | null; market: number | null }[];
};

export type TodayPersonal = {
  /** 他在跟几件事（0 = 还没标过、没记成观察、没写过判断）。 */
  followedCount: number;
  /** null = 迁移 093 没跑；"error" = 这次没取到。 */
  stories: StoryUpdate[] | null | "error";
  lookBack: Resurfaced | null;
  /** null = 迁移 091 没跑或这次没取到。 */
  forecast: TodayForecast | null;
};

function logged<T>(what: string, fallback: T) {
  return (e: unknown): T => {
    console.error(`today: ${what}`, e);
    return fallback;
  };
}

export async function loadTodayPersonal(userId: string, today: string): Promise<TodayPersonal> {
  const view = await sharedViewFor(userId);
  const since = new Date(Date.now() - STORY_WINDOW_HOURS * 3_600_000).toISOString();
  const [followed, lookBack, board] = await Promise.all([
    followedSignals(userId, view.shared).catch(logged("followed", null)),
    resurfacedOne(userId, today).catch(logged("look back", null)),
    loadForecastBoard(userId).catch(logged("forecast", null)),
  ]);
  const stories: TodayPersonal["stories"] = followed === null ? "error" : await storyUpdates(followed, since, 2).catch(logged("stories", "error" as const));

  let forecast: TodayForecast | null = null;
  if (board && board !== "missing-schema") {
    const s = boardSections(board, today);
    forecast = {
      toForecast: s.toForecast,
      toConfirm: s.toConfirm.length,
      justResolved: s.justResolved.slice(0, 3).map((q) => ({ q, ...sidesOf(board.forecasts, q.id) })),
    };
  }
  return { followedCount: followed?.length ?? 0, stories, lookBack, forecast };
}
