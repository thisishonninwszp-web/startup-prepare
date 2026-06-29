import { createHash } from "crypto";
import type { RealityReasoningSnapshot } from "../reasoning/reality-source";
import {
  assertClosureDueDate,
  pathTypeToClosureMode,
  type RealityClosureDraft,
} from "./closure";

export type ClosureBayesianSource = {
  id: string;
  question: string;
  prior: number;
  current_posterior: number;
  updates: Array<{
    evidence_text: string;
    evidence_type: string;
    posterior: number;
    ai_explanation: string;
    recorded_at: string;
  }>;
};

export type ClosureFermiSource = {
  id: string;
  question: string;
  final_low: number | null;
  final_high: number | null;
  unit: string;
  components: Array<{
    label: string;
    low: number;
    high: number;
    rationale: string;
    user_note: string;
  }>;
};

export type ClosureReframingSource = {
  id: string;
  topic_text: string;
  context_note: string;
  frames: Array<{
    frame_type: string;
    title: string;
    description: string;
    is_marked: boolean;
  }>;
};

export type RealityClosureSourceSnapshot = {
  reality: RealityReasoningSnapshot;
  reasoning: {
    bayesian: ClosureBayesianSource[];
    fermi: ClosureFermiSource[];
    reframing: ClosureReframingSource[];
  };
};

type ClosureSourceRows = {
  reality: RealityReasoningSnapshot;
  links: Array<{
    bayesian_belief_id: string | null;
    fermi_estimate_id: string | null;
    reframing_session_id: string | null;
  }>;
  beliefs: Array<{ id: string; question: string; prior: number }>;
  bayesianUpdates: Array<{
    belief_id: string;
    evidence_text: string;
    evidence_type: string;
    posterior: number;
    ai_explanation: string;
    recorded_at: string;
  }>;
  estimates: Array<{
    id: string;
    question: string;
    final_low: number | null;
    final_high: number | null;
    unit: string;
  }>;
  fermiComponents: Array<{
    estimate_id: string;
    ordinal: number;
    label: string;
    low: number;
    high: number;
    rationale: string;
    user_note: string;
  }>;
  sessions: Array<{
    id: string;
    topic_text: string;
    context_note: string | null;
  }>;
  reframingFrames: Array<{
    session_id: string;
    frame_type: string;
    title: string;
    description: string;
    is_marked: boolean;
  }>;
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(row[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function fingerprintClosureSource(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function allowedClosureBasisRefs(
  source: RealityClosureSourceSnapshot
): string[] {
  const map = source.reality.map;
  const realityRefs = ["reality:topic"];
  if (map.emotions.length > 0) realityRefs.push("reality:emotions");
  if (map.facts.length > 0) realityRefs.push("reality:facts");
  if (map.interpretations.length > 0) {
    realityRefs.push("reality:interpretations");
  }
  if (map.unknowns.length > 0) realityRefs.push("reality:unknowns");
  if (
    map.constraints.fixed.length > 0 ||
    map.constraints.influenceable.length > 0 ||
    map.constraints.actionable_now.length > 0
  ) {
    realityRefs.push("reality:constraints");
  }
  if (map.contradictions.length > 0) {
    realityRefs.push("reality:contradictions");
  }
  if (source.reality.selected_path) {
    realityRefs.push("reality:selected_path");
  }
  return [
    ...realityRefs,
    ...source.reasoning.bayesian.map((item) => `bayesian:${item.id}`),
    ...source.reasoning.fermi.map((item) => `fermi:${item.id}`),
    ...source.reasoning.reframing.map((item) => `reframing:${item.id}`),
  ];
}

export function validateClosureBasisRefs(
  draft: RealityClosureDraft,
  source: RealityClosureSourceSnapshot
): void {
  const allowed = new Set(allowedClosureBasisRefs(source));
  for (const ref of draft.basis_refs) {
    if (!allowed.has(ref)) {
      throw new Error(`收束草稿包含无法验证的引用：${ref}`);
    }
  }
}

export function validateClosureAgainstSource(
  draft: RealityClosureDraft,
  source: RealityClosureSourceSnapshot,
  today: string
): void {
  validateClosureBasisRefs(draft, source);
  assertClosureDueDate(draft.due_on, today);
  const selectedPath = source.reality.selected_path;
  if (
    selectedPath &&
    pathTypeToClosureMode(selectedPath.type) !== draft.mode &&
    !draft.direction_change_reason
  ) {
    throw new Error("改变初步方向时必须记录原因");
  }
}

export function assembleClosureSource(
  rows: ClosureSourceRows
): RealityClosureSourceSnapshot {
  const bayesianIds = new Set(
    rows.links
      .map((item) => item.bayesian_belief_id)
      .filter((id): id is string => Boolean(id))
  );
  const fermiIds = new Set(
    rows.links
      .map((item) => item.fermi_estimate_id)
      .filter((id): id is string => Boolean(id))
  );
  const reframingIds = new Set(
    rows.links
      .map((item) => item.reframing_session_id)
      .filter((id): id is string => Boolean(id))
  );

  const bayesian = rows.beliefs
    .filter((item) => bayesianIds.has(item.id))
    .map((belief) => {
      const updates = rows.bayesianUpdates
        .filter((item) => item.belief_id === belief.id)
        .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
        .map((item) => ({
          evidence_text: item.evidence_text,
          evidence_type: item.evidence_type,
          posterior: item.posterior,
          ai_explanation: item.ai_explanation,
          recorded_at: item.recorded_at,
        }));
      return {
        id: belief.id,
        question: belief.question,
        prior: belief.prior,
        current_posterior:
          updates.length > 0
            ? updates[updates.length - 1].posterior
            : belief.prior,
        updates,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const fermi = rows.estimates
    .filter((item) => fermiIds.has(item.id))
    .map((estimate) => ({
      id: estimate.id,
      question: estimate.question,
      final_low: estimate.final_low,
      final_high: estimate.final_high,
      unit: estimate.unit,
      components: rows.fermiComponents
        .filter((item) => item.estimate_id === estimate.id)
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((item) => ({
          label: item.label,
          low: item.low,
          high: item.high,
          rationale: item.rationale,
          user_note: item.user_note,
        })),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const reframing = rows.sessions
    .filter((item) => reframingIds.has(item.id))
    .map((session) => ({
      id: session.id,
      topic_text: session.topic_text,
      context_note: session.context_note ?? "",
      frames: rows.reframingFrames
        .filter((item) => item.session_id === session.id)
        .map((item) => ({
          frame_type: item.frame_type,
          title: item.title,
          description: item.description,
          is_marked: item.is_marked,
        })),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    reality: rows.reality,
    reasoning: { bayesian, fermi, reframing },
  };
}
