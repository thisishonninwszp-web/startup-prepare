export const CUSTOMER_MARKETS = ["cn", "jp", "en"] as const;
export type CustomerMarket = (typeof CUSTOMER_MARKETS)[number];

export const CUSTOMER_MATERIAL_ORIGINS = [
  "web",
  "interview",
  "chat",
  "review",
  "url",
] as const;
export type CustomerMaterialOrigin =
  (typeof CUSTOMER_MATERIAL_ORIGINS)[number];

export const CUSTOMER_REVIEW_STATUSES = [
  "candidate",
  "kept",
  "excluded",
] as const;
export type CustomerReviewStatus =
  (typeof CUSTOMER_REVIEW_STATUSES)[number];

export const EMOTION_BASES = ["stated", "inferred", "unknown"] as const;
export type EmotionBasis = (typeof EMOTION_BASES)[number];

export const CUSTOMER_CADENCES = ["daily", "weekly"] as const;
export type CustomerCadence = (typeof CUSTOMER_CADENCES)[number];

export type CustomerEvidenceAtom = {
  id?: string;
  material_id: string;
  quote: string;
  scene: string;
  behavior: string;
  alternative: string;
  tradeoff: string;
  emotion: string;
  emotion_basis: EmotionBasis;
};

export type CustomerEvidenceBatch = {
  atoms: CustomerEvidenceAtom[];
};

export type CustomerSegment = {
  key: string;
  label: string;
  situation: string;
  behaviors: string[];
  evidence_ids: string[];
  unknowns: string[];
};

export type CustomerSegments = { segments: CustomerSegment[] };

export type CustomerDayMoment = {
  time: string;
  scene: string;
  action: string;
  inner_voice: string;
  emotion: string;
  emotion_basis: EmotionBasis;
  tradeoff: string;
  evidence_ids: string[];
};

export type CustomerBarrierMap = {
  time: string[];
  money: string[];
  learning: string[];
  trust: string[];
  identity: string[];
  risk: string[];
};

export type CustomerProxy = {
  segment_key: string;
  who: string;
  is_provisional: boolean;
  day: CustomerDayMoment[];
  current_alternatives: string[];
  desired_progress: string[];
  switching_barriers: CustomerBarrierMap;
  own_words: { quote: string; evidence_id: string }[];
  unknowns: string[];
};

export type CustomerProxyAnswer = {
  answer: string;
  evidence_ids: string[];
  inference: string;
  unknowns: string[];
};

export type CustomerIdeaReaction = {
  first_reaction: string;
  reasons_to_refuse: string[];
  old_solution_inertia: string[];
  trust_gaps: string[];
  payment_barriers: string[];
  evidence_ids: string[];
  inference: string;
  unknowns: string[];
};

export type CustomerProxyDelta = {
  supported: string[];
  overturned: string[];
  new_unknowns: string[];
  changed_context: string[];
  reason: string;
};

export type CustomerPattern = {
  label: string;
  situation: string;
  behaviors: string[];
  barriers: string[];
  evidence_ids: string[];
  counterexamples: string[];
};

export type CustomerPatternReport = {
  patterns: CustomerPattern[];
  unknowns: string[];
};

export type CustomerOpportunity = {
  customer_progress: string;
  current_alternative: string;
  direction: string;
  evidence_ids: string[];
  evidence_gaps: string[];
  fatal_assumption: string;
};

export type CustomerOpportunities = {
  opportunities: CustomerOpportunity[];
};

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}必须是对象`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    throw new Error(`${label}必须是非空文本`);
  }
  return value.trim();
}

function asStrings(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label}必须是数组`);
  return value.map((item, index) => asString(item, `${label}[${index}]`));
}

function asEmotionBasis(value: unknown, label: string): EmotionBasis {
  if (value !== "stated" && value !== "inferred" && value !== "unknown") {
    throw new Error(`${label}.emotion_basis无效`);
  }
  return value;
}

function asIds(value: unknown, label: string): string[] {
  return Array.from(new Set(asStrings(value, label)));
}

