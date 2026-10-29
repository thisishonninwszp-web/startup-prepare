import { validateUuid } from "@/lib/domains/signals/events/domain";
export const REASONING_KINDS = ["claim", "increment", "denominator", "comparability", "disagreement", "mechanism", "applicability", "review", "correction", "ack"] as const;
export type ReasoningKind = typeof REASONING_KINDS[number];
export type SourceRef = { snapshotId: string; quote: string };
export type ReasoningPayload = Record<string, unknown> & { text: string; refs: SourceRef[]; claimIds: string[] };
export type PayloadByKind = {
  claim: ReasoningPayload;
  increment: ReasoningPayload & { baseline: SourceRef; addition: SourceRef; increment: string; independence: "independent" | "shared" | "unknown"; independenceBasis: string };
  denominator: ReasoningPayload & { sample: string; population: string; denominator: string; omittedGroups: string };
  comparability: ReasoningPayload & { dimensions: ComparisonDimensions; verdict: "comparable" | "not_comparable"; reason: string };
  disagreement: ReasoningPayload & { left: SourceRef; right: SourceRef; cause: "fact" | "definition" | "time" | "mechanism" | "value"; checkQuestion: string };
  mechanism: ReasoningPayload & { links: { text: string; refs: SourceRef[]; counterexample: string; unknown: string }[] };
  applicability: ReasoningPayload & { conditions: string; invalidators: string; followUp: string };
  review: ReasoningPayload;
  correction: ReasoningPayload & { oldSnapshotId: string; newSnapshotId: string };
  ack: ReasoningPayload & { impactId: string };
};
export type ReasoningEntry = { [K in ReasoningKind]: { id: string; event_id: string; revision: number; kind: K; payload: PayloadByKind[K]; created_at: string } }[ReasoningKind];
export type CorrectionImpact = { id: string; event_id: string; revision: number; correction_id: string; subject_kind: "reasoning" | "research"; subject_id: string; old_conclusion: Record<string, unknown>; created_at: string; acknowledged: boolean; correction?: ReasoningEntry };
export type ReasoningInput = { requestId: string; expectedRevision: number; kind: ReasoningKind; payload: Record<string, unknown> };
export const COMPARISON_DIMENSIONS = ["definition", "unit", "period", "geography", "priceBasis", "quantityBasis"] as const;
export type ComparisonDimensions = Record<typeof COMPARISON_DIMENSIONS[number], { left: string; right: string }>;
const fields: Record<ReasoningKind, string[]> = {
  claim: [], increment: ["baseline", "addition", "increment", "independence", "independenceBasis"], denominator: ["sample", "population", "denominator", "omittedGroups"], comparability: ["dimensions", "verdict", "reason"], disagreement: ["left", "right", "cause", "checkQuestion"], mechanism: ["links"], applicability: ["conditions", "invalidators", "followUp"], review: [], correction: ["oldSnapshotId", "newSnapshotId"], ack: ["impactId"],
};
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("记录格式无效"); return value as Record<string, unknown>; }
function text(value: unknown, required = true, max = 4000): string { if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new Error("请填写具体内容；未知请明确写未知。"); return value.trim(); }
function choice(value: unknown, allowed: string[]) { if (typeof value !== "string" || !allowed.includes(value)) throw new Error("记录选项无效"); return value; }
function ref(value: unknown): SourceRef { const p = object(value); if (Object.keys(p).some(k => !["snapshotId", "quote"].includes(k))) throw new Error("引用格式无效"); return { snapshotId: validateUuid(p.snapshotId as string), quote: text(p.quote, true, 2000) }; }
function refs(value: unknown): SourceRef[] { if (!Array.isArray(value) || value.length > 24) throw new Error("引用数量无效"); return value.map(ref); }
function included(value: SourceRef, list: SourceRef[]) { if (!list.some(r => r.snapshotId === value.snapshotId && r.quote === value.quote)) throw new Error("逐字引用必须包含在本条来源中"); return value; }
export function comparisonUnknowns(value: unknown): string[] {
  const p = object(value);
  return COMPARISON_DIMENSIONS.filter(k => { const pair = p[k] as { left?: unknown; right?: unknown } | undefined; return !pair || [pair.left, pair.right].some(s => typeof s !== "string" || !s.trim() || /未知|不明|unknown|unsure/i.test(s)); });
}
export function normalizeReasoning(kind: ReasoningKind, raw: Record<string, unknown>): ReasoningPayload {
  if (!REASONING_KINDS.includes(kind)) throw new Error("不支持的推理记录"); object(raw);
  if (Object.keys(raw).some(k => !["text", "refs", "claimIds", ...fields[kind]].includes(k))) throw new Error("不支持的字段，不记录评分。");
  if (!Array.isArray(raw.claimIds) || raw.claimIds.length > 24) throw new Error("依赖记录无效");
  const p: ReasoningPayload = { text: text(raw.text), refs: refs(raw.refs), claimIds: [...new Set(raw.claimIds.map(id => validateUuid(id as string)))] };
  if (["claim", "increment", "denominator", "comparability", "disagreement", "applicability"].includes(kind) && !p.refs.length && !p.claimIds.length) throw new Error("请选取来源或显式依赖的推理记录");
  if (kind === "increment") { p.baseline = included(ref(raw.baseline), p.refs); p.addition = included(ref(raw.addition), p.refs); if ((p.baseline as SourceRef).snapshotId === (p.addition as SourceRef).snapshotId) throw new Error("基准与新材料应为两个快照"); p.increment = text(raw.increment); p.independence = choice(raw.independence, ["independent", "shared", "unknown"]); p.independenceBasis = text(raw.independenceBasis); }
  if (kind === "denominator") for (const k of fields.denominator) p[k] = text(raw[k]);
  if (kind === "comparability") {
    const source = object(raw.dimensions); if (Object.keys(source).some(k => !COMPARISON_DIMENSIONS.includes(k as typeof COMPARISON_DIMENSIONS[number]))) throw new Error("比较口径无效");
    p.dimensions = Object.fromEntries(COMPARISON_DIMENSIONS.map(k => { const pair = object(source[k]); if (Object.keys(pair).some(key => !["left", "right"].includes(key))) throw new Error("比较口径无效"); return [k, { left: text(pair.left), right: text(pair.right) }]; }));
    p.verdict = choice(raw.verdict, ["comparable", "not_comparable"]); p.reason = text(raw.reason); const dimensions = p.dimensions as ComparisonDimensions;
    if (p.verdict === "comparable" && (comparisonUnknowns(dimensions).length || COMPARISON_DIMENSIONS.some(k => dimensions[k].left !== dimensions[k].right))) throw new Error("关键口径未知或不同时必须保留不可比原因");
  }
  if (kind === "disagreement") { p.left = included(ref(raw.left), p.refs); p.right = included(ref(raw.right), p.refs); p.cause = choice(raw.cause, ["fact", "definition", "time", "mechanism", "value"]); p.checkQuestion = text(raw.checkQuestion); }
  if (kind === "mechanism") {
    if (!Array.isArray(raw.links) || !raw.links.length || raw.links.length > 12) throw new Error("传导链需要一至十二环");
    p.links = raw.links.map(value => { const link = object(value); if (Object.keys(link).some(k => !["text", "refs", "counterexample", "unknown"].includes(k))) throw new Error("传导环节无效"); const r = refs(link.refs).map(v => included(v, p.refs)); const counterexample = text(link.counterexample, false); const unknown = text(link.unknown, false); if (!r.length && !counterexample && !unknown) throw new Error("每环需要引用、反例或明确未知"); return { text: text(link.text), refs: r, counterexample, unknown }; });
  }
  if (kind === "applicability") for (const k of fields.applicability) p[k] = text(raw[k]);
  if (kind === "review" && !p.claimIds.length) throw new Error("复查需要选取原推理记录");
  if (kind === "correction") { p.oldSnapshotId = validateUuid(raw.oldSnapshotId as string); p.newSnapshotId = validateUuid(raw.newSnapshotId as string); if (p.oldSnapshotId === p.newSnapshotId || ![p.oldSnapshotId, p.newSnapshotId].every(id => p.refs.some(r => r.snapshotId === id)) || p.claimIds.length) throw new Error("更正需要旧、新快照的具体原话"); }
  if (kind === "ack") { p.impactId = validateUuid(raw.impactId as string); if (p.refs.length || p.claimIds.length) throw new Error("回执只确认已查看影响"); }
  return p;
}
export function validateRevision(value: number): number { if (!Number.isSafeInteger(value) || value < 0) throw new Error("版本必须为非负整数"); return value; }
