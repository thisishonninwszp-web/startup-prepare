import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { runDailyQuestionResearch } from "@/lib/domains/signals/questions";

// Vercel 免费版最多两个定时任务，这一个顺便承担"每天给在追的问题查一轮"：
// 日本时间早上 6:30 跑，7 点的每日报告就能用上新查到的证据。查一轮要二三十秒。
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [purge, questions] = await Promise.all([
    supabaseAdmin.rpc("purge_expired_ai_calls"),
    runDailyQuestionResearch().catch((e) => ({ researched: 0, failed: [e instanceof Error ? e.message : String(e)] })),
  ]);
  if (purge.error) {
    return NextResponse.json({ error: purge.error.message, questions }, { status: 500 });
  }

  return NextResponse.json({ deleted: purge.data ?? 0, questions });
}
