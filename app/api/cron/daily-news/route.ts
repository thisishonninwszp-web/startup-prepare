import { NextResponse } from "next/server";
import { runDailySignals } from "@/lib/domains/signals/brief";

// 抓 RSS + 补简介 + 抓 GitHub + 生成两份精选，默认 10 秒不够。
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await runDailySignals());
  } catch (error) {
    const message = error instanceof Error ? error.message : "抓取失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
