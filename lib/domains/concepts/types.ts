export const CENTRAL_QUESTION_TYPES = [
  "whole",
  "subjective",
  "ideal",
  "verb",
  "destruction",
  "purpose",
  "altruistic",
  "freedom",
] as const;
export type CentralQuestionType = (typeof CENTRAL_QUESTION_TYPES)[number];

export type CentralQuestionCandidate = {
  type: CentralQuestionType;
  question: string;
  opens_space: string;
  decision_impact: string;
};

export type CentralQuestions = {
  candidates: CentralQuestionCandidate[];
};

export type EvidenceCompetitor = {
  name: string;
  weakness: string;
  evidence_ids: string[];
};

export type InsightStory = {
  conflict: {
    desire_a: string;
    desire_b: string;
    evidence_ids: string[];
  };
  competitors: {
    time: EvidenceCompetitor[];
    job: EvidenceCompetitor[];
    category: EvidenceCompetitor[];
  };
  overlooked_gap: string;
  evidence_ids: string[];
};

export type ConceptStoryType = "insight" | "vision" | "integrated";

export type ConceptCandidate = {
  story_type: ConceptStoryType;
  one_line: string;
  serves_whom: string;
  change: string;
  difference: string;
  give_up: string;
  customer_evidence_ids: string[];
  company_fact_ids: string[];
  dream_version_id: string;
};

export type ConceptCandidates = { candidates: ConceptCandidate[] };

export type VisionStory = {
  dream_version_id: string;
  current_world: string;
  future_world: string;
  desired_change: string;
  meaning: string;
  source_ids: string[];
};

export type CompanyBenefit = {
  fact_id: string;
  fact: string;
  general_benefit: string;
  customer_benefit: string;
};

export type ConceptSynthesis = {
  benefit_chain: CompanyBenefit[];
  candidates: ConceptCandidate[];
};

export type ConceptDelta = {
  supported: string[];
  overturned: string[];
  changed_vision: string[];
  changed_difference: string[];
  changed_give_up: string[];
  new_gaps: string[];
  change_reason: string;
};

export type LandingPageConcept = {
  headline: string;
  subheadline: string;
  reasons_to_believe: { text: string; source_ids: string[] }[];
  cta: string;
};

export type ActionValue = {
  conflict: string;
  prefer: string;
  over: string;
  statement: string;
  cost: string;
  counterexample: string;
};

export type ActionValues = { values: ActionValue[] };

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
  return Array.from(
    new Set(
      value.map((item, index) =>
        stringValue(item, `${label}[${index}]`)
      )
    )
  );
}

export function parseCentralQuestions(value: unknown): CentralQuestions {
  const input = object(value, "Central Question候选");
  if (!Array.isArray(input.candidates) || input.candidates.length !== 8) {
    throw new Error("Central Question必须包含8类候选");
  }
  const seen = new Set<string>();
  const candidates = input.candidates.map((item, index) => {
    const row = object(item, `candidates[${index}]`);
    const type = stringValue(
      row.type,
      `candidates[${index}].type`
    ) as CentralQuestionType;
    if (!CENTRAL_QUESTION_TYPES.includes(type) || seen.has(type)) {
      throw new Error(`candidates[${index}].type无效或重复`);
    }
    seen.add(type);
    return {
      type,
      question: stringValue(
        row.question,
        `candidates[${index}].question`
      ),
      opens_space: stringValue(
        row.opens_space,
        `candidates[${index}].opens_space`
      ),
      decision_impact: stringValue(
        row.decision_impact,
        `candidates[${index}].decision_impact`
      ),
    };
  });
  return { candidates };
}

export function selectCentralQuestion(
  candidates: CentralQuestionCandidate[],
  type: CentralQuestionType,
  rewrittenQuestion?: string
): { type: CentralQuestionType; question: string } {
  const candidate = candidates.find((item) => item.type === type);
  if (!candidate) throw new Error("选择的Central Question不存在");
  return {
    type,
    question:
      rewrittenQuestion && rewrittenQuestion.trim()
        ? rewrittenQuestion.trim()
        : candidate.question,
  };
}

