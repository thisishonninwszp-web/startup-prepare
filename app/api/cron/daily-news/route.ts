import { NextResponse } from "next/server";
import { runDailySignals } from "@/lib/domains/signals/brief";

// 抓 RSS + 补简介 + 抓 GitHub + 生成四节精选 + 今日总览 + 算指纹 + 发邮件。项目开了 Fluid Compute，免费版一次最多 300 秒。
export const maxDuration = 300;

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
