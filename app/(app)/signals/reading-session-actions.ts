"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sharedViewFor } from "@/lib/domains/signals/users";
import { tokyoToday } from "@/lib/domains/signals/brief";
import { readingSnapshot, validReadingDate } from "@/lib/domains/signals/reading-session-shared";
import { saveReadingStop, saveReadingOpen } from "@/lib/domains/signals/reading-session";
import { REPORT_SECTION_KINDS } from "@/lib/domains/signals/feeds";
import { getDailyReport } from "./queries";

export async function recordReadingOpenAction(signalId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) throw new Error("请先登录。");
    await saveReadingOpen(user.id, signalId);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "打开记录暂未同步，请稍后重试。" };
  }
}

export async function stopReadingAction(date: string, signalIds: string[]): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) throw new Error("请先登录。");
    if (!validReadingDate(date, tokyoToday()) || !Array.isArray(signalIds) || signalIds.length > 200) throw new Error("阅读记录的日期或内容不对。");
    const view = await sharedViewFor(user.id);
    const report = await getDailyReport(view.sourceUserId, date);
    if (report === "missing-schema") throw new Error("报告还没准备好。");
    const allowed = REPORT_SECTION_KINDS.flatMap((kind) => (report[kind]?.items ?? []).filter((item) => !item.extra).map((item) => item.signal_id));
    await saveReadingStop(user.id, date, readingSnapshot(signalIds, allowed));
    revalidatePath("/signals");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "这次没记住阅读结束，请重试。" };
  }
}