function parseCompetitors(
  value: unknown,
  label: string
): EvidenceCompetitor[] {
  if (!Array.isArray(value)) throw new Error(`${label}必须是数组`);
  return value.map((item, index) => {
    const row = object(item, `${label}[${index}]`);
    return {
      name: stringValue(row.name, `${label}[${index}].name`),
      weakness: stringValue(row.weakness, `${label}[${index}].weakness`),
      evidence_ids: strings(
        row.evidence_ids,
        `${label}[${index}].evidence_ids`
      ),
    };
  });
}

export function parseInsightStory(value: unknown): InsightStory {
  const input = object(value, "顾客洞察故事");
  const conflict = object(input.conflict, "conflict");
  const competitors = object(input.competitors, "competitors");
  return {
    conflict: {
      desire_a: stringValue(conflict.desire_a, "conflict.desire_a"),
      desire_b: stringValue(conflict.desire_b, "conflict.desire_b"),
      evidence_ids: strings(
        conflict.evidence_ids,
        "conflict.evidence_ids"
      ),
    },
    competitors: {
      time: parseCompetitors(competitors.time, "competitors.time"),
      job: parseCompetitors(competitors.job, "competitors.job"),
      category: parseCompetitors(
        competitors.category,
        "competitors.category"
      ),
    },
    overlooked_gap: stringValue(input.overlooked_gap, "overlooked_gap"),
    evidence_ids: strings(input.evidence_ids, "evidence_ids"),
  };
}

export function validateConceptCitations(
  citedIds: string[],
  allowedIds: string[]
): void {
  const allowed = new Set(allowedIds);
  const invalid = citedIds.find((id) => !allowed.has(id));
  if (invalid) throw new Error(`引用了不属于当前概念的证据：${invalid}`);
}

export function parseConceptCandidates(value: unknown): ConceptCandidates {
  const input = object(value, "概念候选");
  if (!Array.isArray(input.candidates)) throw new Error("candidates必须是数组");
  if (input.candidates.length < 1 || input.candidates.length > 3) {
    throw new Error("概念候选最多3条且至少1条");
  }
  return {
    candidates: input.candidates.map((item, index) => {
      const row = object(item, `candidates[${index}]`);
      if (
        row.story_type !== "insight" &&
        row.story_type !== "vision" &&
        row.story_type !== "integrated"
      ) {
        throw new Error(`candidates[${index}].story_type无效`);
      }
      return {
        story_type: row.story_type,
        one_line: stringValue(
          row.one_line,
          `candidates[${index}].one_line`
        ),
        serves_whom: stringValue(
          row.serves_whom,
          `candidates[${index}].serves_whom`
        ),
        change: stringValue(row.change, `candidates[${index}].change`),
        difference: stringValue(
          row.difference,
          `candidates[${index}].difference`
        ),
        give_up: stringValue(
          row.give_up,
          `candidates[${index}].give_up`
        ),
        customer_evidence_ids: strings(
          row.customer_evidence_ids,
          `candidates[${index}].customer_evidence_ids`
        ),
        company_fact_ids: strings(
          row.company_fact_ids,
          `candidates[${index}].company_fact_ids`
        ),
        dream_version_id: stringValue(
          row.dream_version_id,
          `candidates[${index}].dream_version_id`,
          true
        ),
      };
    }),
  };
}

export function parseVisionStory(value: unknown): VisionStory {
  const input = object(value, "愿景型故事");
  return {
    dream_version_id: stringValue(
      input.dream_version_id,
      "dream_version_id"
    ),
    current_world: stringValue(input.current_world, "current_world"),
    future_world: stringValue(input.future_world, "future_world"),
    desired_change: stringValue(input.desired_change, "desired_change"),
    meaning: stringValue(input.meaning, "meaning"),
    source_ids: strings(input.source_ids, "source_ids"),
  };
}

export function parseConceptSynthesis(value: unknown): ConceptSynthesis {
  const input = object(value, "价值设计合成");
  if (!Array.isArray(input.benefit_chain)) {
    throw new Error("benefit_chain必须是数组");
  }
  return {
    benefit_chain: input.benefit_chain.map((item, index) => {
      const row = object(item, `benefit_chain[${index}]`);
      return {
        fact_id: stringValue(
          row.fact_id,
          `benefit_chain[${index}].fact_id`
        ),
        fact: stringValue(row.fact, `benefit_chain[${index}].fact`),
        general_benefit: stringValue(
          row.general_benefit,
          `benefit_chain[${index}].general_benefit`
        ),
        customer_benefit: stringValue(
          row.customer_benefit,
          `benefit_chain[${index}].customer_benefit`
        ),
      };
    }),
    candidates: parseConceptCandidates({
      candidates: input.candidates,
    }).candidates,
  };
}

