import { supabaseAdmin } from "@/lib/supabase";
import { storyAround } from "../memory";
import { isMissingEventSchema, validateText, validateUuid, type EventRecord, type TimelineEntry, type TimelineMode } from "./domain";
const pageLimit = (limit = 20) => Math.min(100, Math.max(1, Math.trunc(limit) || 20));

export async function listEvents(viewerId: string, options: { search?: string; cursor?: string; limit?: number } = {}): Promise<{ status: "ready"; items: EventRecord[]; nextCursor: string | null } | { status: "missing-schema"; items: []; nextCursor: null }> {
  validateUuid(viewerId);
  const { data, error } = await supabaseAdmin.rpc("list_signal_events", { p_user_id: viewerId, p_search: validateText(options.search ?? "", 200), p_cursor: options.cursor ?? null, p_limit: pageLimit(options.limit) });
  if (error) { if (isMissingEventSchema(error)) return { status: "missing-schema", items: [], nextCursor: null }; throw new Error(error.message); }
  return { status: "ready", items: data.items, nextCursor: data.nextCursor };
}
export async function getEvent(viewerId: string, eventId: string): Promise<EventRecord | null | "missing-schema"> {
  validateUuid(viewerId); validateUuid(eventId);
  const { data, error } = await supabaseAdmin.from("signal_events").select("id,title,scope_note,revision,created_at,archived_at").eq("user_id", viewerId).eq("id", eventId).maybeSingle();
  if (error) { if (isMissingEventSchema(error)) return "missing-schema"; throw new Error(error.message); }
  return data as EventRecord | null;
}
export async function listTimeline(viewerId: string, eventId: string, options: { mode: TimelineMode; cursor?: string; limit?: number }): Promise<{ items: TimelineEntry[]; nextCursor: string | null }> {
  validateUuid(viewerId); validateUuid(eventId);
  if (!["published", "occurred", "captured"].includes(options.mode)) throw new Error("无效的时间轴");
  const { data, error } = await supabaseAdmin.rpc("signal_event_timeline", { p_user_id: viewerId, p_event_id: eventId, p_mode: options.mode, p_cursor: options.cursor ?? null, p_limit: pageLimit(options.limit) });
  if (error) throw new Error(error.message);
  return data;
}
export type MembershipHistory = { signal_id: string; action: "include" | "exclude"; revision: number; note: string | null; created_at: string };
export async function listMembershipHistory(viewerId: string, eventId: string): Promise<MembershipHistory[]> {
  validateUuid(viewerId); validateUuid(eventId);
  const result: MembershipHistory[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabaseAdmin.from("signal_event_memberships").select("signal_id,action,revision,note,created_at").eq("user_id", viewerId).eq("event_id", eventId).order("revision", { ascending: false }).range(offset, offset + 499);
    if (error) throw new Error(error.message);
    result.push(...(data ?? []) as MembershipHistory[]);
    if (!data || data.length < 500) return result;
  }
}
type Candidate = { id: string; title: string; source: string; url: string | null; fetched_at: string; reason: string };
export async function suggestMembers(viewerId: string, eventId: string, options: { limit?: number } = {}): Promise<{ status: "ready"; items: Candidate[] } | { status: "unavailable"; items: []; message: string }> {
  validateUuid(viewerId); validateUuid(eventId);
  const event = await getEvent(viewerId, eventId);
  if (event === "missing-schema") return { status: "unavailable", items: [], message: "事件数据库尚未启用" };
  if (!event || event.archived_at) throw new Error("事件不存在或无权访问");
  const limit = Math.min(20, pageLimit(options.limit));
  const timeline = await listTimeline(viewerId, eventId, { mode: "captured", limit: 100 });
  if (!timeline.items.length) {
    const { data, error } = await supabaseAdmin.rpc("suggest_signal_event_members", { p_user_id: viewerId, p_event_id: eventId, p_limit: limit });
    if (error) throw new Error(error.message);
    return { status: "ready", items: (data ?? []).map((item: Omit<Candidate, "reason">) => ({ ...item, reason: "标题与事件名称有共同词；尚无已归入报道可作比较。" })) };
  }
  const history = await listMembershipHistory(viewerId, eventId);
  const previouslyReviewed = new Set(history.map((item) => item.signal_id));
  // Bound the expensive vector lookups while keeping the confirmed seed set private.
  const seeds = timeline.items.slice(0, 5);
  const around = await Promise.all(seeds.map((seed) => storyAround(seed.signalId, 20)));
  const candidates = new Map<string, Candidate>();
  around.forEach((result, index) => {
    for (const hit of [...(result?.after ?? []), ...(result?.before ?? [])]) {
      if (previouslyReviewed.has(hit.id) || candidates.has(hit.id)) continue;
      candidates.set(hit.id, { id: hit.id, title: hit.title ?? "无标题报道", source: hit.source, url: hit.url, fetched_at: hit.fetched_at, reason: `与已归入的「${seeds[index].title}」有共同凭据词及相似内容；仍需确认是否同一事件。` });
    }
  });
  return { status: "ready", items: [...candidates.values()].sort((a, b) => b.fetched_at.localeCompare(a.fetched_at) || b.id.localeCompare(a.id)).slice(0, limit) };
}
export async function eventLinksForSignals(viewerId: string, signalIds: string[]): Promise<Record<string, { id: string; title: string }[]>> {
  validateUuid(viewerId);
  const ids = [...new Set(signalIds.map(validateUuid))];
  const result: Record<string, { id: string; title: string }[]> = {};
  for (let offset = 0; offset < ids.length; offset += 200) {
    const { data, error } = await supabaseAdmin.rpc("signal_event_links", { p_user_id: viewerId, p_signal_ids: ids.slice(offset, offset + 200) });
    if (error) { if (isMissingEventSchema(error)) return {}; throw new Error(error.message); }
    Object.assign(result, data ?? {});
  }
  return result;
}
