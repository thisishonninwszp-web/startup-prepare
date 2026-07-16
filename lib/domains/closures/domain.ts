export const DECISION_CLOSURE_OBJECT_TYPES = [
  "reality_case",
  "idea",
  "customer_case",
  "dream_case",
  "dream_branch",
  "retro_period",
  "company_profile",
  "reasoning_session",
] as const;

export type DecisionClosureObjectType =
  (typeof DECISION_CLOSURE_OBJECT_TYPES)[number];

export const DECISION_CLOSURE_STATUSES = [
  "active",
  "completed",
  "not_completed",
  "replaced",
  "archived",
] as const;

export type DecisionClosureStatus =
  (typeof DECISION_CLOSURE_STATUSES)[number];

export type DecisionClosureOption = {
  label: string;
  when_to_choose: string;
  tradeoff: string;
  small_try: string;
};

export type DecisionClosureDraft = {
  current_judgment: string;
  critical_unknowns: string[];
  options: DecisionClosureOption[];
  selected_next_step: string;
  completion_criterion: string;
  expected_feedback: string;
  due_on: string;
  basis_refs: string[];
};

export type DecisionClosureSourceRef = {
  ref: string;
  label: string;
};

export type DecisionClosureSourceSnapshot = {
  refs: DecisionClosureSourceRef[];
  [key: string]: unknown;
};

export type DecisionClosure = DecisionClosureDraft & {
  id: string;
  object_type: DecisionClosureObjectType;
  object_id: string;
  origin_module: string;
  title: string;
  status: DecisionClosureStatus;
  created_at: string;
  closed_at: string | null;
};

const FORBIDDEN_PATTERN =
  /评分|打分|星级|成功率|胜率|概率|有潜力|人格诊断|心理诊断|80%|90%|\d+\s*%/;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("收束草稿格式无效");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maxLength = 1200): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label}不能为空`);
  }
  const result = value.trim();
  if (result.length > maxLength) throw new Error(`${label}过长`);
  if (FORBIDDEN_PATTERN.test(result)) {
    throw new Error(`${label}不能包含评分、成功率或诊断语言`);
  }
  return result;
}

function textArray(
  value: unknown,
  label: string,
  min: number,
  max: number
): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new Error(`${label}数量无效`);
  }
  const result = value.map((item) => text(item, label, 500));
  if (new Set(result).size !== result.length) {
    throw new Error(`${label}不能重复`);
  }
  return result;
}

function parseOption(value: unknown): DecisionClosureOption {
  const input = object(value);
  return {
    label: text(input.label, "options.label", 80),
    when_to_choose: text(input.when_to_choose, "options.when_to_choose"),
    tradeoff: text(input.tradeoff, "options.tradeoff"),
    small_try: text(input.small_try, "options.small_try"),
  };
}

export function parseDecisionClosureDraft(
  value: unknown
): DecisionClosureDraft {
  const input = object(value);
  const options = input.options;
  if (!Array.isArray(options) || options.length < 2 || options.length > 3) {
    throw new Error("options数量无效");
  }
  return {
    current_judgment: text(input.current_judgment, "current_judgment"),
    critical_unknowns: textArray(input.critical_unknowns, "critical_unknowns", 1, 3),
    options: options.map(parseOption),
    selected_next_step: text(input.selected_next_step, "selected_next_step"),
    completion_criterion: text(input.completion_criterion, "completion_criterion"),
    expected_feedback: text(input.expected_feedback, "expected_feedback"),
    due_on: text(input.due_on, "due_on", 10),
    basis_refs: textArray(input.basis_refs, "basis_refs", 1, 20),
  };
}

export function assertDecisionClosureDueDate(
  dueOn: string,
  today: string
): void {
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(dueOn) || !pattern.test(today)) {
    throw new Error("对账日期必须是YYYY-MM-DD");
  }
  const due = new Date(`${dueOn}T00:00:00Z`);
  if (Number.isNaN(due.getTime()) || due.toISOString().slice(0, 10) !== dueOn) {
    throw new Error("对账日期无效");
  }
  if (dueOn <= today) throw new Error("对账日期必须晚于今天");
}

export function allowedDecisionBasisRefs(
  source: DecisionClosureSourceSnapshot
): string[] {
  return source.refs.map((item) => item.ref);
}

export function validateDecisionClosureBasisRefs(
  draft: DecisionClosureDraft,
  source: DecisionClosureSourceSnapshot
): void {
  const allowed = new Set(allowedDecisionBasisRefs(source));
  for (const ref of draft.basis_refs) {
    if (!allowed.has(ref)) {
      throw new Error(`收束草稿包含无法验证的引用：${ref}`);
    }
  }
}

export function validateDecisionClosureDraft(
  draft: DecisionClosureDraft,
  source: DecisionClosureSourceSnapshot,
  today: string
): void {
  assertDecisionClosureDueDate(draft.due_on, today);
  validateDecisionClosureBasisRefs(draft, source);
}

export function isDecisionClosureDue(dueOn: string, today: string): boolean {
  return dueOn <= today;
}
