import type { CentralQuestionCandidate } from "@/app/concepts/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function str(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function num(value: unknown, label: string): number {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (typeof n !== "number" || !isFinite(n)) {
    throw new Error(`${label} must be a finite number`);
  }
  return n;
}

function prob(value: unknown, label: string): number {
  const n = num(value, label);
  if (n < 0 || n > 1) throw new Error(`${label} must be between 0 and 1`);
  return Math.round(n * 10000) / 10000;
}

// ── Bayesian ──────────────────────────────────────────────────────────────────

export type BayesianBelief = {
  id: string;
  question: string;
  prior: number;
  prior_rationale: string;
  idea_id: string | null;
  created_at: string;
  updated_at: string;
};

export type BayesianUpdate = {
  id: string;
  belief_id: string;
  evidence_text: string;
  evidence_type: string;
  likelihood_if_true: number;
  likelihood_if_false: number;
  posterior: number;
  prior_at_time: number;
  ai_explanation: string;
  recorded_at: string;
};

export type BayesianBeliefWithHistory = BayesianBelief & {
  updates: BayesianUpdate[];
  current_posterior: number;
};

export type BayesPriorSuggestion = {
  suggested_prior: number;
  rationale: string;
  analogies: string[];
};

export type BayesUpdateAnalysis = {
  likelihood_if_true: number;
  likelihood_if_false: number;
  posterior: number;
  explanation: string;
  teaching_note: string;
};

export function parseBayesPriorSuggestion(value: unknown): BayesPriorSuggestion {
  const input = object(value, "bayes prior suggestion");
  const suggested_prior = prob(input.suggested_prior, "suggested_prior");
  if (suggested_prior < 0.05 || suggested_prior > 0.95) {
    throw new Error("suggested_prior must be between 0.05 and 0.95");
  }
  if (!Array.isArray(input.analogies) || input.analogies.length < 1) {
    throw new Error("analogies must be a non-empty array");
  }
  return {
    suggested_prior,
    rationale: str(input.rationale, "rationale"),
    analogies: input.analogies.map((a: unknown, i: number) =>
      str(a, `analogies[${i}]`)
    ),
  };
}

export function parseBayesUpdateAnalysis(value: unknown): BayesUpdateAnalysis {
  const input = object(value, "bayes update analysis");
  const lht = prob(input.likelihood_if_true, "likelihood_if_true");
  const lhf = prob(input.likelihood_if_false, "likelihood_if_false");

  if (lht <= 0 || lhf <= 0) {
    throw new Error("likelihoods must be greater than 0");
  }
  const ratio = lht / lhf;
  if (ratio < 0.1 || ratio > 10) {
    throw new Error(
      `likelihood ratio ${ratio.toFixed(3)} out of plausible range [0.1, 10]`
    );
  }

  // Always recompute posterior from the formula to prevent AI arithmetic errors
  const priorAtTime = prob(input.prior_at_time ?? input.prior ?? 0.5, "prior_at_time");
  const posterior =
    (lht * priorAtTime) / (lht * priorAtTime + lhf * (1 - priorAtTime));

  return {
    likelihood_if_true: lht,
    likelihood_if_false: lhf,
    posterior: Math.round(posterior * 10000) / 10000,
    explanation: str(input.explanation, "explanation"),
    teaching_note: str(input.teaching_note, "teaching_note"),
  };
}

// ── Fermi ─────────────────────────────────────────────────────────────────────

export type FermiEstimate = {
  id: string;
  question: string;
  category: string;
  final_low: number | null;
  final_high: number | null;
  unit: string;
  ai_teaching: string;
  idea_id: string | null;
  created_at: string;
  updated_at: string;
};

export type FermiComponent = {
  id: string;
  estimate_id: string;
  ordinal: number;
  label: string;
  rationale: string;
  low: number;
  high: number;
  user_note: string;
  sensitivity: string;
};

export type FermiEstimateWithComponents = FermiEstimate & {
  components: FermiComponent[];
};

export type FermiDecomposition = {
  components: Array<{
    label: string;
    rationale: string;
    suggested_low: number;
    suggested_high: number;
  }>;
  unit: string;
  teaching_note: string;
};

export type FermiSensitivityResult = {
  sensitivities: Array<{
    component_label: string;
    change_factor: number;
    final_change_description: string;
  }>;
};

export function parseFermiDecomposition(value: unknown): FermiDecomposition {
  const input = object(value, "fermi decomposition");
  if (!Array.isArray(input.components) || input.components.length < 2) {
    throw new Error("components must have at least 2 items");
  }
  if (input.components.length > 8) {
    throw new Error("components must have at most 8 items");
  }
  const components = input.components.map((c: unknown, i: number) => {
    const row = object(c, `components[${i}]`);
    const low = num(row.suggested_low, `components[${i}].suggested_low`);
    const high = num(row.suggested_high, `components[${i}].suggested_high`);
    if (low <= 0 || high <= 0) {
      throw new Error(`components[${i}] values must be positive`);
    }
    return {
      label: str(row.label, `components[${i}].label`),
      rationale: str(row.rationale, `components[${i}].rationale`),
      suggested_low: low,
      suggested_high: high,
    };
  });
  return {
    components,
    unit: str(input.unit, "unit"),
    teaching_note: str(input.teaching_note, "teaching_note"),
  };
}

