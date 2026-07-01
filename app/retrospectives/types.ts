export const DEFAULT_REFLECTION_CATEGORIES = [
  { key: "business", label: "事业", color: "zinc" },
  { key: "life", label: "生活维护", color: "stone" },
  { key: "relationship", label: "关系", color: "amber" },
  { key: "growth", label: "成长", color: "blue" },
  { key: "recovery", label: "恢复", color: "emerald" },
  { key: "gray", label: "灰色", color: "orange" },
  { key: "unknown", label: "未知", color: "slate" },
] as const;

export type ReflectionCategory = {
  key: string;
  label: string;
  color: string;
};

export const TIME_BASES = ["explicit", "approximate"] as const;
export type TimeBasis = (typeof TIME_BASES)[number];

export type DailyTimeBlock = {
  start_slot: number;
  end_slot: number;
  event: string;
  category_key: string;
  time_basis: TimeBasis;
  secondary_note?: string;
};

export type DailyTimeline = {
  blocks: DailyTimeBlock[];
  ambiguities: string[];
};

export type FullDaySlot = {
  slot: number;
  event: string;
  category_key: string;
  time_basis: TimeBasis | "unknown";
};

export const RETRO_GAP_CAUSES = [
  "judgment",
  "execution",
  "environment",
  "luck",
  "unknown",
] as const;
export type RetroGapCause = (typeof RETRO_GAP_CAUSES)[number];

export type WeeklyRetrospective = {
  expected: string[];
  actual: string[];
  gaps: {
    statement: string;
    cause: RetroGapCause;
    evidence_ids: string[];
  }[];
  hindsight_risks: string[];
  contradictions: string[];
  unknowns: string[];
  life_business_conflicts: string[];
  rule: string;
  commitment: string;
  prediction: { text: string; due_date: string };
};

export type RetrospectiveQuestions = {
  questions: string[];
  missing_evidence: string[];
  ready_to_finalize: boolean;
};

export type MonthlyRetrospective = {
  repeated_patterns: {
    pattern: string;
    evidence_ids: string[];
    counterexamples: string[];
  }[];
  invalidated_rules: string[];
  life_business_conflicts: string[];
  only_focus: string;
  rule_decision: {
    action: "keep" | "revise" | "retire";
    rule_id: string;
    text: string;
  };
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}必须是对象`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    throw new Error(`${label}必须是非空文本`);
  }
  return value.trim();
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label}必须是数组`);
  return value.map((item, index) => text(item, `${label}[${index}]`));
}

function ids(value: unknown, label: string): string[] {
  return Array.from(new Set(strings(value, label)));
}

function slot(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 48
  ) {
    throw new Error(`${label} slot必须是0到48之间的整数`);
  }
  return value;
}

export function parseDailyTimeline(value: unknown): DailyTimeline {
  const input = object(value, "每日时间轴");
  if (!Array.isArray(input.blocks)) throw new Error("blocks必须是数组");
  const blocks = input.blocks
    .map((item, index) => {
      const row = object(item, `blocks[${index}]`);
      const start = slot(row.start_slot, `blocks[${index}].start_slot`);
      const end = slot(row.end_slot, `blocks[${index}].end_slot`);
      if (start >= end) throw new Error(`blocks[${index}]结束时间必须晚于开始时间`);
      if (!TIME_BASES.includes(row.time_basis as TimeBasis)) {
        throw new Error(`blocks[${index}].time_basis无效`);
      }
      return {
        start_slot: start,
        end_slot: end,
        event: text(row.event, `blocks[${index}].event`),
        category_key: text(
          row.category_key,
          `blocks[${index}].category_key`
        ),
        time_basis: row.time_basis as TimeBasis,
        secondary_note:
          typeof row.secondary_note === "string" && row.secondary_note.trim()
            ? row.secondary_note.trim()
            : undefined,
      };
    })
    .sort((a, b) => a.start_slot - b.start_slot);
  for (let index = 1; index < blocks.length; index++) {
    if (blocks[index].start_slot < blocks[index - 1].end_slot) {
      throw new Error("主要活动时间块不能重叠");
    }
  }
  return {
    blocks,
    ambiguities:
      input.ambiguities == null ? [] : strings(input.ambiguities, "ambiguities"),
  };
}

export function buildFullDaySlots(blocks: DailyTimeBlock[]): FullDaySlot[] {
  const timeline = parseDailyTimeline({ blocks, ambiguities: [] });
  return Array.from({ length: 48 }, (_, slotIndex) => {
    const block = timeline.blocks.find(
      (item) => slotIndex >= item.start_slot && slotIndex < item.end_slot
    );
    return block
      ? {
          slot: slotIndex,
          event: block.event,
          category_key: block.category_key,
          time_basis: block.time_basis,
        }
      : {
          slot: slotIndex,
          event: "",
          category_key: "unknown",
          time_basis: "unknown",
        };
  });
}

export function applyGrayTimeRules(
  blocks: DailyTimeBlock[],
  keywords: string[]
): DailyTimeBlock[] {
  const rules = keywords
    .map((item) => item.trim().toLocaleLowerCase())
    .filter(Boolean);
  return blocks.map((block) => {
    const matches = rules.some((rule) =>
      block.event.toLocaleLowerCase().includes(rule)
    );
    return matches ? { ...block, category_key: "gray" } : block;
  });
}

export function normalizeAiTimelineCategories(
  blocks: DailyTimeBlock[],
  allowedCategoryKeys: string[]
): DailyTimeBlock[] {
  const allowed = new Set(allowedCategoryKeys);
  return blocks.map((block) => ({
    ...block,
    category_key:
      block.category_key !== "gray" && allowed.has(block.category_key)
        ? block.category_key
        : "unknown",
  }));
}

