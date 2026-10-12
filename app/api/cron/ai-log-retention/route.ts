import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { runDailyQuestionResearch } from "@/lib/domains/signals/questions";
import { EARLY_KINDS, fetchAllSignals, generateBriefsForRecentUsers } from "@/lib/domains/signals/brief";

// Vercel 免费版最多两个定时任务，这一个顺便承担外部信号的两件事（日本时间早上 6:30）：
// ① 先把新闻、GitHub、中国 App 榜抓好，接着生成"谁在掏钱"一节
//    （7 点那个任务生成另外四节再发邮件；五节一起会逼近 60 秒上限）；
// ② 给在追的问题查一轮，7 点的报告就能用上新查到的证据。两件同时跑，各三四十秒。
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [purge, fetched, questions] = await Promise.all([
    supabaseAdmin.rpc("purge_expired_ai_calls"),
    fetchAllSignals()
      .then(async (fetched) => ({ fetched, early: await generateBriefsForRecentUsers(EARLY_KINDS) }))
      .catch((e) => ({ fetched: { news: 0, tools: 0, failed: [e instanceof Error ? e.message : String(e)] }, early: null })),
    runDailyQuestionResearch().catch((e) => ({ researched: 0, failed: [e instanceof Error ? e.message : String(e)] })),
  ]);
  if (purge.error) {
    return NextResponse.json({ error: purge.error.message, fetched, questions }, { status: 500 });
  }

  return NextResponse.json({ deleted: purge.data ?? 0, fetched, questions });
}