export function parseCustomerEvidenceBatch(
  value: unknown
): CustomerEvidenceBatch {
  const input = asObject(value, "证据批次");
  if (!Array.isArray(input.atoms)) throw new Error("atoms必须是数组");
  return {
    atoms: input.atoms.map((item, index) => {
      const row = asObject(item, `atoms[${index}]`);
      return {
        material_id: asString(row.material_id, `atoms[${index}].material_id`),
        quote: asString(row.quote, `atoms[${index}].quote`),
        scene: asString(row.scene, `atoms[${index}].scene`, true),
        behavior: asString(row.behavior, `atoms[${index}].behavior`, true),
        alternative: asString(
          row.alternative,
          `atoms[${index}].alternative`,
          true
        ),
        tradeoff: asString(row.tradeoff, `atoms[${index}].tradeoff`, true),
        emotion: asString(row.emotion, `atoms[${index}].emotion`, true),
        emotion_basis: asEmotionBasis(
          row.emotion_basis,
          `atoms[${index}]`
        ),
      };
    }),
  };
}

export function parseCustomerSegments(value: unknown): CustomerSegments {
  const input = asObject(value, "顾客类型");
  if (!Array.isArray(input.segments)) throw new Error("segments必须是数组");
  if (input.segments.length < 2 || input.segments.length > 3) {
    throw new Error("segments必须包含2到3类顾客声音");
  }
  return {
    segments: input.segments.map((item, index) => {
      const row = asObject(item, `segments[${index}]`);
      return {
        key: asString(row.key, `segments[${index}].key`),
        label: asString(row.label, `segments[${index}].label`),
        situation: asString(row.situation, `segments[${index}].situation`),
        behaviors: asStrings(row.behaviors, `segments[${index}].behaviors`),
        evidence_ids: asIds(
          row.evidence_ids,
          `segments[${index}].evidence_ids`
        ),
        unknowns: asStrings(row.unknowns, `segments[${index}].unknowns`),
      };
    }),
  };
}

function parseBarrierMap(value: unknown): CustomerBarrierMap {
  const row = asObject(value, "switching_barriers");
  return {
    time: asStrings(row.time, "switching_barriers.time"),
    money: asStrings(row.money, "switching_barriers.money"),
    learning: asStrings(row.learning, "switching_barriers.learning"),
    trust: asStrings(row.trust, "switching_barriers.trust"),
    identity: asStrings(row.identity, "switching_barriers.identity"),
    risk: asStrings(row.risk, "switching_barriers.risk"),
  };
}

export function parseCustomerProxy(value: unknown): CustomerProxy {
  const input = asObject(value, "顾客代理");
  if (!Array.isArray(input.day)) throw new Error("day必须是数组");
  if (!Array.isArray(input.own_words)) throw new Error("own_words必须是数组");
  if (typeof input.is_provisional !== "boolean") {
    throw new Error("is_provisional必须是布尔值");
  }
  return {
    segment_key: asString(input.segment_key, "segment_key"),
    who: asString(input.who, "who"),
    is_provisional: input.is_provisional,
    day: input.day.map((item, index) => {
      const row = asObject(item, `day[${index}]`);
      return {
        time: asString(row.time, `day[${index}].time`),
        scene: asString(row.scene, `day[${index}].scene`),
        action: asString(row.action, `day[${index}].action`),
        inner_voice: asString(
          row.inner_voice,
          `day[${index}].inner_voice`
        ),
        emotion: asString(row.emotion, `day[${index}].emotion`, true),
        emotion_basis: asEmotionBasis(row.emotion_basis, `day[${index}]`),
        tradeoff: asString(row.tradeoff, `day[${index}].tradeoff`, true),
        evidence_ids: asIds(
          row.evidence_ids,
          `day[${index}].evidence_ids`
        ),
      };
    }),
    current_alternatives: asStrings(
      input.current_alternatives,
      "current_alternatives"
    ),
    desired_progress: asStrings(input.desired_progress, "desired_progress"),
    switching_barriers: parseBarrierMap(input.switching_barriers),
    own_words: input.own_words.map((item, index) => {
      const row = asObject(item, `own_words[${index}]`);
      return {
        quote: asString(row.quote, `own_words[${index}].quote`),
        evidence_id: asString(
          row.evidence_id,
          `own_words[${index}].evidence_id`
        ),
      };
    }),
    unknowns: asStrings(input.unknowns, "unknowns"),
  };
}

export function parseCustomerProxyAnswer(
  value: unknown
): CustomerProxyAnswer {
  const input = asObject(value, "顾客代理回答");
  return {
    answer: asString(input.answer, "answer"),
    evidence_ids: asIds(input.evidence_ids, "evidence_ids"),
    inference: asString(input.inference, "inference", true),
    unknowns: asStrings(input.unknowns, "unknowns"),
  };
}

