import { supabaseAdmin } from "@/lib/supabase";
import { selectAll } from "@/lib/supabase-all";
import { followedSignals, marksFor, storyAround } from "./memory";
import { cleanSnippet, followReasonText, type ArchiveHit } from "./memory-shared";
import { addDays, FIRST_INTERVAL, nextInterval, type RecallResult } from "./recall-shared";
import { loadReadingPreferences, reportEventsForSignals } from "./reading-preferences";
import { partitionReadingItems } from "./reading-preferences-shared";

/**
 * 回想（迁移 098）：他在跟的新闻（标过、记成观察、写过判断的）按间隔重复来问他。
 * 第一次在他做那件事一周后；之后按他自己说的记得 / 模糊 / 忘了排。
 */

export const RECALL_MISSING = "迁移 098 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/098_signal_recall_share.sql。";

function missing(error: { message: string } | null): boolean {
  return !!error && /recall_reviews|does not exist|schema cache/.test(error.message);
}

export type RecallItem = { signal_id: string; title: string | null; fetched_at: string; reason: string; due_on: string; reviews: number };

/** 把在跟的、还没进回想的加进来（第一次在他做那件事一周后问）。迁移没跑返回 false。 */
async function syncRecall(userId: string, shared: boolean): Promise<boolean> {
  const [followed, existing] = await Promise.all([
    // 只是点开看过的不进回想（不是他自己说在意的）
    followedSignals(userId, shared).then((fs) => fs.filter((f) => f.reason !== "opened")),
    supabaseAdmin.from("recall_reviews").select("signal_id").eq("user_id", userId).limit(1000),
  ]);
  if (existing.error) {
    if (missing(existing.error)) return false;
    throw new Error(existing.error.message);
  }
  const have = new Set(((existing.data ?? []) as { signal_id: string }[]).map((r) => r.signal_id));
  const fresh = followed
    .filter((f) => !have.has(f.signal_id))
    .map((f) => ({ user_id: userId, signal_id: f.signal_id, interval_days: FIRST_INTERVAL, due_on: addDays(f.at.slice(0, 10), FIRST_INTERVAL) }));
  if (fresh.length > 0) {
    const { error } = await supabaseAdmin.from("recall_reviews").upsert(fresh, { onConflict: "user_id,signal_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  return true;
}

/** 今天该回想的（到期早的先）。迁移没跑返回 null。 */
export async function dueRecalls(userId: string, shared: boolean, today: string, limit = 20): Promise<{ items: RecallItem[]; total: number } | null> {
  if (!(await syncRecall(userId, shared))) return null;
  type Row = { signal_id: string; due_on: string; reviews: number; external_signals: { title: string | null; fetched_at: string } };
  const [{ data, error }, preferences] = await Promise.all([
    selectAll<Row>(async (from, to) => {
      const result = await supabaseAdmin
        .from("recall_reviews")
        .select("signal_id, due_on, reviews, external_signals!inner(title, fetched_at)")
        .eq("user_id", userId)
        .lte("due_on", today)
        .order("due_on", { ascending: true })
        .order("signal_id", { ascending: true })
        .range(from, to);
      return { data: result.data as unknown as Row[] | null, error: result.error };
    }),
    loadReadingPreferences(userId),
  ]);
  if (error) throw new Error(error.message);
  // 历史排期保留；展示时按当前读者的静音设置筛掉，恢复关注后仍能继续回想。
  // 先过滤再限额，避免静音记录占满首页名额；事件标签也从当前读者可见的报告取得。
  const events = preferences.preferences.some((p) => p.preference === "mute")
    ? await reportEventsForSignals(userId, data.map((row) => row.signal_id))
    : new Map<string, string>();
  const { visible } = partitionReadingItems(data.map((row) => ({ ...row, event: events.get(row.signal_id) })), preferences.preferences);
  const rows = visible.slice(0, limit);
  const marks = await marksFor(userId, rows.map((r) => r.signal_id));
  return {
    total: visible.length,
    items: rows.map((r) => {
      const m = marks.get(r.signal_id);
      return {
        signal_id: r.signal_id,
        title: r.external_signals.title ? cleanSnippet(r.external_signals.title) : null,
        fetched_at: r.external_signals.fetched_at,
        reason: m ? followReasonText({ reason: "mark", mark: m.mark }) : "你在跟这件事",
        due_on: r.due_on,
        reviews: r.reviews,
      };
    }),
  };
}

export type RecallReveal = { note: string | null; later: ArchiveHit[] };

/** 答案：他当时写的为什么在意、这件事后来的消息（算得上同一件事的）。 */
export async function recallReveal(userId: string, signalId: string): Promise<RecallReveal> {
  const [marks, story] = await Promise.all([marksFor(userId, [signalId]), storyAround(signalId, 4).catch(() => null)]);
  return { note: marks.get(signalId)?.note ?? null, later: story?.after ?? [] };
}

/** 他说记得 / 模糊 / 忘了：排下一次，返回下一次的日子。 */
export async function rateRecall(userId: string, signalId: string, result: RecallResult, today: string): Promise<string> {
  const { data, error } = await supabaseAdmin.from("recall_reviews").select("interval_days, reviews").eq("user_id", userId).eq("signal_id", signalId).maybeSingle();
  if (error) throw new Error(missing(error) ? RECALL_MISSING : error.message);
  const interval = nextInterval(data?.interval_days ?? FIRST_INTERVAL, result);
  const due = addDays(today, interval);
  const { error: upsertError } = await supabaseAdmin.from("recall_reviews").upsert(
    {
      user_id: userId,
      signal_id: signalId,
      interval_days: interval,
      due_on: due,
      reviews: (data?.reviews ?? 0) + 1,
      last_result: result,
      last_at: new Date().toISOString(),
    },
    { onConflict: "user_id,signal_id" }
  );
  if (upsertError) throw new Error(upsertError.message);
  return due;
}