export function parseFermiSensitivityResult(
  value: unknown
): FermiSensitivityResult {
  const input = object(value, "fermi sensitivity result");
  if (!Array.isArray(input.sensitivities)) {
    throw new Error("sensitivities must be an array");
  }
  const sensitivities = input.sensitivities.map((s: unknown, i: number) => {
    const row = object(s, `sensitivities[${i}]`);
    return {
      component_label: str(
        row.component_label,
        `sensitivities[${i}].component_label`
      ),
      change_factor: num(row.change_factor, `sensitivities[${i}].change_factor`),
      final_change_description: str(
        row.final_change_description,
        `sensitivities[${i}].final_change_description`
      ),
    };
  });
  return { sensitivities };
}

// ── Reframing ─────────────────────────────────────────────────────────────────

export const FRAME_TYPES = [
  "time_compress",
  "time_expand",
  "time_origin",
  "time_retrospect",
  "space_zoom_in",
  "space_zoom_out",
  "person_opponent",
  "person_beginner",
  "person_expert",
  "meaning_intent",
  "meaning_rebuild",
  "meaning_criteria",
  "assumption_flip",
  "redefine_problem",
  "second_order",
  "resource_reframe",
  "consequence_extend",
  "ecology_check",
  // 新增 8 种（第二批）
  "emotion_separate",
  "apply_to_friend",
  "stoic_control",
  "narrative_reframe",
  "pattern_recognition",
  "minimum_viable_move",
  "leverage_point",
  "gift_frame",
] as const;

export type FrameType = (typeof FRAME_TYPES)[number];

export const FRAME_GROUP_LABELS: Record<string, string> = {
  time: "时间维度",
  space: "空间维度",
  person: "人物维度",
  meaning: "意义维度",
  assumption: "假设维度",
  resource: "系统维度",
  second: "系统维度",
  consequence: "系统维度",
  ecology: "系统维度",
  redefine: "假设维度",
  emotion: "情绪与自我",
  apply: "情绪与自我",
  stoic: "情绪与自我",
  narrative: "叙事与模式",
  pattern: "叙事与模式",
  minimum: "行动与系统",
  leverage: "行动与系统",
  gift: "行动与系统",
};

export function frameGroup(frameType: string): string {
  const prefix = frameType.split("_")[0];
  return FRAME_GROUP_LABELS[prefix] ?? "其他";
}

export type ReframingSession = {
  id: string;
  topic_text: string;
  context_note: string;
  idea_id: string | null;
  central_question_candidates?: CentralQuestionCandidate[] | null;
  selected_question_type?: string | null;
  selected_question?: string | null;
  created_at: string;
};

export type ReframingFrame = {
  id: string;
  session_id: string;
  frame_type: string;
  title: string;
  description: string;
  is_marked: boolean;
  created_at: string;
};

export type ReframingSessionWithFrames = ReframingSession & {
  frames: ReframingFrame[];
};

export type ReframingOutput = {
  frames: Array<{
    frame_type: string;
    title: string;
    description: string;
  }>;
};

export const REASONING_REALITY_SECTIONS = [
  "topic",
  "emotions",
  "facts",
  "interpretations",
  "unknowns",
  "constraints",
  "contradictions",
  "selected_path",
] as const;

export type ReasoningRealitySection =
  (typeof REASONING_REALITY_SECTIONS)[number];

export type ReasoningRealityDraft =
  | {
      tool: "bayesian";
      question: string;
      used_sections: ReasoningRealitySection[];
    }
  | {
      tool: "fermi";
      question: string;
      category: "market" | "time" | "cost" | "custom";
      used_sections: ReasoningRealitySection[];
    }
  | {
      tool: "reframing";
      topic_text: string;
      context_note: string;
      used_sections: ReasoningRealitySection[];
    };

export function parseReasoningRealityDraft(
  value: unknown
): ReasoningRealityDraft {
  const input = object(value, "reasoning reality draft");
  for (const forbidden of [
    "score",
    "rating",
    "probability",
    "success_rate",
    "evidence",
  ]) {
    if (forbidden in input) {
      throw new Error(`${forbidden} is forbidden`);
    }
  }
  if (!Array.isArray(input.used_sections) || input.used_sections.length === 0) {
    throw new Error("used_sections must be a non-empty array");
  }
  const allowedSections = new Set<string>(REASONING_REALITY_SECTIONS);
  const used_sections = input.used_sections.map((section, index) => {
    const parsed = str(section, `used_sections[${index}]`);
    if (!allowedSections.has(parsed)) {
      throw new Error(`used_sections[${index}] is invalid`);
    }
    return parsed as ReasoningRealitySection;
  });
  const rejectPrediction = (text: string) => {
    if (/(成功率|胜率|评分|得分)/.test(text)) {
      throw new Error("draft must not predict success or score the idea");
    }
    return text;
  };
  if (input.tool === "bayesian") {
    return {
      tool: "bayesian",
      question: rejectPrediction(str(input.question, "question")),
      used_sections,
    };
  }
  if (input.tool === "fermi") {
    if (
      input.category !== "market" &&
      input.category !== "time" &&
      input.category !== "cost" &&
      input.category !== "custom"
    ) {
      throw new Error("category is invalid");
    }
    return {
      tool: "fermi",
      question: rejectPrediction(str(input.question, "question")),
      category: input.category,
      used_sections,
    };
  }
  if (input.tool === "reframing") {
    return {
      tool: "reframing",
      topic_text: rejectPrediction(str(input.topic_text, "topic_text")),
      context_note: str(input.context_note, "context_note"),
      used_sections,
    };
  }
  throw new Error("tool is invalid");
}

