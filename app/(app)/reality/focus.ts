import type { RealityMap } from "./types";

export const FOCUS_MAX_TURNS = 3;

export const REALITY_FOCUS_ANCHOR_TYPES = [
  "topic",
  "emotion",
  "fact",
  "interpretation",
  "unknown",
  "constraint_fixed",
  "constraint_influenceable",
  "constraint_actionable",
  "contradiction",
  "path",
] as const;

export type RealityFocusAnchorType =
  (typeof REALITY_FOCUS_ANCHOR_TYPES)[number];

export type RealityFocusLocator = {
  type: RealityFocusAnchorType;
  index: number;
};

export type RealityFocusAnchor = RealityFocusLocator & {
  label: string;
  text: string;
  snapshot: unknown;
};

export type RealityFocusOption = {
  title: string;
  when_it_fits: string;
  tradeoff: string;
  small_try: string;
};

export type RealityFocusSummary = {
  updated_understanding: string;
  remaining_unknown: string;
  option_tradeoffs: string[];
  candidate_action: string;
  user_grounded: string[];
  ai_inferences: string[];
};

export type RealityFocusResponse = {
  explicit_content: string[];
  ai_inferences: string[];
  unknowns: string[];
  response_options: RealityFocusOption[];
  follow_up_question: string | null;
  is_final: boolean;
  summary: RealityFocusSummary | null;
  safety_state: "normal";
};

export type RealityFocusMessage = {
  id: string;
  role: "user" | "assistant" | "safety";
  turn_no: number;
  client_key: string | null;
  content: unknown;
  created_at: string;
};

export type RealityFocusSession = {
  id: string;
  case_id: string;
  version_id: string;
  anchor: RealityFocusAnchor;
  status: "open" | "completed" | "safety_stopped";
  summary: RealityFocusSummary | null;
  include_in_closure: boolean;
  include_in_next_version: boolean;
  created_at: string;
  updated_at: string;
  messages: RealityFocusMessage[];
};

function anchorItem<T>(
  items: T[],
  locator: RealityFocusLocator,
  label: string,
  text: (item: T) => string
): RealityFocusAnchor {
  const item = items[locator.index];
  if (item === undefined) throw new Error("地图锚点不存在");
  return {
    ...locator,
    label,
    text: text(item),
    snapshot: item,
  };
}

export function resolveRealityFocusAnchor(
  map: RealityMap,
  locator: RealityFocusLocator
): RealityFocusAnchor {
  if (!Number.isInteger(locator.index) || locator.index < 0) {
    throw new Error("地图锚点位置无效");
  }
  switch (locator.type) {
    case "topic":
      if (locator.index !== 0) throw new Error("地图锚点不存在");
      return {
        ...locator,
        label: "当前课题",
        text: map.topic,
        snapshot: map.topic,
      };
    case "emotion":
      return anchorItem(
        map.emotions,
        locator,
        "情绪、触发与判断影响",
        (item) =>
          `${item.feeling}｜触发：${item.trigger}｜对判断的影响：${item.judgment_impact}`
      );
    case "fact":
      return anchorItem(
        map.facts,
        locator,
        "已确认事实",
        (item) => `${item.statement}｜来源：${item.source}`
      );
    case "interpretation":
      return anchorItem(map.interpretations, locator, "解释与假设", String);
    case "unknown":
      return anchorItem(map.unknowns, locator, "未知与信息缺口", String);
    case "constraint_fixed":
      return anchorItem(
        map.constraints.fixed,
        locator,
        "固定约束",
        String
      );
    case "constraint_influenceable":
      return anchorItem(
        map.constraints.influenceable,
        locator,
        "可以影响",
        String
      );
    case "constraint_actionable":
      return anchorItem(
        map.constraints.actionable_now,
        locator,
        "现在可行动",
        String
      );
    case "contradiction":
      return anchorItem(map.contradictions, locator, "矛盾与盲区", String);
    case "path":
      return anchorItem(
        map.paths,
        locator,
        "初步方向",
        (item) =>
          `${item.title}｜理由：${item.rationale}｜动作：${item.action}｜风险：${item.risk}`
      );
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}格式无效`);
  }
  return value as Record<string, unknown>;
}

const PROHIBITED = /成功率|胜率|评分|分数|星级|诊断|抑郁症|焦虑症|双相|人格障碍/;

function text(value: unknown, label: string, max = 2000): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label}不能为空`);
  }
  const result = value.trim();
  if (result.length > max) throw new Error(`${label}过长`);
  if (PROHIBITED.test(result)) throw new Error(`${label}包含禁止内容`);
  return result;
}

