import { NextResponse } from "next/server";
import { tokyoToday } from "@/lib/domains/signals/brief";
import { embedBacklog } from "@/lib/domains/signals/memory";
import { activeSignalUsers, createBusinessQuestions, forecastPending, importMarkets, resolveDue } from "@/lib/domains/signals/forecast";

/**
 * 外部信号的后台步骤，由 GitHub Actions（.github/workflows/signals-jobs.yml）定时一步一步调：
 * 每次一分钟以内做一小份，返回 done（做完了没有）；没做完 Actions 会再调一次。
 * Vercel 免费版只有两个定时任务、一次 60 秒，量大的活（算指纹、AI 押题）放这里。只认 CRON_SECRET。
 */
export const maxDuration = 60;

type Result = { done: boolean; did: number; remaining?: number; note?: string };

const STEPS: Record<string, (users: string[], today: string) => Promise<Result>> = {
  // 新闻算指纹（全站共用一张表，不分人）
  embed: async () => {
    const r = await embedBacklog(300);
    return { done: r.remaining === 0, did: r.embedded, remaining: r.remaining };
  },
  // 到期的题对账（市场题问平台、生意题查证据）
  resolve: async (users, today) => {
    let did = 0;
    let remaining = 0;
    for (const u of users) {
      const r = await resolveDue(u, today);
      did += r.did;
      remaining += r.remaining;
    }
    return { done: remaining === 0 || did === 0, did, remaining };
  },
  // 从预测市场进新题（一次两道）
  markets: async (users, today) => {
    let did = 0;
    for (const u of users) did += await importMarkets(u, today, 2);
    return { done: true, did };
  },
  // 从今天的报告出生意题（一天一次）
  business: async (users, today) => {
    let did = 0;
    for (const u of users) did += await createBusinessQuestions(u, today);
    return { done: true, did };
  },
  // AI 三种思路押还没押的题（一次两道）
  forecast: async (users, today) => {
    let did = 0;
    let remaining = 0;
    for (const u of users) {
      const r = await forecastPending(u, today, 2);
      did += r.did;
      remaining += r.remaining;
    }
    return { done: remaining === 0 || did === 0, did, remaining };
  },
};

export async function GET(request: Request, { params }: { params: { step: string } }) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const run = STEPS[params.step];
  if (!run) return NextResponse.json({ error: `没有这一步：${params.step}` }, { status: 404 });
  try {
    const users = params.step === "embed" ? [] : await activeSignalUsers();
    return NextResponse.json(await run(users, tokyoToday()));
  } catch (error) {
    // 出错也回 done，免得 Actions 一直重试同一个错；错误写在 note 里，Actions 的日志能看到
    const message = error instanceof Error ? error.message : "出错了";
    return NextResponse.json({ done: true, did: 0, note: message }, { status: 200 });
  }
}