export function parseReframingOutput(value: unknown): ReframingOutput {
  const input = object(value, "reframing output");
  if (!Array.isArray(input.frames)) {
    throw new Error("frames must be an array");
  }
  const validTypes = new Set<string>(FRAME_TYPES);
  const seenTypes = new Set<string>();
  const frames = input.frames.map((f: unknown, i: number) => {
    const row = object(f, `frames[${i}]`);
    const frame_type = str(row.frame_type, `frames[${i}].frame_type`);
    if (!validTypes.has(frame_type)) {
      throw new Error(
        `frames[${i}].frame_type "${frame_type}" is not a valid frame type`
      );
    }
    if (seenTypes.has(frame_type)) {
      throw new Error(`duplicate frame_type: ${frame_type}`);
    }
    seenTypes.add(frame_type);
    return {
      frame_type,
      title: str(row.title, `frames[${i}].title`),
      description: str(row.description, `frames[${i}].description`),
    };
  });
  if (frames.length < 20) {
    throw new Error(`expected at least 20 frames, got ${frames.length}`);
  }
  return { frames };
}

// ── First Principles ──────────────────────────────────────────────────────────

export const NODE_BASIS_TYPES = [
  "bedrock",
  "data_backed",
  "personal_experience",
  "industry_consensus",
  "media_narrative",
  "pure_assumption",
] as const;

export type NodeBasisType = (typeof NODE_BASIS_TYPES)[number];

export type FirstPrinciplesSession = {
  id: string;
  user_id: string;
  idea_id: string | null;
  original_claim: string;
  context_note: string;
  restated_belief: string;
  bedrock_summary: string;
  weakest_links: string[];
  created_at: string;
};

export type FirstPrinciplesNode = {
  id: string;
  session_id: string;
  claim: string;
  basis_type: NodeBasisType;
  basis_note: string;
  challenge: string;
  depth: 1 | 2 | 3;
  is_verified: boolean;
  created_at: string;
};

export type FirstPrinciplesSessionWithNodes = FirstPrinciplesSession & {
  nodes: FirstPrinciplesNode[];
};

export type FirstPrinciplesOutput = {
  restated_belief: string;
  nodes: Array<{
    claim: string;
    basis_type: NodeBasisType;
    basis_note: string;
    challenge: string;
    depth: 1 | 2 | 3;
  }>;
  weakest_links: string[];
  bedrock_summary: string;
};

export function parseFirstPrinciplesOutput(value: unknown): FirstPrinciplesOutput {
  const input = object(value, "first principles output");
  const restated_belief = str(input.restated_belief, "restated_belief");
  const bedrock_summary = str(input.bedrock_summary, "bedrock_summary");

  if (!Array.isArray(input.nodes) || input.nodes.length < 3) {
    throw new Error("nodes must have at least 3 items");
  }
  if (input.nodes.length > 12) {
    throw new Error("nodes must have at most 12 items");
  }

  const validBasisTypes = new Set<string>(NODE_BASIS_TYPES);
  const claimSet = new Set<string>();

  const nodes = input.nodes.map((n: unknown, i: number) => {
    const row = object(n, `nodes[${i}]`);
    const claim = str(row.claim, `nodes[${i}].claim`);
    const basis_type = str(row.basis_type, `nodes[${i}].basis_type`);
    if (!validBasisTypes.has(basis_type)) {
      throw new Error(`nodes[${i}].basis_type "${basis_type}" is invalid`);
    }
    const depth = num(row.depth, `nodes[${i}].depth`);
    if (depth < 1 || depth > 3) {
      throw new Error(`nodes[${i}].depth must be 1, 2, or 3`);
    }
    claimSet.add(claim);
    return {
      claim,
      basis_type: basis_type as NodeBasisType,
      basis_note: str(row.basis_note, `nodes[${i}].basis_note`),
      challenge: str(row.challenge, `nodes[${i}].challenge`),
      depth: depth as 1 | 2 | 3,
    };
  });

  if (!Array.isArray(input.weakest_links) || input.weakest_links.length === 0) {
    throw new Error("weakest_links must be a non-empty array");
  }
  const weakest_links = input.weakest_links.map((w: unknown, i: number) =>
    str(w, `weakest_links[${i}]`)
  );

  return { restated_belief, nodes, weakest_links, bedrock_summary };
}
