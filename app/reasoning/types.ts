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
