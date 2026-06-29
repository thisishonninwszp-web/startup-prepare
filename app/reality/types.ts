export const REALITY_MODES = ["specific", "global"] as const;
export type RealityMode = (typeof REALITY_MODES)[number];

export const REALITY_CONTEXTS = ["personal", "business", "cross"] as const;
export type RealityContext = (typeof REALITY_CONTEXTS)[number];

export const REALITY_SOURCE_TYPES = [
  "observation",
  "idea",
  "validation",
  "prediction",
] as const;
export type RealitySourceType = (typeof REALITY_SOURCE_TYPES)[number];

export const REALITY_INTERVIEW_SOFT_LIMIT = 6;

export const PERSONAL_DOMAINS = ["健康", "关系", "成长", "生活", "财务"];
export const BUSINESS_DOMAINS = ["客户", "产品", "增长", "运营", "资源"];

export type RealityMessage = {
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type RealityInterviewResult = {
  questions: string[];
  missing_dimensions: string[];
  ready_to_synthesize: boolean;
};

export type RealityEmotion = {
  feeling: string;
  trigger: string;
  judgment_impact: string;
};

export type RealityFact = {
  statement: string;
  source: string;
};

export type RealityConstraints = {
  fixed: string[];
  influenceable: string[];
  actionable_now: string[];
};

export type RealityPathType = "investigate" | "act" | "wait";

export function reasoningBridgeHref(
  tool: "bayesian" | "fermi" | "reframing",
  realityVersionId: string
): string {
  const params = new URLSearchParams({
    reality_version_id: realityVersionId,
  });
  return `/reasoning/${tool}/new?${params.toString()}`;
}

export type RealityPath = {
  type: RealityPathType;
  title: string;
  rationale: string;
  action: string;
  risk: string;
};

export type RealityMap = {
  topic: string;
  emotions: RealityEmotion[];
  facts: RealityFact[];
  interpretations: string[];
  unknowns: string[];
  constraints: RealityConstraints;
  contradictions: string[];
  paths: RealityPath[];
};

export type RealityDelta = {
  added_facts: string[];
  revised_interpretations: string[];
  resolved_unknowns: string[];
  new_unknowns: string[];
  emotion_changes: string[];
  previous_path_result: string;
  change_reason: string;
};

export type RealityCaseSummary = {
  id: string;
  mode: RealityMode;
  context: RealityContext;
  title: string;
  domains: string[];
  updated_at: string;
  review_due_at: string | null;
};

export type RealityVersion = {
  id: string;
  version_no: number;
  map: RealityMap;
  delta: RealityDelta | null;
  selected_path: RealityPath | null;
  custom_action: string | null;
  selection_reason: string | null;
  review_due_at: string | null;
  created_at: string;
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((item, index) => string(item, `${label}[${index}]`));
}

export function parseRealityInterviewResult(
  value: unknown
): RealityInterviewResult {
  const input = object(value, "interview result");
  const questions = strings(input.questions, "questions");
  if (questions.length < 1 || questions.length > 3) {
    throw new Error("questions must contain between one and three items");
  }
  if (typeof input.ready_to_synthesize !== "boolean") {
    throw new Error("ready_to_synthesize must be a boolean");
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

export function parseRealityMap(value: unknown): RealityMap {
  const input = object(value, "reality map");
  const constraints = object(input.constraints, "constraints");

  if (!Array.isArray(input.emotions)) {
    throw new Error("emotions must be an array");
  }
  const emotions = input.emotions.map((item, index) => {
    const row = object(item, `emotions[${index}]`);
    return {
      feeling: string(row.feeling, `emotions[${index}].feeling`),
      trigger: string(row.trigger, `emotions[${index}].trigger`),
      judgment_impact: string(
        row.judgment_impact,
        `emotions[${index}].judgment_impact`
      ),
    };
  });

  if (!Array.isArray(input.facts)) throw new Error("facts must be an array");
  const facts = input.facts.map((item, index) => {
    const row = object(item, `facts[${index}]`);
    return {
      statement: string(row.statement, `facts[${index}].statement`),
      source: string(row.source, `facts[${index}].source`),
    };
  });

  if (!Array.isArray(input.paths)) throw new Error("paths must be an array");
  const paths: RealityPath[] = input.paths.map((item, index) => {
    const row = object(item, `paths[${index}]`);
    if (
      row.type !== "investigate" &&
      row.type !== "act" &&
      row.type !== "wait"
    ) {
      throw new Error(`paths[${index}].type is invalid`);
    }
    const type: RealityPathType = row.type;
    return {
      type,
      title: string(row.title, `paths[${index}].title`),
      rationale: string(row.rationale, `paths[${index}].rationale`),
      action: string(row.action, `paths[${index}].action`),
      risk: string(row.risk, `paths[${index}].risk`),
    };
  });
  const pathTypes = new Set(paths.map((path) => path.type));
  if (
    paths.length !== 3 ||
    pathTypes.size !== 3 ||
    !pathTypes.has("investigate") ||
    !pathTypes.has("act") ||
    !pathTypes.has("wait")
  ) {
    throw new Error("paths must contain investigate, act, and wait exactly once");
  }

  return {
    topic: string(input.topic, "topic"),
    emotions,
    facts,
    interpretations: strings(input.interpretations, "interpretations"),
    unknowns: strings(input.unknowns, "unknowns"),
    constraints: {
      fixed: strings(constraints.fixed, "constraints.fixed"),
      influenceable: strings(
        constraints.influenceable,
        "constraints.influenceable"
      ),
      actionable_now: strings(
        constraints.actionable_now,
        "constraints.actionable_now"
      ),
    },
    contradictions: strings(input.contradictions, "contradictions"),
    paths,
  };
}

export function parseRealityDelta(value: unknown): RealityDelta {
  const input = object(value, "reality delta");
  return {
    added_facts: strings(input.added_facts, "added_facts"),
    revised_interpretations: strings(
      input.revised_interpretations,
      "revised_interpretations"
    ),
    resolved_unknowns: strings(input.resolved_unknowns, "resolved_unknowns"),
    new_unknowns: strings(input.new_unknowns, "new_unknowns"),
    emotion_changes: strings(input.emotion_changes, "emotion_changes"),
    previous_path_result:
      typeof input.previous_path_result === "string"
        ? input.previous_path_result.trim()
        : "",
    change_reason:
      typeof input.change_reason === "string"
        ? input.change_reason.trim()
        : "",
  };
}
