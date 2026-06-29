import type { RealityPathType } from "./types";

export const REALITY_CLOSURE_MODES = ["act", "verify", "wait"] as const;
export type RealityClosureMode = (typeof REALITY_CLOSURE_MODES)[number];

export const REALITY_CLOSURE_STATUSES = [
  "active",
  "completed",
  "not_completed",
  "replaced",
] as const;
export type RealityClosureStatus =
  (typeof REALITY_CLOSURE_STATUSES)[number];

export type RealityClosureDraft = {
  mode: RealityClosureMode;
  decision: string;
  critical_unknown: string;
  next_action: string;
  completion_criterion: string;
  expected_feedback: string;
  due_on: string;
  rejected_alternative_reason: string;
  direction_change_reason: string | null;
  wait_signal: string | null;
  basis_refs: string[];
};

export type RealityClosureEditableField = Exclude<
  keyof RealityClosureDraft,
  "basis_refs"
>;

export type RealityClosureEvent = {
  id: string;
  event_type: "completed" | "not_completed" | "replaced" | "reconfirmed";
  reality_version_id: string | null;
  note: string;
  created_at: string;
};

export type RealityClosure = RealityClosureDraft & {
  id: string;
  case_id: string;
  source_version_id: string;
  replaces_closure_id: string | null;
  source_fingerprint: string;
  status: RealityClosureStatus;
  created_at: string;
  closed_at: string | null;
  events: RealityClosureEvent[];
};

const DRAFT_KEYS = new Set<keyof RealityClosureDraft>([
  "mode",
  "decision",
  "critical_unknown",
  "next_action",
  "completion_criterion",
  "expected_feedback",
  "due_on",
  "rejected_alternative_reason",
  "direction_change_reason",
  "wait_signal",
  "basis_refs",
]);

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("收束草稿格式无效");
  }
  return value as Record<string, unknown>;
}

function requiredText(
  value: unknown,
  label: string,
  maxLength = 1000
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label}不能为空`);
  }
  const result = value.trim();
  if (result.length > maxLength) throw new Error(`${label}过长`);
  if (/成功率|胜率|潜力评分|打分/.test(result)) {
    throw new Error(`${label}不能包含评分或成功率`);
  }
  return result;
}

function optionalText(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  return requiredText(value, label);
}

export function parseRealityClosureDraft(
  value: unknown
): RealityClosureDraft {
  const input = object(value);
  for (const key of Object.keys(input)) {
    if (!DRAFT_KEYS.has(key as keyof RealityClosureDraft)) {
      throw new Error(`收束草稿包含未知字段：${key}`);
    }
  }
  if (
    input.mode !== "act" &&
    input.mode !== "verify" &&
    input.mode !== "wait"
  ) {
    throw new Error("mode格式无效");
  }
  if (!Array.isArray(input.basis_refs) || input.basis_refs.length === 0) {
    throw new Error("basis_refs不能为空");
  }
  const basisRefs = input.basis_refs.map((item) =>
    requiredText(item, "basis_refs", 200)
  );
  if (new Set(basisRefs).size !== basisRefs.length) {
    throw new Error("basis_refs不能重复");
  }
  const waitSignal = optionalText(input.wait_signal, "wait_signal");
  if (input.mode === "wait" && !waitSignal) {
    throw new Error("wait_signal不能为空");
  }
  return {
    mode: input.mode,
    decision: requiredText(input.decision, "decision"),
    critical_unknown: requiredText(
      input.critical_unknown,
      "critical_unknown"
    ),
    next_action: requiredText(input.next_action, "next_action"),
    completion_criterion: requiredText(
      input.completion_criterion,
      "completion_criterion"
    ),
    expected_feedback: requiredText(
      input.expected_feedback,
      "expected_feedback"
    ),
    due_on: requiredText(input.due_on, "due_on", 10),
    rejected_alternative_reason: requiredText(
      input.rejected_alternative_reason,
      "rejected_alternative_reason"
    ),
    direction_change_reason: optionalText(
      input.direction_change_reason,
      "direction_change_reason"
    ),
    wait_signal: waitSignal,
    basis_refs: basisRefs,
  };
}

export function assertClosureDueDate(dueOn: string, today: string): void {
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(dueOn) || !pattern.test(today)) {
    throw new Error("截止日期必须是YYYY-MM-DD");
  }
  const due = new Date(`${dueOn}T00:00:00Z`);
  if (Number.isNaN(due.getTime()) || due.toISOString().slice(0, 10) !== dueOn) {
    throw new Error("截止日期无效");
  }
  if (dueOn <= today) throw new Error("截止日期必须晚于今天");
}

export function pathTypeToClosureMode(
  pathType: RealityPathType
): RealityClosureMode {
  return pathType === "investigate" ? "verify" : pathType;
}

export function mergeClosureDraftKeepingEdits(
  current: RealityClosureDraft,
  fresh: RealityClosureDraft,
  edited: ReadonlySet<RealityClosureEditableField>
): RealityClosureDraft {
  const merged = { ...fresh };
  edited.forEach((field) => {
    merged[field] = current[field] as never;
  });
  return merged;
}

export function normalizeClosureResolution(
  outcome: unknown,
  note: unknown
): { outcome: "completed" | "not_completed"; note: string } {
  if (outcome !== "completed" && outcome !== "not_completed") {
    throw new Error("收束结果无效");
  }
  return {
    outcome,
    note: requiredText(note, "实际结果"),
  };
}

export function normalizeReplacementReason(value: unknown): string {
  return requiredText(value, "替代原因");
}

export function closureNeedsReconfirmation(
  closure: {
    source_version_id: string;
    events: Array<{
      event_type: string;
      reality_version_id: string | null;
    }>;
  },
  latestVersionId: string
): boolean {
  if (closure.source_version_id === latestVersionId) return false;
  return !closure.events.some(
    (event) =>
      event.event_type === "reconfirmed" &&
      event.reality_version_id === latestVersionId
  );
}

export function isClosureDue(dueOn: string, today: string): boolean {
  return dueOn <= today;
}
