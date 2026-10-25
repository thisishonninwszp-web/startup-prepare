import { supabaseAdmin } from "@/lib/supabase";
import { selectAll } from "@/lib/supabase-all";
import { sharedViewFor } from "./users";
import { cleanSnippet } from "./memory-shared";
import { preferenceForItem, readingEventKey, type ReadingPreference, type ReadingPreferencesState, type ReadingPreferenceValue } from "./reading-preferences-shared";

export const READING_PREFERENCES_MISSING = "关注与静音尚未启用，请联系维护者完成数据库更新。";

function missing(error: { code?: string; message: string }): boolean {
  return (error.code === "42P01" || error.code === "PGRST205") && /signal_reading_preferences/.test(error.message);
}

export async function loadReadingPreferences(userId: string): Promise<ReadingPreferencesState> {
  const { data, error } = await supabaseAdmin.from("signal_reading_preferences")
    .select("signal_id,event_key,event_label,preference,created_at,updated_at,external_signals!inner(title,source,fetched_at)")
    .eq("user_id", userId).order("updated_at", { ascending: false });
  if (error) {
    if (missing(error)) return { status: "missing-schema", preferences: [] };
    throw new Error(error.message);
  }
  const rows = (data ?? []) as unknown as (Omit<ReadingPreference, "title" | "source" | "fetched_at"> & { external_signals: { title: string | null; source: string; fetched_at: string } })[];
  return { status: "ready", preferences: rows.map(({ external_signals: signal, ...p }) => ({ ...p, ...signal, title: signal.title ? cleanSnippet(signal.title) : null })) };
}

/** Derive event labels from the report being viewed, rather than trusting a client-provided label. */
export async function reportEventsForSignals(userId: string, signalIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(signalIds)].filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  if (ids.length === 0) return new Map();
  const { sourceUserId } = await sharedViewFor(userId);
  const result = new Map<string, string>();
  for (let offset = 0; offset < ids.length; offset += 20) {
    const batch = ids.slice(offset, offset + 20);
    const wanted = new Set(batch);
    // Only UUIDs enter this PostgREST expression; target the articles, not a recent-history cutoff.
    const filter = batch.map((id) => `items.cs.${JSON.stringify([{ signal_id: id }])}`).join(",");
    const { data, error } = await selectAll<{ items: unknown }>((from, to) => supabaseAdmin.from("signal_briefs").select("items")
      .eq("user_id", sourceUserId).or(filter).order("brief_date", { ascending: false }).order("id", { ascending: true }).range(from, to));
    if (error) throw new Error(error.message);
    for (const row of data) {
      for (const item of (Array.isArray(row.items) ? row.items : []) as { signal_id?: string; event?: string }[]) {
        if (item.signal_id && wanted.has(item.signal_id) && item.event && !result.has(item.signal_id)) result.set(item.signal_id, item.event);
      }
    }
  }
  return result;
}

export async function setReadingPreference(userId: string, signalId: string, preference: ReadingPreferenceValue): Promise<void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(signalId)) throw new Error("找不到这条新闻");
  if (preference !== "follow" && preference !== "mute") throw new Error("不支持这个阅读偏好");
  const { data, error } = await supabaseAdmin.from("external_signals").select("id").eq("id", signalId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("找不到这条新闻");
  const events = await reportEventsForSignals(userId, [signalId]);
  const event = events.get(signalId)?.trim().slice(0, 200) || null;
  const state = await loadReadingPreferences(userId);
  if (state.status === "missing-schema") throw new Error(READING_PREFERENCES_MISSING);
  const existing = preferenceForItem({ signal_id: signalId, event }, state.preferences);
  const now = new Date().toISOString();
  const { error: writeError } = await supabaseAdmin.from("signal_reading_preferences").upsert({
    user_id: userId, signal_id: existing?.signal_id ?? signalId,
    event_key: existing?.event_key ?? readingEventKey(signalId, event), event_label: existing?.event_label ?? event,
    preference, created_at: existing?.created_at ?? now, updated_at: now,
  }, { onConflict: "user_id,event_key" });
  if (writeError) throw new Error(missing(writeError) ? READING_PREFERENCES_MISSING : writeError.message);
}

export async function clearReadingPreference(userId: string, eventKey: string): Promise<void> {
  if (typeof eventKey !== "string" || !eventKey || eventKey.length > 250) throw new Error("找不到这个阅读偏好");
  const { error } = await supabaseAdmin.from("signal_reading_preferences").delete().eq("user_id", userId).eq("event_key", eventKey);
  if (error) throw new Error(missing(error) ? READING_PREFERENCES_MISSING : error.message);
}
