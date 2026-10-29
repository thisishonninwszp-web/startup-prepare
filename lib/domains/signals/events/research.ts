import { supabaseAdmin } from "@/lib/supabase";
import { selectAll } from "@/lib/supabase-all";
import { getEvent } from "./queries";
import { validateUuid } from "./domain";
import { normalizeResearch, sourceRefs, sourceRoots, noteRefs, validateResearchRefs, type ResearchEntry, type ResearchKind, type ResearchSnapshot } from "./research-shared";

async function ownEvent(viewerId: string, eventId: string) {
  const event = await getEvent(viewerId, eventId);
  if (!event || event === "missing-schema") throw new Error("事件档案不可访问，请确认已完成数据库更新。");
  return event;
}
export async function loadResearch(viewerId: string, eventId: string): Promise<{ available: boolean; entries: ResearchEntry[] }> {
  await ownEvent(viewerId, eventId);
  const { data, error } = await selectAll<ResearchEntry>((from, to) => supabaseAdmin.from("signal_event_research_entries").select("*").eq("user_id", viewerId).eq("event_id", eventId).order("created_at").order("id").range(from, to));
  if (error) { if (/signal_event_research_entries/.test(error.message) && /does not exist|schema cache|Could not find/.test(error.message)) return { available: false, entries: [] }; throw new Error(error.message); }
  return { available: true, entries: data };
}
export async function researchSnapshots(viewerId: string, eventId: string): Promise<ResearchSnapshot[]> {
  await ownEvent(viewerId, eventId);
  const members = await selectAll<{ snapshot_id: string | null }>((from, to) => supabaseAdmin.from("signal_event_memberships").select("snapshot_id").eq("user_id", viewerId).eq("event_id", eventId).eq("action", "include").order("revision").range(from, to));
  if (members.error) throw new Error(members.error.message);
  const ids = [...new Set(members.data.flatMap((row) => row.snapshot_id ? [row.snapshot_id] : []))];
  const result: ResearchSnapshot[] = [];
  for (let at = 0; at < ids.length; at += 100) {
    const { data, error } = await supabaseAdmin.from("signal_source_snapshots").select("id,signal_id,title,source_url,captured_text,published_at,captured_at").eq("user_id", viewerId).in("id", ids.slice(at, at + 100));
    if (error) throw new Error(error.message); result.push(...(data ?? []) as ResearchSnapshot[]);
  }
  return result;
}
export async function appendResearch(viewerId: string, eventId: string, input: { kind: ResearchKind; subjectId?: string | null; payload: Record<string, unknown>; requestId: string }): Promise<ResearchEntry> {
  await ownEvent(viewerId, eventId); validateUuid(input.requestId); if (input.subjectId) validateUuid(input.subjectId);
  const payload = normalizeResearch(input.kind, input.payload);
  const [state, snapshots] = await Promise.all([loadResearch(viewerId, eventId), researchSnapshots(viewerId, eventId)]);
  if (!state.available) throw new Error("事件研究尚未启用，请完成数据库更新。");
  const expected: Partial<Record<ResearchKind, ResearchKind>> = { unknown_answer: "unknown", explanation_evidence: "explanation", expectation_resolution: "expectation", window_check: "window" };
  const subject = input.subjectId ? state.entries.find((row) => row.id === input.subjectId) : undefined;
  if (input.subjectId && !subject) throw new Error("要补充的原记录不属于这个事件。");
  if (input.subjectId && ["note", "explanation", "source_link"].includes(input.kind) && subject?.kind !== input.kind) throw new Error("修正必须对应同一种原记录。");
  if (expected[input.kind] && subject?.kind !== expected[input.kind]) throw new Error("补充记录的对象类型不正确。");
  if (input.kind === "expectation_resolution" && payload.result === "not_happened" && Date.now() < Date.parse(`${subject!.payload.dueAt}T23:59:59+09:00`)) throw new Error("期限尚未结束，不能确认未发生。");
  if (input.kind === "source_link") {
    for (const id of [payload.fromSnapshotId, payload.toSnapshotId]) if (!snapshots.some((row) => row.id === id)) throw new Error("来源关系两端必须属于此档案。");
    const active = state.entries.filter((row) => row.kind === "source_link");
    const byPair = new Map<string, { from: string; to: string }>();
    for (const row of [...active, { payload }]) {
      const p = row.payload; const key = `${p.fromSnapshotId}:${p.toSnapshotId}`;
      if (p.active === false) byPair.delete(key); else byPair.set(key, { from: p.fromSnapshotId as string, to: p.toSnapshotId as string });
    }
    sourceRoots(snapshots.map((row) => row.id), [...byPair.values()]);
  }
  const allowed = [...snapshots];
  if (input.kind === "connection" || ((input.kind === "dossier" || input.kind === "understanding") && payload.targetEventId)) {
    if (payload.targetEventId === eventId) throw new Error("请选择另一个事件。");
    const target = await researchSnapshots(viewerId, payload.targetEventId as string); allowed.push(...target);
    const refs = sourceRefs(payload.refs);
    if (input.kind === "connection" && (!refs.some((ref) => snapshots.some((row) => row.id === ref.snapshotId)) || !refs.some((ref) => target.some((row) => row.id === ref.snapshotId)))) throw new Error("暗线必须引用两端事件的材料。");
  }
  validateResearchRefs(sourceRefs(payload.refs), allowed);
  for (const ref of noteRefs(payload.noteRefs)) {
    const record = state.entries.find((row) => row.id === ref.recordId && ["note", "explanation"].includes(row.kind));
    if (!record || typeof record.payload.text !== "string" || !record.payload.text.includes(ref.quote)) throw new Error("引用的私人记录不可访问，或笔记摘录与原文不一致。");
  }
  if (input.kind === "dossier" || input.kind === "understanding") {
    const selectedSnapshots = payload.selectedSnapshotIds as string[]; const selectedNotes = payload.selectedNoteIds as string[];
    if (sourceRefs(payload.refs).some((ref) => !selectedSnapshots.includes(ref.snapshotId))) throw new Error("草稿引用了未选中的来源。");
    for (const ref of noteRefs(payload.noteRefs)) {
      const record = state.entries.find((row) => row.id === ref.recordId && ["note", "explanation"].includes(row.kind));
      if (!selectedNotes.includes(ref.recordId) || !record || !String(record.payload.text ?? "").includes(ref.quote)) throw new Error("草稿引用了未选中的私人记录，或摘录不一致。");
    }
  }
  const { data, error } = await supabaseAdmin.rpc("append_signal_event_research", { p_user_id: viewerId, p_event_id: eventId, p_kind: input.kind, p_subject_id: input.subjectId ?? null, p_payload: payload, p_request_id: input.requestId });
  if (error) throw new Error(error.message); if (!data?.id) throw new Error("事件研究未保存，请重试。");
  return data as ResearchEntry;
}
