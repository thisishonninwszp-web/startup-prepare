import { validateSourceUrl, validateText, validateUuid } from "./domain";

export const RESEARCH_KINDS = ["note", "unknown", "unknown_answer", "explanation", "explanation_evidence", "expectation", "expectation_resolution", "perspective", "source_link", "dossier", "connection", "window", "window_check", "understanding"] as const;
export type ResearchKind = typeof RESEARCH_KINDS[number];
export type SourceRef = { snapshotId: string; quote: string };
export type NoteRef = { recordId: string; quote: string };
export type ResearchEntry = { id: string; user_id?: string; event_id: string; kind: ResearchKind; subject_id: string | null; payload: Record<string, unknown>; client_request_id?: string; created_at: string };
export type ResearchSnapshot = { id: string; signal_id: string; title: string; source_url: string | null; captured_text: string; published_at: string | null; captured_at: string };

function str(p: Record<string, unknown>, key: string, required = true, max = 2000): string {
  if (p[key] == null && !required) return "";
  return validateText(p[key] as string, max, required);
}
function choice(p: Record<string, unknown>, key: string, values: readonly string[]) {
  const value = str(p, key); if (!values.includes(value)) throw new Error(`不支持的${key}`); return value;
}
export function sourceRefs(raw: unknown): SourceRef[] {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > 24) throw new Error("引用数量不正确");
  return raw.map((item) => {
    if (!item || typeof item !== "object") throw new Error("引用格式不正确");
    return { snapshotId: validateUuid(item.snapshotId), quote: validateText(item.quote, 2000, true) };
  });
}
export function validateResearchRefs(refs: SourceRef[], snapshots: { id: string; captured_text: string }[]) {
  const allowed = new Map(snapshots.map((row) => [row.id, row.captured_text]));
  for (const ref of refs) if (!allowed.get(ref.snapshotId)?.includes(ref.quote)) throw new Error("引用不属于允许的来源快照，或摘录与原文不一致。");
}
export function noteRefs(raw: unknown): NoteRef[] {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > 24) throw new Error("笔记引用数量不正确");
  return raw.map((item) => ({ recordId: validateUuid(item?.recordId), quote: validateText(item?.quote, 1000, true) }));
}

