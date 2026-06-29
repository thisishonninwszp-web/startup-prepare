import { supabaseAdmin } from "../../lib/supabase";
import {
  parseRealityMap,
  type RealityContext,
  type RealityMap,
  type RealityPath,
} from "../reality/types";

export type ReasoningTool = "bayesian" | "fermi" | "reframing";

export type RealityReasoningSnapshot = {
  realityCase: {
    id: string;
    title: string;
    context: RealityContext;
  };
  version: {
    id: string;
    version_no: number;
    created_at: string;
  };
  map: RealityMap;
  selected_path: RealityPath | null;
  custom_action: string | null;
  selection_reason: string | null;
};

type SnapshotInput = {
  realityCase: RealityReasoningSnapshot["realityCase"];
  version: RealityReasoningSnapshot["version"] & {
    map: RealityMap;
    selected_path: RealityPath | null;
    custom_action: string | null;
    selection_reason: string | null;
  };
};

const TARGET_COLUMN = {
  bayesian: "bayesian_belief_id",
  fermi: "fermi_estimate_id",
  reframing: "reframing_session_id",
} as const;

export function reasoningTargetColumn(tool: ReasoningTool) {
  return TARGET_COLUMN[tool];
}

export function buildRealityReasoningSnapshot(
  input: SnapshotInput
): RealityReasoningSnapshot {
  return {
    realityCase: { ...input.realityCase },
    version: {
      id: input.version.id,
      version_no: input.version.version_no,
      created_at: input.version.created_at,
    },
    map: input.version.map,
    selected_path: input.version.selected_path,
    custom_action: input.version.custom_action,
    selection_reason: input.version.selection_reason,
  };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}格式无效`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label}格式无效`);
  }
  return value.trim();
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parsePath(value: unknown): RealityPath | null {
  if (value === null || value === undefined) return null;
  const row = record(value, "selected_path");
  if (
    row.type !== "investigate" &&
    row.type !== "act" &&
    row.type !== "wait"
  ) {
    throw new Error("selected_path.type格式无效");
  }
  return {
    type: row.type,
    title: text(row.title, "selected_path.title"),
    rationale: text(row.rationale, "selected_path.rationale"),
    action: text(row.action, "selected_path.action"),
    risk: text(row.risk, "selected_path.risk"),
  };
}

export function parseRealityReasoningSnapshot(
  value: unknown
): RealityReasoningSnapshot {
  const input = record(value, "source_snapshot");
  const realityCase = record(input.realityCase, "realityCase");
  const version = record(input.version, "version");
  const context = realityCase.context;
  if (context !== "personal" && context !== "business" && context !== "cross") {
    throw new Error("realityCase.context格式无效");
  }
  const versionNo = version.version_no;
  if (
    typeof versionNo !== "number" ||
    !Number.isInteger(versionNo) ||
    versionNo < 1
  ) {
    throw new Error("version.version_no格式无效");
  }
  const createdAt = text(version.created_at, "version.created_at");
  if (Number.isNaN(new Date(createdAt).getTime())) {
    throw new Error("version.created_at格式无效");
  }
  return {
    realityCase: {
      id: text(realityCase.id, "realityCase.id"),
      title: text(realityCase.title, "realityCase.title"),
      context,
    },
    version: {
      id: text(version.id, "version.id"),
      version_no: versionNo,
      created_at: createdAt,
    },
    map: parseRealityMap(input.map),
    selected_path: parsePath(input.selected_path),
    custom_action: optionalText(input.custom_action),
    selection_reason: optionalText(input.selection_reason),
  };
}

function firstRelation(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return value[0] && typeof value[0] === "object"
      ? (value[0] as Record<string, unknown>)
      : null;
  }
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export async function loadOwnedRealityReasoningSnapshot(
  versionId: string,
  userId: string
): Promise<RealityReasoningSnapshot | null> {
  const { data, error } = await supabaseAdmin
    .from("reality_versions")
    .select(
      "id, version_no, map, selected_path, custom_action, selection_reason, created_at, reality_cases!inner(id, user_id, title, context)"
    )
    .eq("id", versionId)
    .eq("reality_cases.user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const realityCase = firstRelation(data.reality_cases);
  if (!realityCase || realityCase.user_id !== userId) return null;
  return buildRealityReasoningSnapshot({
    realityCase: {
      id: text(realityCase.id, "realityCase.id"),
      title: text(realityCase.title, "realityCase.title"),
      context: realityCase.context as RealityContext,
    },
    version: {
      id: data.id,
      version_no: data.version_no,
      created_at: data.created_at,
      map: parseRealityMap(data.map),
      selected_path: parsePath(data.selected_path),
      custom_action: optionalText(data.custom_action),
      selection_reason: optionalText(data.selection_reason),
    },
  });
}

export async function saveReasoningSource(input: {
  userId: string;
  tool: ReasoningTool;
  targetId: string;
  snapshot: RealityReasoningSnapshot;
}): Promise<void> {
  const targetColumn = reasoningTargetColumn(input.tool);
  const { error } = await supabaseAdmin.from("reasoning_sources").insert({
    user_id: input.userId,
    reality_version_id: input.snapshot.version.id,
    [targetColumn]: input.targetId,
    source_snapshot: input.snapshot,
  });
  if (error) throw new Error(error.message);
}

export async function getReasoningSource(
  tool: ReasoningTool,
  targetId: string,
  userId: string
): Promise<RealityReasoningSnapshot | null> {
  const { data, error } = await supabaseAdmin
    .from("reasoning_sources")
    .select("source_snapshot")
    .eq("user_id", userId)
    .eq(reasoningTargetColumn(tool), targetId)
    .maybeSingle();
  if (error) {
    if (
      error.code === "PGRST205" &&
      error.message.includes("reasoning_sources")
    ) {
      return null;
    }
    throw new Error(error.message);
  }
  return data ? parseRealityReasoningSnapshot(data.source_snapshot) : null;
}

export async function getReasoningSourceSchemaStatus(): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("reasoning_sources")
    .select("id")
    .limit(1);
  if (!error) return true;
  if (
    error.code === "PGRST205" &&
    error.message.includes("reasoning_sources")
  ) {
    return false;
  }
  throw new Error(error.message);
}
