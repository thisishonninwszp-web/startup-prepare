import { supabaseAdmin } from "@/lib/supabase";
import {
  DECISION_CLOSURE_OBJECT_TYPES,
  DECISION_CLOSURE_STATUSES,
  parseDecisionClosureDraft,
  type DecisionClosure,
  type DecisionClosureObjectType,
  type DecisionClosureStatus,
} from "./domain";

function missingDecisionClosureSchema(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    error.code === "PGRST205" &&
    Boolean(
      error.message?.includes("decision_closures") ||
        error.message?.includes("decision_closure_sources") ||
        error.message?.includes("decision_closure_events")
    )
  );
}

export async function getDecisionClosureSchemaStatus(): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("decision_closures")
    .select("id")
    .limit(1);
  if (!error) return true;
  if (missingDecisionClosureSchema(error)) return false;
  throw new Error(error.message);
}

function parseClosureRow(row: Record<string, unknown>): DecisionClosure {
  if (
    !DECISION_CLOSURE_OBJECT_TYPES.includes(
      row.object_type as DecisionClosureObjectType
    )
  ) {
    throw new Error("通用收束对象类型无效");
  }
  if (
    !DECISION_CLOSURE_STATUSES.includes(
      row.status as DecisionClosureStatus
    )
  ) {
    throw new Error("通用收束状态无效");
  }
  const draft = parseDecisionClosureDraft({
    current_judgment: row.current_judgment,
    critical_unknowns: row.critical_unknowns,
    options: row.options,
    selected_next_step: row.selected_next_step,
    completion_criterion: row.completion_criterion,
    expected_feedback: row.expected_feedback,
    due_on: row.due_on,
    basis_refs: row.basis_refs,
  });
  return {
    ...draft,
    id: row.id as string,
    object_type: row.object_type as DecisionClosureObjectType,
    object_id: row.object_id as string,
    origin_module: row.origin_module as string,
    title: row.title as string,
    status: row.status as DecisionClosureStatus,
    created_at: row.created_at as string,
    closed_at: row.closed_at as string | null,
  };
}

const SELECT =
  "id, object_type, object_id, origin_module, title, current_judgment, critical_unknowns, options, selected_next_step, completion_criterion, expected_feedback, due_on, basis_refs, status, created_at, closed_at";

export async function listDecisionClosuresForObject(
  userId: string,
  objectType: DecisionClosureObjectType,
  objectId: string
): Promise<DecisionClosure[]> {
  const { data, error } = await supabaseAdmin
    .from("decision_closures")
    .select(SELECT)
    .eq("user_id", userId)
    .eq("object_type", objectType)
    .eq("object_id", objectId)
    .order("created_at", { ascending: false });
  if (error) {
    if (missingDecisionClosureSchema(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) =>
    parseClosureRow(row as Record<string, unknown>)
  );
}

export async function listOpenDecisionClosures(
  userId: string
): Promise<DecisionClosure[]> {
  const { data, error } = await supabaseAdmin
    .from("decision_closures")
    .select(SELECT)
    .eq("user_id", userId)
    .eq("status", "active")
    .order("due_on", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) {
    if (missingDecisionClosureSchema(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) =>
    parseClosureRow(row as Record<string, unknown>)
  );
}
