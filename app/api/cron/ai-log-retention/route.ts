import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { runDailyQuestionResearch } from "@/lib/domains/signals/questions";
import { fetchAllSignals } from "@/lib/domains/signals/brief";

// Vercel 免费版最多两个定时任务，这一个顺便承担外部信号的两件事（日本时间早上 6:30）：
// ① 先把新闻和 GitHub 抓好 —— 7 点那个任务只管生成五节报告，不然加起来会逼近 60 秒上限；
// ② 给在追的问题查一轮，7 点的报告就能用上新查到的证据。两件同时跑，各二三十秒。
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [purge, fetched, questions] = await Promise.all([
    supabaseAdmin.rpc("purge_expired_ai_calls"),
    fetchAllSignals().catch((e) => ({ news: 0, tools: 0, failed: [e instanceof Error ? e.message : String(e)] })),
    runDailyQuestionResearch().catch((e) => ({ researched: 0, failed: [e instanceof Error ? e.message : String(e)] })),
  ]);
  if (purge.error) {
    return NextResponse.json({ error: purge.error.message, fetched, questions }, { status: 500 });
  }

  return NextResponse.json({ deleted: purge.data ?? 0, fetched, questions });
}
