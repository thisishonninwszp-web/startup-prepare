import { boardSections, loadForecastBoard, shownAi, sidesOf, type ForecastQuestion } from "./forecast";
import { aiCalibration, drillProgress } from "./backtest";
import { loadExperimentBoard } from "./experiments";
import { followedSignals, storyUpdates } from "./memory";
import { dueRecalls, type RecallItem } from "./recall";
import { RECALL_PER_DAY } from "./recall-shared";
import type { StoryUpdate } from "./memory-shared";
import { sharedViewFor } from "./users";

/**
 * 「今天」一页（外部信号重构第三步）里因人而异的几块，邮件也用同一份：
 * 他在跟的事有没有新消息、回头看一条、预测题里等他做的。全是代码算的，不调 AI。
 */

/** 「有新消息」看最近多少小时抓到的：早上 6 点的邮件要盖住前一天一整天。 */
export const STORY_WINDOW_HOURS = 30;

export type TodayForecast = {
  /** 校准练习：今天做了几道、题库里还有没有没做的（迁移 094 没跑为 null）。 */
  drill: { today: number; left: number } | null;
  /** 自己的实验：能先猜的几道、到期了等他填周刊数的几道。 */
  experiments: { proposals: number; waiting: number } | null;
  toForecast: ForecastQuestion[];
  /** 邮件里一键的那一道：等判断的第一道、是不是先判题、卡片上显示的 AI 数（AI 没判是 null）。 */
  quick: { q: ForecastQuestion; blind: boolean; ai: number | null } | null;
  toConfirm: number;
  justResolved: { q: ForecastQuestion; me: number | null; ai: number | null; market: number | null }[];
};

export type TodayPersonal = {
  /** 他在跟几件事（0 = 还没标过、没记成观察、没写过判断）。 */
  followedCount: number;
  /** null = 迁移 093 没跑；"error" = 这次没取到。 */
  stories: StoryUpdate[] | null | "error";
  /** 今天该回想的（最多 RECALL_PER_DAY 条）和一共几条到期；null = 迁移 098 没跑或这次没取到。 */
  recall: { items: RecallItem[]; total: number } | null;
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
  const [followed, recall, board, drill] = await Promise.all([
    followedSignals(userId, view.shared).catch(logged("followed", null)),
    dueRecalls(userId, view.shared, today, RECALL_PER_DAY).catch(logged("recall", null)),
    loadForecastBoard(userId).catch(logged("forecast", null)),
    drillProgress(userId, today).catch(logged("drill", null)),
  ]);
  const experiments = await loadExperimentBoard(userId, today).catch(logged("experiments", null));
  const stories: TodayPersonal["stories"] = followed === null ? "error" : await storyUpdates(followed, since, 2).catch(logged("stories", "error" as const));

  let forecast: TodayForecast | null = null;
  if (board && board !== "missing-schema") {
    const s = boardSections(board, today);
    const first = s.toForecast[0];
    const raw = first ? board.forecasts.find((f) => f.question_id === first.id && f.source === "ai")?.probability ?? null : null;
    const platt = raw === null ? null : await aiCalibration().catch(logged("calibration", null));
    forecast = {
      drill: drill && drill !== "missing-schema" ? { today: drill.today, left: drill.left } : null,
      experiments: experiments && experiments !== "missing-schema" ? { proposals: experiments.proposals.length, waiting: experiments.waiting.length } : null,
      toForecast: s.toForecast,
      quick: first ? { q: first, blind: s.blind.has(first.id), ai: raw === null ? null : shownAi(raw, platt) } : null,
      toConfirm: s.toConfirm.length,
      justResolved: s.justResolved.slice(0, 3).map((q) => ({ q, ...sidesOf(board.forecasts, q.id) })),
    };
  }
  return { followedCount: followed?.length ?? 0, stories, recall, forecast };
}
