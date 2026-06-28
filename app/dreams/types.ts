export const DREAM_CONTEXTS = ["personal", "business", "cross"] as const;
export type DreamContext = (typeof DREAM_CONTEXTS)[number];

export const DREAM_SCALES = ["small", "big", "grand"] as const;
export type DreamScale = (typeof DREAM_SCALES)[number];

export type DreamMessage = {
  role: "user" | "assistant";
  content: string;
};

export type DreamInterviewResult = {
  questions: string[];
  missing_dimensions: string[];
  ready_to_synthesize: boolean;
};

export type DreamVision = {
  scene: {
    title: string;
    horizon: string;
    location: string;
    people: string[];
    sensory_details: string[];
    actions: string[];
    inner_state: string;
  };
  desired_changes: string[];
  past_roots: string[];
  non_negotiables: string[];
  costs: string[];
  assumptions: string[];
  reality_signals: string[];
  conflicts: string[];
};

export type DreamDelta = {
  scene_changes: string[];
  desired_change_updates: string[];
  assumption_changes: string[];
  new_costs: string[];
  resolved_conflicts: string[];
  new_conflicts: string[];
  change_reason: string;
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}必须是对象`);
  }
  return value as Record<string, unknown>;
}

function stringValue(
  value: unknown,
  label: string,
  allowEmpty = false
): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    throw new Error(`${label}必须是非空文本`);
  }
  return value.trim();
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label}必须是数组`);
  return value.map((item, index) =>
    stringValue(item, `${label}[${index}]`)
  );
}

export function parseDreamInterviewResult(
  value: unknown
): DreamInterviewResult {
  const input = object(value, "梦想访谈");
  const questions = strings(input.questions, "questions");
  if (questions.length < 1 || questions.length > 3) {
    throw new Error("questions必须包含1到3个问题");
  }
  if (typeof input.ready_to_synthesize !== "boolean") {
    throw new Error("ready_to_synthesize必须是布尔值");
  }
  return {
    questions,
    missing_dimensions: strings(
      input.missing_dimensions,
      "missing_dimensions"
    ),
    ready_to_synthesize: input.ready_to_synthesize,
  };
}

export function parseDreamVision(value: unknown): DreamVision {
  const input = object(value, "梦想愿景");
  const scene = object(input.scene, "scene");
  return {
    scene: {
      title: stringValue(scene.title, "scene.title"),
      horizon: stringValue(scene.horizon, "scene.horizon"),
      location: stringValue(scene.location, "scene.location"),
      people: strings(scene.people, "scene.people"),
      sensory_details: strings(
        scene.sensory_details,
        "scene.sensory_details"
      ),
      actions: strings(scene.actions, "scene.actions"),
      inner_state: stringValue(scene.inner_state, "scene.inner_state"),
    },
    desired_changes: strings(input.desired_changes, "desired_changes"),
    past_roots: strings(input.past_roots, "past_roots"),
    non_negotiables: strings(input.non_negotiables, "non_negotiables"),
    costs: strings(input.costs, "costs"),
    assumptions: strings(input.assumptions, "assumptions"),
    reality_signals: strings(input.reality_signals, "reality_signals"),
    conflicts: strings(input.conflicts, "conflicts"),
  };
}

export function parseDreamDelta(value: unknown): DreamDelta {
  const input = object(value, "梦想版本差异");
  return {
    scene_changes: strings(input.scene_changes, "scene_changes"),
    desired_change_updates: strings(
      input.desired_change_updates,
      "desired_change_updates"
    ),
    assumption_changes: strings(
      input.assumption_changes,
      "assumption_changes"
    ),
    new_costs: strings(input.new_costs, "new_costs"),
    resolved_conflicts: strings(
      input.resolved_conflicts,
      "resolved_conflicts"
    ),
    new_conflicts: strings(input.new_conflicts, "new_conflicts"),
    change_reason: stringValue(
      input.change_reason,
      "change_reason",
      true
    ),
  };
}

