import { supabaseAdmin } from "@/lib/supabase";
import { selectAll } from "@/lib/supabase-all";
import { validReadingDate, type ReadingSessionState } from "./reading-session-shared";

export const READING_SETUP_MESSAGE = "阅读记录尚未启用，请联系维护者完成数据库更新。仍可正常阅读。";

function missing(error: { code?: string; message: string } | null): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /relation .+ does not exist|Could not find the table/.test(error.message));
}

export async function loadReadingSession(userId: string, date: string, ids: string[]): Promise<ReadingSessionState> {
  const [stop, opens] = await Promise.all([
    supabaseAdmin.from("signal_reading_sessions").select("signal_ids, stopped_at").eq("user_id", userId).eq("report_date", date).maybeSingle(),
    ids.length ? selectAll<{ signal_id: string }>((from, to) => supabaseAdmin.from("signal_opens").select("signal_id").eq("user_id", userId).in("signal_id", ids).order("opened_on", { ascending: false }).order("signal_id").range(from, to)) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [stop, opens]) {
    if (result.error && !missing(result.error)) throw new Error(result.error.message);
  }
  return {
    available: !stop.error,
    opensAvailable: !opens.error,
    openedIds: [...new Set((opens.data ?? []).map((row) => row.signal_id as string))],
    stoppedIds: stop.data ? (stop.data.signal_ids as string[]) : null,
    stoppedAt: stop.data ? (stop.data.stopped_at as string) : null,
  };
}

export async function saveReadingOpen(userId: string, signalId: string): Promise<void> {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(signalId)) throw new Error("这条新闻的地址不对。");
  const openedOn = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const { error } = await supabaseAdmin.from("signal_opens").upsert({
    user_id: userId, signal_id: signalId, opened_on: openedOn, via: "report",
  }, { onConflict: "user_id,signal_id,opened_on", ignoreDuplicates: true });
  if (error) throw new Error(missing(error) ? READING_SETUP_MESSAGE : error.message);
}

export async function saveReadingStop(userId: string, date: string, ids: string[]): Promise<void> {
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  if (!validReadingDate(date, today) || ids.length === 0 || ids.length > 200 || ids.some((id) => !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))) {
    throw new Error("这份阅读记录不完整，请刷新报告后再试。");
  }
  const { error } = await supabaseAdmin.from("signal_reading_sessions").upsert({
    user_id: userId, report_date: date, signal_ids: [...new Set(ids)], stopped_at: new Date().toISOString(),
  }, { onConflict: "user_id,report_date" });
  if (error) throw new Error(missing(error) ? READING_SETUP_MESSAGE : error.message);
}
