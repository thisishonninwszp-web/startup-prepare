import type {
  DecisionClosure,
  DecisionClosureObjectType,
} from "@/app/decision-closures/domain";

export const DECISION_OBJECT_TYPES = [
  "reality_case",
  "idea",
  "customer_case",
  "dream_case",
  "dream_branch",
  "retro_period",
  "company_profile",
  "reasoning_session",
  "decision_closure",
] as const;

export type WorkbenchObjectType = (typeof DECISION_OBJECT_TYPES)[number];

export const WORKBENCH_OBJECT_STATUSES = [
  "active",
  "closed",
  "archived",
] as const;

export type WorkbenchObjectStatus =
  (typeof WORKBENCH_OBJECT_STATUSES)[number];

export const FRAMEWORK_LANES = [
  "see_reality",
  "test_judgment",
  "close_action",
] as const;

export type FrameworkLane = (typeof FRAMEWORK_LANES)[number];

export type FrameworkRecommendation = {
  id: string;
  lane: FrameworkLane;
  title: string;
  reason: string;
  opens: string;
  blind_spot: string;
  output: string;
  href: string;
};

export type WorkbenchObject = {
  object_type: WorkbenchObjectType;
  object_id: string;
  title: string;
  primary_module: string;
  status: WorkbenchObjectStatus;
  href: string;
  last_activity_at: string;
  current_closure: DecisionClosure | null;
};

export type WorkbenchObjectSignal = {
  objectType: WorkbenchObjectType;
  title: string;
  hasActiveClosure: boolean;
  isClosureDue: boolean;
  unknownCount: number;
  factCount: number;
  interpretationCount: number;
  hasEmotionOrContradiction: boolean;
  hasQuantitativeQuestion: boolean;
  needsCustomerEvidence: boolean;
  needsDirection: boolean;
};

const FORBIDDEN_RECOMMENDATION_KEYS = [
  "score",
  "rating",
  "rank",
  "priority",
  "percentage",
  "probability",
  "success_rate",
];

const FORBIDDEN_RECOMMENDATION_TEXT =
  /评分|打分|星级|排名|概率|成功率|胜率|score|rating|rank|percentage|probability|\d+\s*%/i;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, checkForbiddenText = true): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  const result = value.trim();
  if (checkForbiddenText && FORBIDDEN_RECOMMENDATION_TEXT.test(result)) {
    throw new Error(`${label} contains forbidden scoring language`);
  }
  return result;
}

export function parseFrameworkRecommendation(
  value: unknown
): FrameworkRecommendation {
  const input = object(value, "framework recommendation");
  for (const key of FORBIDDEN_RECOMMENDATION_KEYS) {
    if (key in input) throw new Error(`${key} is forbidden`);
  }
  const lane = text(input.lane, "lane");
  if (!FRAMEWORK_LANES.includes(lane as FrameworkLane)) {
    throw new Error("lane is invalid");
  }
  return {
    id: text(input.id, "id"),
    lane: lane as FrameworkLane,
    title: text(input.title, "title"),
    reason: text(input.reason, "reason"),
    opens: text(input.opens, "opens"),
    blind_spot: text(input.blind_spot, "blind_spot"),
    output: text(input.output, "output"),
    href: text(input.href, "href", false),
  };
}

export function parseFrameworkRecommendations(
  value: unknown
): FrameworkRecommendation[] {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error("framework recommendations must contain exactly 3 cards");
  }
  const parsed = value.map(parseFrameworkRecommendation);
  const lanes = new Set(parsed.map((item) => item.lane));
  for (const lane of FRAMEWORK_LANES) {
    if (!lanes.has(lane)) throw new Error(`missing framework lane: ${lane}`);
  }
  return FRAMEWORK_LANES.map(
    (lane) => parsed.find((item) => item.lane === lane)!
  );
}

export function toClosureObjectType(
  type: WorkbenchObjectType
): DecisionClosureObjectType | null {
  return type === "decision_closure" ? null : (type as DecisionClosureObjectType);
}

export function objectHref(type: WorkbenchObjectType, id: string): string {
  switch (type) {
    case "reality_case":
      return `/reality/${id}`;
    case "idea":
      return `/ideas/${id}`;
    case "customer_case":
      return `/customer-view/${id}`;
    case "dream_case":
      return `/dreams/${id}`;
    case "dream_branch":
      return "/dreams";
    case "retro_period":
      return `/retrospectives`;
    case "company_profile":
      return `/companies/${id}`;
    case "reasoning_session":
      return `/reasoning`;
    case "decision_closure":
      return `/workbench/decision_closure/${id}`;
  }
}
