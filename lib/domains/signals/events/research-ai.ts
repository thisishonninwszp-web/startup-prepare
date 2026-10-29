import { createHash } from "crypto";
import { generateEventDraft, EVENT_DRAFT_TASKS, type EventDraftTask, type EventDraftSource } from "@/lib/ai/signal-events";
import { supabaseAdmin } from "@/lib/supabase";
import { validateUuid } from "./domain";
import { getEvent } from "./queries";
import { appendResearch, loadResearch, researchSnapshots } from "./research";
export type GenerateResearchInput = { task: EventDraftTask; sourceIds: string[]; noteIds: string[]; targetEventId?: string; consent: boolean; requestId: string };
export async function generateResearch(viewerId: string, eventId: string, input: GenerateResearchInput) {
  validateUuid(viewerId); validateUuid(eventId); validateUuid(input.requestId);
  if (input.consent !== true) throw new Error("请先明确同意将所选摘录及可选笔记发送给 Google Gemini。");
  if (!EVENT_DRAFT_TASKS.includes(input.task)) throw new Error("不支持的AI任务");
  if (!Array.isArray(input.sourceIds) || input.sourceIds.length > 12 || !Array.isArray(input.noteIds) || input.noteIds.length > 10) throw new Error("最多选择12份来源、10条笔记。");
  const sourceIds = [...new Set(input.sourceIds.map(validateUuid))].sort(), noteIds = [...new Set(input.noteIds.map(validateUuid))].sort();
  if (input.task === "understanding" ? noteIds.length < 2 : !sourceIds.length) throw new Error("请选择来源；理解变化至少需要两条带时间笔记。");
  const event = await getEvent(viewerId, eventId);
  if (!event || event === "missing-schema" || event.archived_at) throw new Error("事件不可访问");
  const [state, current] = await Promise.all([loadResearch(viewerId, eventId), researchSnapshots(viewerId, eventId)]);
  if (!state.available) throw new Error("事件研究尚未启用");
  let target: Awaited<ReturnType<typeof researchSnapshots>> = [];
  if (input.task === "connections") {
    if (!input.targetEventId || validateUuid(input.targetEventId) === eventId) throw new Error("请明确选择另一个事件。");
    target = await researchSnapshots(viewerId, input.targetEventId);
    if (!sourceIds.some((id) => current.some((s) => s.id === id)) || !sourceIds.some((id) => target.some((s) => s.id === id))) throw new Error("暗线需明确选中两端事件的材料。");
  }
  const sources: EventDraftSource[] = sourceIds.map((id) => {
    const row = [...current, ...target].find((s) => s.id === id); if (!row) throw new Error("所选来源不属于允许的事件。");
    return { id: row.id, title: row.title, captured_text: row.captured_text.slice(0, 10000), published_at: row.published_at, captured_at: row.captured_at, side: current.some((s) => s.id === id) ? "current" : "target" };
  });
  const notes = noteIds.map((id) => {
    const row = state.entries.find((entry) => entry.id === id && ["note", "explanation"].includes(entry.kind));
    if (!row || typeof row.payload.text !== "string") throw new Error("所选笔记不可访问");
    return { id: row.id, text: row.payload.text.slice(0, 1000), createdAt: row.created_at };
  });
  const inputHash = createHash("sha256").update(JSON.stringify({ task: input.task, sources, notes, targetEventId: input.task === "connections" ? input.targetEventId : null, memberRevision: event.revision, promptVersion: "event-research-v1" })).digest("hex");
  const cached = state.entries.find((entry) => entry.kind === "dossier" && entry.payload.inputHash === inputHash); if (cached) return cached;
  const claim = await supabaseAdmin.rpc("claim_signal_event_ai_job", { p_user_id: viewerId, p_event_id: eventId, p_input_hash: inputHash });
  if (claim.error) throw new Error(claim.error.message); if (claim.data !== true) throw new Error("相同材料正在生成，请稍后查看。");
  async function finish(status: "done" | "failed") {
    const { error } = await supabaseAdmin.from("signal_event_ai_jobs").update({ status }).eq("user_id", viewerId).eq("event_id", eventId).eq("input_hash", inputHash);
    if (error) throw new Error(error.message);
  }
  try {
    const draft = await generateEventDraft(viewerId, input.task, sources, notes);
    for (const section of draft.sections) if (section.proposal?.kind === "connection") {
      if (input.task !== "connections") throw new Error("暗线提案需要明确选定目标事件");
      if (!section.refs.some((ref) => current.some((s) => s.id === ref.snapshotId)) || !section.refs.some((ref) => target.some((s) => s.id === ref.snapshotId))) throw new Error("暗线提案缺少两端原文依据");
      section.proposal.payload.targetEventId = input.targetEventId;
    }
    const entry = await appendResearch(viewerId, eventId, { kind: "dossier", requestId: input.requestId, payload: { ...draft, task: input.task, inputHash, memberRevision: event.revision, promptVersion: "event-research-v1", selectedSnapshotIds: sourceIds, selectedNoteIds: noteIds, ...(input.task === "connections" ? { targetEventId: input.targetEventId } : {}) } });
    await finish("done"); return entry;
  } catch (error) { try { await finish("failed"); } catch { throw new Error("生成未完成且任务状态未能更新，请稍后重试；先前草稿保留。"); } throw error; }
}
