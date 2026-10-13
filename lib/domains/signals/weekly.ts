import { supabaseAdmin } from "@/lib/supabase";
import { writeWeeklyDigest, type WeeklyDayInput } from "@/lib/ai";
import type { BriefItem } from "./brief";
import { REPORT_SECTION_KINDS } from "./feeds";

/**
 * 周报：上一周（周一到周日）七天的报告连起来看，哪些事一直在冒、哪些只响了一天。
 * 存在 signal_briefs 里 kind = weekly 的那一行，brief_date 是那周的周一：
 * overview 是正文，items 是"不止一天冒出来的事"（每条带引用的消息，代码核对过来自至少两天）。
 * 第一次打开周报页时生成；周复盘会读它。
 */

export type WeeklyThreadItem = { title: string; note: string; refs: { signal_id: string; headline: string; date: string }[] };
export type Weekly = { weekStart: string; weekEnd: string; summary: string; threads: WeeklyThreadItem[] };

function shift(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** today（东京日期）所在周的前一周：周一到周日。 */
export function lastWeekRange(today: string): { start: string; end: string } {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = 周日
  const thisMonday = shift(today, -((dow + 6) % 7));
  return { start: shift(thisMonday, -7), end: shift(thisMonday, -1) };
}

/** 这一周的周报；还没生成返回 null。 */
export async function getWeekly(userId: string, weekStart: string): Promise<Weekly | null> {
  const { data, error } = await supabaseAdmin
    .from("signal_briefs")
    .select("overview, items")
    .eq("user_id", userId)
    .eq("brief_date", weekStart)
    .eq("kind", "weekly")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    weekStart,
    weekEnd: shift(weekStart, 6),
    summary: (data.overview as string) ?? "",
    threads: (data.items as WeeklyThreadItem[] | null) ?? [],
  };
}

/** 生成（或重新生成）这一周的周报。有报告的日子不到两天就返回 null。 */
export async function generateWeekly(userId: string, weekStart: string): Promise<Weekly | null> {
  const weekEnd = shift(weekStart, 6);
  const { data, error } = await supabaseAdmin
    .from("signal_briefs")
    .select("brief_date, kind, overview, items")
    .eq("user_id", userId)
    .gte("brief_date", weekStart)
    .lte("brief_date", weekEnd)
    .in("kind", [...REPORT_SECTION_KINDS, "digest"]);
  if (error) throw new Error(error.message);

  const byDate = new Map<string, typeof data>();
  for (const r of data ?? []) {
    const d = r.brief_date as string;
    byDate.set(d, [...(byDate.get(d) ?? []), r]);
  }
  const headlineOf = new Map<string, { headline: string; date: string }>();
  const days: WeeklyDayInput[] = Array.from(byDate.keys())
    .sort()
    .map((date) => {
      const rows = byDate.get(date) ?? [];
      const digest = rows.find((r) => r.kind === "digest");
      const sections = rows.filter((r) => r.kind !== "digest");
      const items = sections.flatMap((r) => ((r.items as BriefItem[] | null) ?? []).filter((i) => !i.extra));
      for (const i of items) headlineOf.set(i.signal_id, { headline: i.headline, date });
      const summary = digest
        ? (digest.overview as string) ?? ""
        : sections.map((r) => (r.overview as string | null) ?? "").filter(Boolean).join(" ");
      return { date, summary, items: items.map((i) => ({ signalId: i.signal_id, headline: i.headline })) };
    });
  if (days.filter((d) => d.items.length > 0).length < 2) return null;

  const written = await writeWeeklyDigest(days);
  const threads: WeeklyThreadItem[] = written.threads.map((t) => ({
    title: t.title,
    note: t.note,
    refs: t.signalIds
      .map((id) => ({ signal_id: id, ...(headlineOf.get(id) ?? { headline: "", date: "" }) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }));
  const { error: saveError } = await supabaseAdmin
    .from("signal_briefs")
    .upsert(
      { user_id: userId, brief_date: weekStart, kind: "weekly", overview: written.summary, items: threads },
      { onConflict: "user_id,brief_date,kind" }
    );
  if (saveError) {
    if (/kind_check|check constraint/.test(saveError.message)) throw new Error("迁移 062 还没跑");
    throw new Error(saveError.message);
  }
  return { weekStart, weekEnd, summary: written.summary, threads };
}

/** 周复盘用：这一周有周报就给正文和几条线。 */
export function weeklyAsText(w: Weekly): string {
  return [w.summary, ...w.threads.map((t) => `· ${t.title}：${t.note}`)].join("\n");
}