export function parseWeeklyRetrospective(
  value: unknown
): WeeklyRetrospective {
  const input = object(value, "周复盘");
  if (!Array.isArray(input.gaps)) throw new Error("gaps必须是数组");
  const prediction = object(input.prediction, "prediction");
  const dueDate = text(prediction.due_date, "prediction.due_date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    throw new Error("prediction.due_date必须是YYYY-MM-DD");
  }
  return {
    expected: strings(input.expected, "expected"),
    actual: strings(input.actual, "actual"),
    gaps: input.gaps.map((item, index) => {
      const row = object(item, `gaps[${index}]`);
      if (!RETRO_GAP_CAUSES.includes(row.cause as RetroGapCause)) {
        throw new Error(`gaps[${index}].cause无效`);
      }
      return {
        statement: text(row.statement, `gaps[${index}].statement`),
        cause: row.cause as RetroGapCause,
        evidence_ids: ids(
          row.evidence_ids,
          `gaps[${index}].evidence_ids`
        ),
      };
    }),
    hindsight_risks: strings(input.hindsight_risks, "hindsight_risks"),
    contradictions: strings(input.contradictions, "contradictions"),
    unknowns: strings(input.unknowns, "unknowns"),
    life_business_conflicts: strings(
      input.life_business_conflicts,
      "life_business_conflicts"
    ),
    rule: text(input.rule, "rule"),
    commitment: text(input.commitment, "commitment"),
    prediction: {
      text: text(prediction.text, "prediction.text"),
      due_date: dueDate,
    },
  };
}

export function parseRetrospectiveQuestions(
  value: unknown
): RetrospectiveQuestions {
  const input = object(value, "复盘追问");
  const questions = strings(input.questions, "questions");
  if (questions.length < 1 || questions.length > 3) {
    throw new Error("questions必须包含1到3个问题");
  }
  if (typeof input.ready_to_finalize !== "boolean") {
    throw new Error("ready_to_finalize必须是布尔值");
  }
  return {
    questions,
    missing_evidence: strings(input.missing_evidence, "missing_evidence"),
    ready_to_finalize: input.ready_to_finalize,
  };
}

export function parseMonthlyRetrospective(
  value: unknown
): MonthlyRetrospective {
  const input = object(value, "月复盘");
  if (!Array.isArray(input.repeated_patterns)) {
    throw new Error("repeated_patterns必须是数组");
  }
  const decision = object(input.rule_decision, "rule_decision");
  if (
    decision.action !== "keep" &&
    decision.action !== "revise" &&
    decision.action !== "retire"
  ) {
    throw new Error("rule_decision.action无效");
  }
  return {
    repeated_patterns: input.repeated_patterns.map((item, index) => {
      const row = object(item, `repeated_patterns[${index}]`);
      return {
        pattern: text(row.pattern, `repeated_patterns[${index}].pattern`),
        evidence_ids: ids(
          row.evidence_ids,
          `repeated_patterns[${index}].evidence_ids`
        ),
        counterexamples: strings(
          row.counterexamples,
          `repeated_patterns[${index}].counterexamples`
        ),
      };
    }),
    invalidated_rules: strings(input.invalidated_rules, "invalidated_rules"),
    life_business_conflicts: strings(
      input.life_business_conflicts,
      "life_business_conflicts"
    ),
    only_focus: text(input.only_focus, "only_focus"),
    rule_decision: {
      action: decision.action,
      rule_id: text(decision.rule_id, "rule_decision.rule_id", true),
      text: text(decision.text, "rule_decision.text"),
    },
  };
}

export function validateRetroCitations(
  citedIds: string[],
  allowedIds: string[]
): void {
  const allowed = new Set(allowedIds);
  const invalid = citedIds.find((id) => !allowed.has(id));
  if (invalid) throw new Error(`引用了当前周期之外的证据：${invalid}`);
}

export function validatePredictionDueDate(
  dueDate: string,
  periodEnd: string
): void {
  const due = parseDateOnly(dueDate);
  const end = parseDateOnly(periodEnd);
  if (due.getTime() <= end.getTime()) {
    throw new Error("预测到期日必须晚于本次复盘周期");
  }
}

export function slotLabel(slotIndex: number): string {
  const hour = Math.floor(slotIndex / 2);
  const minute = slotIndex % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("日期格式无效");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("日期格式无效");
  return date;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function getWeeklyPeriod(
  date: string,
  reviewWeekday: number
): { start: string; end: string } {
  if (!Number.isInteger(reviewWeekday) || reviewWeekday < 0 || reviewWeekday > 6) {
    throw new Error("复盘星期必须是0到6");
  }
  const current = parseDateOnly(date);
  const daysUntilEnd = (reviewWeekday - current.getUTCDay() + 7) % 7;
  const end = new Date(current);
  end.setUTCDate(end.getUTCDate() + daysUntilEnd);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return { start: dateOnly(start), end: dateOnly(end) };
}

export function getMonthlyPeriod(date: string): {
  start: string;
  end: string;
} {
  const current = parseDateOnly(date);
  const start = new Date(
    Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1)
  );
  const end = new Date(
    Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0)
  );
  return { start: dateOnly(start), end: dateOnly(end) };
}

export function getMonthlyReviewDate(
  date: string,
  reviewWeekday: number
): string {
  if (!Number.isInteger(reviewWeekday) || reviewWeekday < 0 || reviewWeekday > 6) {
    throw new Error("复盘星期必须是0到6");
  }
  const period = getMonthlyPeriod(date);
  const end = parseDateOnly(period.end);
  const daysBack = (end.getUTCDay() - reviewWeekday + 7) % 7;
  end.setUTCDate(end.getUTCDate() - daysBack);
  return dateOnly(end);
}