export function parseConceptDelta(value: unknown): ConceptDelta {
  const input = object(value, "概念版本差异");
  return {
    supported: strings(input.supported, "supported"),
    overturned: strings(input.overturned, "overturned"),
    changed_vision: strings(input.changed_vision, "changed_vision"),
    changed_difference: strings(
      input.changed_difference,
      "changed_difference"
    ),
    changed_give_up: strings(input.changed_give_up, "changed_give_up"),
    new_gaps: strings(input.new_gaps, "new_gaps"),
    change_reason: stringValue(
      input.change_reason,
      "change_reason",
      true
    ),
  };
}

export function evaluateConceptConfirmation(input: {
  keptMaterialIds: string[];
  hasCustomerConclusion: boolean;
  companyFactIds: string[];
  centralQuestion: string;
}): { canConfirm: boolean; missing: string[] } {
  const missing: string[] = [];
  if (new Set(input.keptMaterialIds).size < 3) {
    missing.push("至少3份独立顾客材料");
  }
  if (!input.hasCustomerConclusion) missing.push("一份顾客研究结论");
  if (new Set(input.companyFactIds).size < 1) {
    missing.push("至少一条公司事实");
  }
  if (!input.centralQuestion.trim()) missing.push("一个Central Question");
  return { canConfirm: missing.length === 0, missing };
}

export function stripBayesianPercentages(value: unknown): {
  question: string;
  evidence: { text: string; explanation: string }[];
} {
  const input = object(value, "贝叶斯信念");
  const updates = Array.isArray(input.updates) ? input.updates : [];
  return {
    question: stringValue(input.question, "question"),
    evidence: updates.map((item, index) => {
      const row = object(item, `updates[${index}]`);
      return {
        text: stringValue(
          row.evidence_text,
          `updates[${index}].evidence_text`
        ),
        explanation: stringValue(
          row.ai_explanation,
          `updates[${index}].ai_explanation`
        ),
      };
    }),
  };
}

export function parseLandingPageConcept(
  value: unknown
): LandingPageConcept {
  const input = object(value, "落地页概念");
  if (
    !Array.isArray(input.reasons_to_believe) ||
    input.reasons_to_believe.length !== 3
  ) {
    throw new Error("reasons_to_believe必须恰好3条");
  }
  return {
    headline: stringValue(input.headline, "headline"),
    subheadline: stringValue(input.subheadline, "subheadline"),
    reasons_to_believe: input.reasons_to_believe.map((item, index) => {
      const row = object(item, `reasons_to_believe[${index}]`);
      return {
        text: stringValue(
          row.text,
          `reasons_to_believe[${index}].text`
        ),
        source_ids: strings(
          row.source_ids,
          `reasons_to_believe[${index}].source_ids`
        ),
      };
    }),
    cta: stringValue(input.cta, "cta"),
  };
}

export function parseActionValues(value: unknown): ActionValues {
  const input = object(value, "行动价值观");
  if (!Array.isArray(input.values)) throw new Error("values必须是数组");
  if (input.values.length < 1 || input.values.length > 3) {
    throw new Error("行动价值观最多3条且至少1条");
  }
  return {
    values: input.values.map((item, index) => {
      const row = object(item, `values[${index}]`);
      const statement = stringValue(
        row.statement,
        `values[${index}].statement`
      );
      if (
        !statement.startsWith("当") ||
        !statement.includes("冲突时") ||
        !statement.includes("优先选择")
      ) {
        throw new Error(
          `values[${index}].statement必须使用“当X与Y冲突时，优先选择X”`
        );
      }
      return {
        conflict: stringValue(row.conflict, `values[${index}].conflict`),
        prefer: stringValue(row.prefer, `values[${index}].prefer`),
        over: stringValue(row.over, `values[${index}].over`),
        statement,
        cost: stringValue(row.cost, `values[${index}].cost`),
        counterexample: stringValue(
          row.counterexample,
          `values[${index}].counterexample`
        ),
      };
    }),
  };
}
