import { supabaseAdmin } from "@/lib/supabase";
import { validateOccurrence, validateText, validateUuid, type Occurrence } from "./domain";
import { captureSnapshot } from "./snapshots";

export async function createEvent(viewerId: string, input: { title: string; scopeNote: string; requestId: string }): Promise<{ id: string }> {
  validateUuid(viewerId); validateUuid(input.requestId);
  const title = validateText(input.title, 120, true);
  const scope = validateText(input.scopeNote, 1000);
  const { data, error } = await supabaseAdmin.rpc("create_signal_event", { p_user_id: viewerId, p_title: title, p_scope_note: scope || null, p_request_id: input.requestId });
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("创建事件失败");
  return { id: data.id as string };
}
type MemberInput = { eventId: string; signalId: string; requestId: string; note: string };
async function revise(viewerId: string, input: MemberInput & { snapshotId?: string }, action: "include" | "exclude", occurred: Occurrence | null) {
  for (const id of [viewerId, input.eventId, input.signalId, input.requestId]) validateUuid(id);
  if (input.snapshotId) validateUuid(input.snapshotId);
  const note = validateText(input.note, 1000) || null;
  const occurrence = validateOccurrence(occurred);
  const event = await supabaseAdmin.from("signal_events").select("id").eq("user_id", viewerId).eq("id", input.eventId).is("archived_at", null).maybeSingle();
  if (event.error) throw new Error(event.error.message);
  if (!event.data) throw new Error("事件不存在或无权访问");
  const retry = await supabaseAdmin.from("signal_event_memberships").select("event_id,snapshot_id,signal_id,action,note,revision,occurred_from,occurred_to,occurred_precision,occurred_quote").eq("user_id", viewerId).eq("client_request_id", input.requestId).maybeSingle();
  if (retry.error) throw new Error(retry.error.message);
  if (retry.data) {
    const old = retry.data;
    if (old.event_id !== input.eventId || (input.snapshotId !== undefined && old.snapshot_id !== input.snapshotId) || old.action !== action || old.signal_id !== input.signalId || old.note !== note || old.occurred_from !== (occurrence?.from ?? null) || old.occurred_to !== (occurrence?.to ?? null) || old.occurred_precision !== (occurrence?.precision ?? null) || old.occurred_quote !== (occurrence?.quote ?? null)) throw new Error("请求标识已被不同内容使用");
    return { revision: old.revision as number };
  }
  let snapshot: { id: string; captured_text: string } | null = null;
  if (action === "include" && input.snapshotId) {
    validateUuid(input.snapshotId);
    const saved = await supabaseAdmin.from("signal_source_snapshots").select("id,captured_text").eq("user_id", viewerId).eq("signal_id", input.signalId).eq("id", input.snapshotId).maybeSingle();
    if (saved.error) throw new Error(saved.error.message);
    if (!saved.data) throw new Error("原快照不可访问，请刷新后重试。");
    snapshot = saved.data;
  } else if (action === "include") snapshot = await captureSnapshot(viewerId, input.signalId);
  if (snapshot) validateOccurrence(occurrence, snapshot.captured_text);
  const { data, error } = await supabaseAdmin.rpc("revise_signal_event_member", {
    p_user_id: viewerId, p_event_id: input.eventId, p_signal_id: input.signalId, p_snapshot_id: snapshot?.id ?? null,
    p_action: action, p_request_id: input.requestId, p_note: note, p_occurred_from: occurrence?.from ?? null,
    p_occurred_to: occurrence?.to ?? null, p_occurred_precision: occurrence?.precision ?? null, p_occurred_quote: occurrence?.quote ?? null,
  });
  if (error) throw new Error(error.message);
  if (typeof data?.revision !== "number") throw new Error("修改事件失败");
  return { revision: data.revision as number };
}
export function includeSignal(viewerId: string, input: MemberInput & { occurred: Occurrence | null; snapshotId?: string }) { return revise(viewerId, input, "include", input.occurred); }
export function excludeSignal(viewerId: string, input: MemberInput) { return revise(viewerId, input, "exclude", null); }

export async function updateEvent(viewerId: string, input: { eventId: string; title: string; scopeNote: string }): Promise<void> {
  validateUuid(viewerId); validateUuid(input.eventId);
  const { data, error } = await supabaseAdmin.from("signal_events").update({ title: validateText(input.title, 120, true), scope_note: validateText(input.scopeNote, 1000) || null }).eq("user_id", viewerId).eq("id", input.eventId).is("archived_at", null).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("事件不存在或无权修改。");
}
