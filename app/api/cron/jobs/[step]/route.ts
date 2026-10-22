import { NextResponse } from "next/server";
import { tokyoToday } from "@/lib/domains/signals/brief";
import { embedBacklog } from "@/lib/domains/signals/memory";
import { activeSignalUsers, createArrivalQuestions, createBusinessQuestions, forecastPending, importMarkets, resolveDue } from "@/lib/domains/signals/forecast";
import { refreshAppWatch } from "@/lib/domains/signals/app-watch";
import { runHistoryStep } from "@/lib/domains/signals/backtest";
import { loadExperimentBoard } from "@/lib/domains/signals/experiments";

/**
 * 外部信号的后台步骤，由 GitHub Actions（.github/workflows/signals-jobs.yml）定时一步一步调：
 * 每次一分钟以内做一小份，返回 done（做完了没有）；没做完 Actions 会再调一次。
 * Vercel 免费版只有两个定时任务，量大的活（算指纹、AI 押题）放这里。只认 CRON_SECRET。
 * 项目开了 Fluid Compute（他确认过，2026-10-22），免费版一次最多 300 秒；每一步照样按时间预算做，留出一道最慢的余量。
 */
export const maxDuration = 300;

/** 开始下一道之前，已经用了这么久就停（一道最慢六七十秒，300 秒上限里留足余量）。 */
const START_BEFORE_MS = 200_000;

type Result = { done: boolean; did: number; remaining?: number; note?: string; ms?: number };

const STEPS: Record<string, (users: string[], today: string) => Promise<Result>> = {
  // 新闻算指纹（全站共用一张表，不分人）
  embed: async () => {
    const r = await embedBacklog(1000);
    return { done: r.remaining === 0, did: r.embedded, remaining: r.remaining };
  },
  // 到期的题对账（市场题问平台、生意题查证据）
  resolve: async (users, today) => {
    let did = 0;
    let remaining = 0;
    for (const u of users) {
      const r = await resolveDue(u, today, START_BEFORE_MS);
      did += r.did;
      remaining += r.remaining;
      // 自己实验的预测：代码对账，读一遍就对了（迁移 095 没跑就跳过）
      await loadExperimentBoard(u, today).catch(() => null);
    }
    return { done: remaining === 0 || did === 0, did, remaining };
  },
  // 从预测市场进新题（一次两道）
  markets: async (users, today) => {
    let did = 0;
    for (const u of users) did += await importMarkets(u, today, 2);
    return { done: true, did };
  },
  // 从今天的报告出生意题、从差距清单出到日本题（各一天一次）
  business: async (users, today) => {
    let did = 0;
    for (const u of users) {
      did += await createBusinessQuestions(u, today);
      did += await createArrivalQuestions(u, today).catch((e) => {
        console.error("arrival question", e);
        return 0;
      });
    }
    return { done: true, did };
  },
  // 领先指标：上过中国 App 榜的 App 在日本上架了没有、加了日语没有（全站共用，不调 AI）
  indicators: async (_users, today) => {
    const r = await refreshAppWatch(today);
    return { done: true, did: r.events, note: `查了 ${r.checked} 个` };
  },
  // AI 三种思路押还没押的题：按时间预算做（一道二三十秒，过了 200 秒就不开始下一道）
  forecast: async (users, today) => {
    let did = 0;
    let remaining = 0;
    for (const u of users) {
      const r = await forecastPending(u, today, START_BEFORE_MS);
      did += r.did;
      remaining += r.remaining;
    }
    return { done: remaining === 0 || did === 0, did, remaining };
  },
  // 历史回测的题库（全站共用，不分人；.github/workflows/signals-history.yml 每 3 小时调）：进候选、准备题目、AI 当时会说几成
  history: async (_users, today) => runHistoryStep(today, START_BEFORE_MS),
};

/** 这几步跟账号无关，不用先查给谁跑。 */
const SHARED_STEPS = new Set(["embed", "history", "indicators"]);

export async function GET(request: Request, { params }: { params: { step: string } }) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const run = STEPS[params.step];
  if (!run) return NextResponse.json({ error: `没有这一步：${params.step}` }, { status: 404 });
  const started = Date.now();
  try {
    const users = SHARED_STEPS.has(params.step) ? [] : await activeSignalUsers();
    // 回报这一次用了多少毫秒：Actions 的日志里看得出离 60 秒还有多远
    return NextResponse.json({ ...(await run(users, tokyoToday())), ms: Date.now() - started });
  } catch (error) {
    // 出错也回 done，免得 Actions 一直重试同一个错；错误写在 note 里，Actions 的日志能看到
    const message = error instanceof Error ? error.message : "出错了";
    return NextResponse.json({ done: true, did: 0, note: message, ms: Date.now() - started }, { status: 200 });
  }
}
