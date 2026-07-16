import { supabaseAdmin } from "@/lib/supabase";
import { loadOwnedRealityReasoningSnapshot } from "@/app/(app)/reasoning/reality-source";
import {
  assembleClosureSource,
  type RealityClosureSourceSnapshot,
} from "./closure-source";
import {
  parseRealityClosureDraft,
  REALITY_CLOSURE_STATUSES,
  type RealityClosure,
  type RealityClosureEvent,
  type RealityClosureStatus,
} from "./closure";
import { listFocusExportsForClosure } from "./focus-queries";

function missingClosureSchema(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST205" &&
    Boolean(
      error.message?.includes("reality_closures") ||
        error.message?.includes("reality_closure_events")
    )
  );
}

export async function getRealityClosureSchemaStatus(): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("reality_closures")
    .select("id")
    .limit(1);
  if (!error) return true;
  if (missingClosureSchema(error)) return false;
  throw new Error(error.message);
}

export async function loadClosureSourceSnapshot(
  caseId: string,
  versionId: string,
  userId: string
): Promise<RealityClosureSourceSnapshot | null> {
  const reality = await loadOwnedRealityReasoningSnapshot(versionId, userId);
  if (!reality || reality.realityCase.id !== caseId) return null;

  const { data: links, error: linksError } = await supabaseAdmin
    .from("reasoning_sources")
    .select(
      "bayesian_belief_id, fermi_estimate_id, reframing_session_id"
    )
    .eq("user_id", userId)
    .eq("reality_version_id", versionId);
  if (linksError) throw new Error(linksError.message);
  const focusedInquiries = await listFocusExportsForClosure(
    caseId,
    versionId,
    userId
  );

  const bayesianIds = (links ?? [])
    .map((item) => item.bayesian_belief_id as string | null)
    .filter((id): id is string => Boolean(id));
  const fermiIds = (links ?? [])
    .map((item) => item.fermi_estimate_id as string | null)
    .filter((id): id is string => Boolean(id));
  const reframingIds = (links ?? [])
    .map((item) => item.reframing_session_id as string | null)
    .filter((id): id is string => Boolean(id));

  const [
    beliefsResult,
    updatesResult,
    estimatesResult,
    componentsResult,
    sessionsResult,
    framesResult,
  ] = await Promise.all([
    bayesianIds.length
      ? supabaseAdmin
          .from("bayesian_beliefs")
          .select("id, question, prior")
          .eq("user_id", userId)
          .in("id", bayesianIds)
      : Promise.resolve({ data: [], error: null }),
    bayesianIds.length
      ? supabaseAdmin
          .from("bayesian_updates")
          .select(
            "belief_id, evidence_text, evidence_type, posterior, ai_explanation, recorded_at"
          )
          .in("belief_id", bayesianIds)
          .order("recorded_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    fermiIds.length
      ? supabaseAdmin
          .from("fermi_estimates")
          .select("id, question, final_low, final_high, unit")
          .eq("user_id", userId)
          .in("id", fermiIds)
      : Promise.resolve({ data: [], error: null }),
    fermiIds.length
      ? supabaseAdmin
          .from("fermi_components")
          .select(
            "estimate_id, ordinal, label, low, high, rationale, user_note"
          )
          .in("estimate_id", fermiIds)
          .order("ordinal", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    reframingIds.length
      ? supabaseAdmin
          .from("reframing_sessions")
          .select("id, topic_text, context_note")
          .eq("user_id", userId)
          .in("id", reframingIds)
      : Promise.resolve({ data: [], error: null }),
    reframingIds.length
      ? supabaseAdmin
          .from("reframing_frames")
          .select(
            "session_id, frame_type, title, description, is_marked"
          )
          .in("session_id", reframingIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const result of [
    beliefsResult,
    updatesResult,
    estimatesResult,
    componentsResult,
    sessionsResult,
    framesResult,
  ]) {
    if (result.error) throw new Error(result.error.message);
  }

  return assembleClosureSource({
    reality,
    links: (links ?? []).map((item) => ({
      bayesian_belief_id: item.bayesian_belief_id as string | null,
      fermi_estimate_id: item.fermi_estimate_id as string | null,
      reframing_session_id: item.reframing_session_id as string | null,
    })),
    beliefs: (beliefsResult.data ?? []).map((item) => ({
      id: item.id as string,
      question: item.question as string,
      prior: Number(item.prior),
    })),
    bayesianUpdates: (updatesResult.data ?? []).map((item) => ({
      belief_id: item.belief_id as string,
      evidence_text: item.evidence_text as string,
      evidence_type: item.evidence_type as string,
      posterior: Number(item.posterior),
      ai_explanation: item.ai_explanation as string,
      recorded_at: item.recorded_at as string,
    })),
    estimates: (estimatesResult.data ?? []).map((item) => ({
      id: item.id as string,
      question: item.question as string,
      final_low:
        item.final_low === null ? null : Number(item.final_low),
      final_high:
        item.final_high === null ? null : Number(item.final_high),
      unit: item.unit as string,
    })),
    fermiComponents: (componentsResult.data ?? []).map((item) => ({
      estimate_id: item.estimate_id as string,
      ordinal: Number(item.ordinal),
      label: item.label as string,
      low: Number(item.low),
      high: Number(item.high),
      rationale: item.rationale as string,
      user_note: (item.user_note as string | null) ?? "",
    })),
    sessions: (sessionsResult.data ?? []).map((item) => ({
      id: item.id as string,
      topic_text: item.topic_text as string,
      context_note: item.context_note as string | null,
    })),
    reframingFrames: (framesResult.data ?? []).map((item) => ({
      session_id: item.session_id as string,
      frame_type: item.frame_type as string,
      title: item.title as string,
      description: item.description as string,
      is_marked: Boolean(item.is_marked),
    })),
    focusedInquiries,
  });
}

function parseEvent(value: Record<string, unknown>): RealityClosureEvent {
  if (
    value.event_type !== "completed" &&
    value.event_type !== "not_completed" &&
    value.event_type !== "replaced" &&
    value.event_type !== "reconfirmed"
  ) {
    throw new Error("收束事件格式无效");
  }
  return {
    id: String(value.id),
    event_type: value.event_type,
    reality_version_id:
      typeof value.reality_version_id === "string"
        ? value.reality_version_id
        : null,
    note: String(value.note),
    created_at: String(value.created_at),
  };
}

export async function listRealityClosures(
  caseId: string,
  userId: string
): Promise<RealityClosure[]> {
  const { data, error } = await supabaseAdmin
    .from("reality_closures")
    .select(
      "id, case_id, source_version_id, replaces_closure_id, mode, decision, critical_unknown, next_action, completion_criterion, expected_feedback, due_on, rejected_alternative_reason, direction_change_reason, wait_signal, basis_refs, source_fingerprint, status, created_at, closed_at, reality_closure_events(id, event_type, reality_version_id, note, created_at)"
    )
    .eq("user_id", userId)
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });
  if (error) {
    if (missingClosureSchema(error)) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
    const draft = parseRealityClosureDraft({
      mode: row.mode,
      decision: row.decision,
      critical_unknown: row.critical_unknown,
      next_action: row.next_action,
      completion_criterion: row.completion_criterion,
      expected_feedback: row.expected_feedback,
      due_on: row.due_on,
      rejected_alternative_reason: row.rejected_alternative_reason,
      direction_change_reason: row.direction_change_reason,
      wait_signal: row.wait_signal,
      basis_refs: row.basis_refs,
    });
    if (
      !REALITY_CLOSURE_STATUSES.includes(
        row.status as RealityClosureStatus
      )
    ) {
      throw new Error("收束状态格式无效");
    }
    const events = Array.isArray(row.reality_closure_events)
      ? row.reality_closure_events
          .map((item) => parseEvent(item as Record<string, unknown>))
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
      : [];
    return {
      ...draft,
      id: row.id as string,
      case_id: row.case_id as string,
      source_version_id: row.source_version_id as string,
      replaces_closure_id: row.replaces_closure_id as string | null,
      source_fingerprint: row.source_fingerprint as string,
      status: row.status as RealityClosureStatus,
      created_at: row.created_at as string,
      closed_at: row.closed_at as string | null,
      events,
    };
  });
}

export async function listActiveRealityClosureDueDates(
  userId: string
): Promise<Array<{ case_id: string; due_on: string }>> {
  const { data, error } = await supabaseAdmin
    .from("reality_closures")
    .select("case_id, due_on")
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) {
    if (missingClosureSchema(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => ({
    case_id: row.case_id as string,
    due_on: row.due_on as string,
  }));
}