export function parseCustomerIdeaReaction(
  value: unknown
): CustomerIdeaReaction {
  const input = asObject(value, "想法反应");
  return {
    first_reaction: asString(input.first_reaction, "first_reaction"),
    reasons_to_refuse: asStrings(input.reasons_to_refuse, "reasons_to_refuse"),
    old_solution_inertia: asStrings(
      input.old_solution_inertia,
      "old_solution_inertia"
    ),
    trust_gaps: asStrings(input.trust_gaps, "trust_gaps"),
    payment_barriers: asStrings(input.payment_barriers, "payment_barriers"),
    evidence_ids: asIds(input.evidence_ids, "evidence_ids"),
    inference: asString(input.inference, "inference", true),
    unknowns: asStrings(input.unknowns, "unknowns"),
  };
}

export function parseCustomerProxyDelta(
  value: unknown
): CustomerProxyDelta {
  const input = asObject(value, "代理差异");
  return {
    supported: asStrings(input.supported, "supported"),
    overturned: asStrings(input.overturned, "overturned"),
    new_unknowns: asStrings(input.new_unknowns, "new_unknowns"),
    changed_context: asStrings(input.changed_context, "changed_context"),
    reason: asString(input.reason, "reason", true),
  };
}

export function parseCustomerPatternReport(
  value: unknown
): CustomerPatternReport {
  const input = asObject(value, "模式报告");
  if (!Array.isArray(input.patterns)) throw new Error("patterns必须是数组");
  return {
    patterns: input.patterns.map((item, index) => {
      const row = asObject(item, `patterns[${index}]`);
      return {
        label: asString(row.label, `patterns[${index}].label`),
        situation: asString(row.situation, `patterns[${index}].situation`),
        behaviors: asStrings(row.behaviors, `patterns[${index}].behaviors`),
        barriers: asStrings(row.barriers, `patterns[${index}].barriers`),
        evidence_ids: asIds(
          row.evidence_ids,
          `patterns[${index}].evidence_ids`
        ),
        counterexamples: asStrings(
          row.counterexamples,
          `patterns[${index}].counterexamples`
        ),
      };
    }),
    unknowns: asStrings(input.unknowns, "unknowns"),
  };
}

export function parseCustomerOpportunities(
  value: unknown
): CustomerOpportunities {
  const input = asObject(value, "候选机会");
  if (!Array.isArray(input.opportunities)) {
    throw new Error("opportunities必须是数组");
  }
  if (input.opportunities.length > 3) throw new Error("候选机会最多3条");
  return {
    opportunities: input.opportunities.map((item, index) => {
      const row = asObject(item, `opportunities[${index}]`);
      return {
        customer_progress: asString(
          row.customer_progress,
          `opportunities[${index}].customer_progress`
        ),
        current_alternative: asString(
          row.current_alternative,
          `opportunities[${index}].current_alternative`
        ),
        direction: asString(
          row.direction,
          `opportunities[${index}].direction`
        ),
        evidence_ids: asIds(
          row.evidence_ids,
          `opportunities[${index}].evidence_ids`
        ),
        evidence_gaps: asStrings(
          row.evidence_gaps,
          `opportunities[${index}].evidence_gaps`
        ),
        fatal_assumption: asString(
          row.fatal_assumption,
          `opportunities[${index}].fatal_assumption`
        ),
      };
    }),
  };
}

export function validateCustomerCitations(
  citationIds: string[],
  allowedIds: string[]
): void {
  const allowed = new Set(allowedIds);
  const invalid = citationIds.find((id) => !allowed.has(id));
  if (invalid) throw new Error(`引用了未被允许的证据：${invalid}`);
}

export function collectProxyCitationIds(proxy: CustomerProxy): string[] {
  return Array.from(
    new Set([
      ...proxy.day.flatMap((moment) => moment.evidence_ids),
      ...proxy.own_words.map((word) => word.evidence_id),
    ])
  );
}

export function isProvisionalProxy(materialIds: string[]): boolean {
  return new Set(materialIds).size < 3;
}

export function filterEvidenceForSegment(
  atoms: CustomerEvidenceAtom[],
  segment: CustomerSegment
): CustomerEvidenceAtom[] {
  const allowed = new Set(segment.evidence_ids);
  return atoms.filter((atom) => atom.id && allowed.has(atom.id));
}

export function nextCustomerRun(
  cadence: CustomerCadence,
  from = new Date()
): Date {
  const next = new Date(from);
  next.setUTCDate(next.getUTCDate() + (cadence === "daily" ? 1 : 7));
  return next;
}