function textArray(
  value: unknown,
  label: string,
  options: { min?: number; max?: number } = {}
): string[] {
  if (!Array.isArray(value)) throw new Error(`${label}必须是数组`);
  const min = options.min ?? 0;
  const max = options.max ?? 10;
  if (value.length < min || value.length > max) {
    throw new Error(`${label}数量无效`);
  }
  return value.map((item, index) => text(item, `${label}[${index}]`));
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string
) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label}包含未知字段：${key}`);
  }
}

function parseSummary(value: unknown): RealityFocusSummary {
  const input = record(value, "summary");
  assertOnlyKeys(
    input,
    [
      "updated_understanding",
      "remaining_unknown",
      "option_tradeoffs",
      "candidate_action",
      "user_grounded",
      "ai_inferences",
    ],
    "summary"
  );
  return {
    updated_understanding: text(
      input.updated_understanding,
      "updated_understanding"
    ),
    remaining_unknown: text(input.remaining_unknown, "remaining_unknown"),
    option_tradeoffs: textArray(
      input.option_tradeoffs,
      "option_tradeoffs",
      { min: 1, max: 3 }
    ),
    candidate_action: text(input.candidate_action, "candidate_action"),
    user_grounded: textArray(input.user_grounded, "user_grounded", {
      min: 1,
      max: 5,
    }),
    ai_inferences: textArray(input.ai_inferences, "summary.ai_inferences", {
      max: 2,
    }),
  };
}

export function parseRealityFocusResponse(
  value: unknown
): RealityFocusResponse {
  const input = record(value, "focused response");
  assertOnlyKeys(
    input,
    [
      "explicit_content",
      "ai_inferences",
      "unknowns",
      "response_options",
      "follow_up_question",
      "is_final",
      "summary",
      "safety_state",
    ],
    "focused response"
  );
  if (input.safety_state !== "normal") {
    throw new Error("safety_state格式无效");
  }
  if (!Array.isArray(input.response_options)) {
    throw new Error("response_options必须是数组");
  }
  if (
    input.response_options.length < 2 ||
    input.response_options.length > 3
  ) {
    throw new Error("response_options数量必须是2到3");
  }
  const responseOptions = input.response_options.map((item, index) => {
    const option = record(item, `response_options[${index}]`);
    assertOnlyKeys(
      option,
      ["title", "when_it_fits", "tradeoff", "small_try"],
      `response_options[${index}]`
    );
    return {
      title: text(option.title, `response_options[${index}].title`),
      when_it_fits: text(
        option.when_it_fits,
        `response_options[${index}].when_it_fits`
      ),
      tradeoff: text(
        option.tradeoff,
        `response_options[${index}].tradeoff`
      ),
      small_try: text(
        option.small_try,
        `response_options[${index}].small_try`
      ),
    };
  });
  if (typeof input.is_final !== "boolean") {
    throw new Error("is_final格式无效");
  }
  const followUp =
    input.follow_up_question === null
      ? null
      : text(input.follow_up_question, "follow_up_question");
  if (input.is_final && followUp) {
    throw new Error("结束摘要后不能继续追问");
  }
  if (!input.is_final && !followUp) {
    throw new Error("未结束时必须只有一个追问");
  }
  const summary =
    input.summary === null || input.summary === undefined
      ? null
      : parseSummary(input.summary);
  if (input.is_final && !summary) throw new Error("summary不能为空");
  if (!input.is_final && summary) throw new Error("未结束时不能生成summary");

  return {
    explicit_content: textArray(
      input.explicit_content,
      "explicit_content",
      { min: 1, max: 5 }
    ),
    ai_inferences: textArray(input.ai_inferences, "ai_inferences", {
      max: 2,
    }),
    unknowns: textArray(input.unknowns, "unknowns", { max: 5 }),
    response_options: responseOptions,
    follow_up_question: followUp,
    is_final: input.is_final,
    summary,
    safety_state: "normal",
  };
}

export function normalizeFocusQuestion(value: unknown): string {
  return text(value, "问题", 2000);
}

export function shouldFinalizeFocus(
  turnNo: number,
  forceFinalize: boolean
): boolean {
  return forceFinalize || turnNo >= FOCUS_MAX_TURNS;
}

export function hasImmediateSafetyRisk(value: string): boolean {
  const normalized = value.toLowerCase();
  return [
    /(?:现在|马上|已经|准备).{0,8}(?:自杀|伤害自己|结束生命|杀人|伤害他人)/,
    /(?:我要|我想).{0,4}(?:自杀|杀人)/,
    /\b(?:i am going to|i'm going to|i will|i plan to).{0,12}(?:kill myself|hurt myself|kill someone|hurt someone)\b/,
  ].some((pattern) => pattern.test(normalized));
}