export function normalizeResearch(kind: ResearchKind, raw: Record<string, unknown>): Record<string, unknown> {
  if (!RESEARCH_KINDS.includes(kind) || !raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("不支持的事件记录");
  if (Object.keys(raw).some((key) => /score|rating|confidence|percentage/i.test(key))) throw new Error("不记录评分。");
  const refs = sourceRefs(raw.refs);
  const notes = noteRefs(raw.noteRefs);
  const p: Record<string, unknown> = { refs, ...(notes.length ? { noteRefs: notes } : {}) };
  if (kind === "note") p.text = str(raw, "text", true, 4000);
  if (kind === "unknown") { p.question = str(raw, "question", true, 500); p.criterion = str(raw, "criterion", true, 1000); }
  if (kind === "unknown_answer") {
    p.text = str(raw, "text"); p.status = choice(raw, "status", ["open", "answered", "closed"]);
    if (p.status === "answered" && !refs.length) throw new Error("补齐未知必须附来源依据。");
  }
  if (kind === "explanation") { p.text = str(raw, "text"); p.assumptions = str(raw, "assumptions"); p.distinguish = str(raw, "distinguish"); }
  if (kind === "explanation_evidence") { p.text = str(raw, "text"); p.direction = choice(raw, "direction", ["supports", "contradicts", "context"]); if (!refs.length) throw new Error("关联解释必须附原文。"); }
  if (kind === "expectation") {
    p.text = str(raw, "text"); p.criterion = str(raw, "criterion"); const due = str(raw, "dueAt", true, 40);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !Number.isFinite(Date.parse(due)) || new Date(due).toISOString().slice(0, 10) !== due) throw new Error("截止日期无效");
    p.dueAt = due;
  }
  if (kind === "expectation_resolution") { p.result = choice(raw, "result", ["happened", "not_happened", "unknown"]); p.text = str(raw, "text"); if (p.result !== "unknown" && !refs.length) throw new Error("发生/未发生必须有依据；没有材料请保留未知。"); }
  if (kind === "perspective") { p.role = choice(raw, "role", ["customer", "employee", "operator", "supplier"]); p.text = str(raw, "text"); p.questions = str(raw, "questions"); if (!refs.length) throw new Error("换位分析必须引用材料，不冒充当事人的观点。"); }
  if (kind === "source_link") {
    p.fromSnapshotId = validateUuid(str(raw, "fromSnapshotId")); p.toSnapshotId = validateUuid(str(raw, "toSnapshotId"));
    p.relation = choice(raw, "relation", ["cites", "reprints"]); p.active = raw.active !== false && raw.active !== "false";
    if (p.fromSnapshotId === p.toSnapshotId || !refs.some((ref) => ref.snapshotId === p.fromSnapshotId)) throw new Error("来源关系需引用转述方的明确引用或转载声明。");
  }
  if (kind === "connection") {
    p.targetEventId = validateUuid(str(raw, "targetEventId")); p.text = str(raw, "text"); p.assumption = str(raw, "assumption"); p.counter = str(raw, "counter"); p.alternative = str(raw, "alternative"); if (refs.length < 2) throw new Error("暗线需要两端事件的材料，不能只凭主题相似。");
  }
  if (kind === "window") {
    p.url = validateSourceUrl(str(raw, "url", true, 2000)); p.field = str(raw, "field", false, 300); p.cadence = choice(raw, "cadence", ["manual", "weekly", "monthly"]);
  }
  if (kind === "window_check") {
    p.status = choice(raw, "status", ["success", "failed"]); p.url = validateSourceUrl(str(raw, "url", true, 2000));
    p.checkedAt = str(raw, "checkedAt", true, 50); p.sourceTimezone = "unknown"; p.captureScope = p.status === "success" ? "extracted_text" : "none"; if (!Number.isFinite(Date.parse(p.checkedAt as string))) throw new Error("检查时间无效");
    if (p.status === "success") { p.value = str(raw, "value", false, 4000); p.excerpt = str(raw, "excerpt", true, 8000); p.hash = str(raw, "hash", true, 64); if (!/^[a-f0-9]{64}$/.test(p.hash as string)) throw new Error("检查指纹无效"); }
    else p.error = str(raw, "error", true, 1000);
  }
  if (kind === "dossier" || kind === "understanding") {
    p.task = choice(raw, "task", ["dossier", "unknowns", "explanations", "perspectives", "connections", "understanding"]); p.inputHash = str(raw, "inputHash", true, 64); p.memberRevision = raw.memberRevision; p.promptVersion = "event-research-v1";
    if (!/^[a-f0-9]{64}$/.test(p.inputHash as string) || !Number.isSafeInteger(raw.memberRevision) || Number(raw.memberRevision) < 0) throw new Error("AI草稿缺少有效的材料版本。");
    p.selectedSnapshotIds = Array.isArray(raw.selectedSnapshotIds) ? [...new Set(raw.selectedSnapshotIds.map((value) => validateUuid(value)))].slice(0, 12) : [];
    p.selectedNoteIds = Array.isArray(raw.selectedNoteIds) ? [...new Set(raw.selectedNoteIds.map((value) => validateUuid(value)))].slice(0, 10) : [];
    if (raw.targetEventId) p.targetEventId = validateUuid(raw.targetEventId as string);
    if (!Array.isArray(raw.sections) || !raw.sections.length || raw.sections.length > 12) throw new Error("AI草稿缺少可核对的内容。");
    p.sections = raw.sections.map((value) => {
      if (!value || typeof value !== "object") throw new Error("AI草稿格式错误");
      const s = value as Record<string, unknown>;
      const proposal = s.proposal && typeof s.proposal === "object" ? s.proposal as { kind: ResearchKind; payload: Record<string, unknown> } : null;
      if (proposal && !["unknown", "explanation", "perspective", "connection"].includes(proposal.kind)) throw new Error("不支持的AI建议类型。");
      return { heading: str(s, "heading", true, 120), text: str(s, "text", true, 2000), refs: sourceRefs(s.refs), noteRefs: noteRefs(s.noteRefs), ...(proposal ? { proposal: { kind: proposal.kind, payload: normalizeResearch(proposal.kind, proposal.payload) } } : {}) };
    });
    const sections = p.sections as { refs: SourceRef[]; noteRefs: NoteRef[]; proposal?: { payload: { refs: SourceRef[]; noteRefs?: NoteRef[] } } }[];
    p.refs = [...new Map([...refs, ...sections.flatMap((section) => [...section.refs, ...(section.proposal?.payload.refs ?? [])])].map((ref) => [`${ref.snapshotId}:${ref.quote}`, ref])).values()];
    p.noteRefs = [...new Map([...notes, ...sections.flatMap((section) => [...section.noteRefs, ...(section.proposal?.payload.noteRefs ?? [])])].map((ref) => [`${ref.recordId}:${ref.quote}`, ref])).values()];
  }
  return p;
}

export function sourceRoots(ids: string[], links: { from: string; to: string }[]): string[] {
  const edges = new Map<string, string[]>(); for (const link of links) edges.set(link.from, [...(edges.get(link.from) ?? []), link.to]);
  const visiting = new Set<string>(); const done = new Set<string>();
  function visit(id: string) { if (visiting.has(id)) throw new Error("来源关系形成循环，请先纠正。"); if (done.has(id)) return; visiting.add(id); for (const parent of edges.get(id) ?? []) visit(parent); visiting.delete(id); done.add(id); }
  for (const id of ids) visit(id);
  return [...new Set(ids)].filter((id) => !edges.has(id));
}
export function expectationState(dueAt: string, resolutions: ResearchEntry[], now: number): "waiting" | "unknown" | "happened" | "not_happened" {
  const latest = resolutions.filter((row) => row.kind === "expectation_resolution").at(-1);
  if (latest) return latest.payload.result as "unknown" | "happened" | "not_happened";
  return now < Date.parse(`${dueAt}T23:59:59+09:00`) ? "waiting" : "unknown";
}
