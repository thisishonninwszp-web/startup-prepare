export const MATERIAL_SOURCE_TYPES = [
  "text",
  "url",
  "file",
  "customer_quote",
  "business_fragment",
  "emotion_fragment",
] as const;
export type MaterialSourceType = (typeof MATERIAL_SOURCE_TYPES)[number];

export const MATERIAL_STATUSES = [
  "captured",
  "extracted",
  "drafted",
  "reviewed",
  "confirmed",
  "parked",
  "rejected",
  "summary_only",
  "failed",
] as const;
export type MaterialStatus = (typeof MATERIAL_STATUSES)[number];

export const MATERIAL_DEPARTMENTS = [
  "customer",
  "company",
  "market",
  "judgment",
  "action",
  "self",
] as const;
export type MaterialDepartment = (typeof MATERIAL_DEPARTMENTS)[number];

export const MATERIAL_ROUTE_TARGETS = [
  "reality",
  "customer_view",
  "company_kb",
  "idea",
  "retrospective",
  "reasoning",
  "decision_closure",
] as const;
export type MaterialRouteTarget = (typeof MATERIAL_ROUTE_TARGETS)[number];

export type RealityMaterialRouteSuggestion = {
  target: MaterialRouteTarget;
  reason: string;
  payload_hint: string;
};

export type RealityMaterialAffectedObject = {
  type: string;
  id?: string | null;
  title: string;
};

export type RealityMaterialDraft = {
  summary: string;
  original_fragments: string[];
  confirmed_facts: string[];
  possible_inferences: string[];
  unknowns: string[];
  affected_objects: RealityMaterialAffectedObject[];
  suggested_departments: MaterialDepartment[];
  suggested_routes: RealityMaterialRouteSuggestion[];
  may_affect_next_step: boolean;
};
export type MaterialDraft = RealityMaterialDraft;

export type RealityMaterialReview = {
  fact_inference_checks: string[];
  insufficient_evidence: string[];
  sensitive_items: Array<{
    label: string;
    handling: "redact" | "keep" | "remove" | "ask_user";
    reason: string;
  }>;
  misleading_risks: string[];
  blocked_auto_writes: string[];
  should_not_route: boolean;
  review_summary: string;
};
export type MaterialReview = RealityMaterialReview;

export type RealityMaterialRoute = {
  target: MaterialRouteTarget;
  target_id?: string | null;
  departments: MaterialDepartment[];
  reason: string;
  snapshot: Record<string, unknown>;
};

export type RealityMaterialRoutePlan = {
  routes: RealityMaterialRouteSuggestion[];
};

export type RealityMaterialSnapshotInput = {
  materialId: string;
  title: string;
  sourceType: MaterialSourceType | string;
  sanitizedText: string;
  extraction?: Record<string, unknown> | null;
  draft?: Record<string, unknown> | null;
  review?: Record<string, unknown> | null;
};

export type SpreadsheetSheet = {
  name: string;
  state: "visible" | "hidden" | "veryHidden";
  rows: unknown[][];
};

const FORBIDDEN_KEYS = [
  "score",
  "rating",
  "rank",
  "probability",
  "percentage",
  "success_rate",
];

const FORBIDDEN_TEXT =
  /评分|打分|星级|排名|概率|成功率|胜率|score|rating|rank|percentage|probability|\d+\s*%/i;

const INFERENCE_IN_FACT =
  /可能|也许|应该|推测|推断|看起来|似乎|大概|maybe|probably/i;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  const result = value.trim();
  if (FORBIDDEN_TEXT.test(result)) {
    throw new Error(`${label} contains forbidden scoring language`);
  }
  return result;
}

function textArray(value: unknown, label: string, required = true): string[] {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((item, index) => text(item, `${label}[${index}]`));
}

function ensureNoForbiddenKeys(value: Record<string, unknown>, label: string) {
  for (const key of FORBIDDEN_KEYS) {
    if (key in value) throw new Error(`${label}.${key} is forbidden`);
  }
}

export function parseMaterialDepartment(value: unknown): MaterialDepartment {
  const result = text(value, "department");
  if (!MATERIAL_DEPARTMENTS.includes(result as MaterialDepartment)) {
    throw new Error("invalid material department");
  }
  return result as MaterialDepartment;
}

export function parseRealityMaterialRouteTarget(
  value: unknown
): MaterialRouteTarget {
  const result = text(value, "route target");
  if (!MATERIAL_ROUTE_TARGETS.includes(result as MaterialRouteTarget)) {
    throw new Error("invalid route target");
  }
  return result as MaterialRouteTarget;
}

function parseRouteSuggestion(
  value: unknown,
  label: string
): RealityMaterialRouteSuggestion {
  const input = object(value, label);
  ensureNoForbiddenKeys(input, label);
  return {
    target: parseRealityMaterialRouteTarget(input.target),
    reason: text(input.reason, `${label}.reason`),
    payload_hint: text(
      input.payload_hint ?? input.output_expectation,
      `${label}.payload_hint`
    ),
  };
}

function parseAffectedObject(
  value: unknown,
  label: string
): RealityMaterialAffectedObject {
  if (typeof value === "string") {
    return { type: "unknown", title: text(value, label) };
  }
  const input = object(value, label);
  return {
    type: text(input.type, `${label}.type`),
    id: typeof input.id === "string" && input.id.trim() ? input.id.trim() : null,
    title: text(input.title, `${label}.title`),
  };
}

function rejectInferenceLanguageInFacts(facts: string[]) {
  const invalid = facts.find((fact) => INFERENCE_IN_FACT.test(fact));
  if (invalid) {
    throw new Error(`confirmed_facts contains inference language: ${invalid}`);
  }
}

export function parseMaterialDraft(value: unknown): RealityMaterialDraft {
  const input = object(value, "material draft");
  ensureNoForbiddenKeys(input, "material draft");
  const confirmed_facts = textArray(input.confirmed_facts, "confirmed_facts");
  rejectInferenceLanguageInFacts(confirmed_facts);
  const suggested_departments = Array.from(
    new Set(
      textArray(
        input.suggested_departments ?? input.departments,
        "suggested_departments"
      ).map(parseMaterialDepartment)
    )
  );
  if (suggested_departments.length === 0) {
    throw new Error("suggested_departments must not be empty");
  }
  const mayAffect =
    input.may_affect_next_step ?? input.may_affect_current_next_step;
  if (typeof mayAffect !== "boolean") {
    throw new Error("may_affect_next_step must be boolean");
  }
  const affectedRaw = input.affected_objects ?? [];
  if (!Array.isArray(affectedRaw)) {
    throw new Error("affected_objects must be an array");
  }
  const routeRaw = input.suggested_routes ?? [];
  if (!Array.isArray(routeRaw)) {
    throw new Error("suggested_routes must be an array");
  }
  return {
    summary: text(input.summary, "summary"),
    original_fragments: textArray(input.original_fragments, "original_fragments"),
    confirmed_facts,
    possible_inferences: textArray(
      input.possible_inferences ?? input.inferences,
      "possible_inferences",
      false
    ),
    unknowns: textArray(input.unknowns, "unknowns", false),
    affected_objects: affectedRaw.map((item, index) =>
      parseAffectedObject(item, `affected_objects[${index}]`)
    ),
    suggested_departments,
    suggested_routes: routeRaw.map((item, index) =>
      parseRouteSuggestion(item, `suggested_routes[${index}]`)
    ),
    may_affect_next_step: mayAffect,
  };
}

export function parseRealityMaterialDraft(
  value: unknown
): RealityMaterialDraft {
  return parseMaterialDraft(value);
}

export function parseMaterialReview(value: unknown): RealityMaterialReview {
  const input = object(value, "material review");
  ensureNoForbiddenKeys(input, "material review");
  const sensitiveRaw = input.sensitive_items ?? [];
  if (!Array.isArray(sensitiveRaw)) {
    throw new Error("sensitive_items must be an array");
  }
  return {
    fact_inference_checks: textArray(
      input.fact_inference_checks ?? input.fact_inference_boundary,
      "fact_inference_checks"
    ),
    insufficient_evidence: textArray(
      input.insufficient_evidence ?? input.evidence_gaps,
      "insufficient_evidence",
      false
    ),
    sensitive_items: sensitiveRaw.map((item, index) => {
      const row = object(item, `sensitive_items[${index}]`);
      const handling = text(row.handling, `sensitive_items[${index}].handling`);
      if (!["redact", "keep", "remove", "ask_user"].includes(handling)) {
        throw new Error("invalid sensitive item handling");
      }
      return {
        label: text(row.label, `sensitive_items[${index}].label`),
        handling:
          handling as RealityMaterialReview["sensitive_items"][number]["handling"],
        reason: text(row.reason, `sensitive_items[${index}].reason`),
      };
    }),
    misleading_risks: textArray(
      input.misleading_risks,
      "misleading_risks",
      false
    ),
    blocked_auto_writes: textArray(
      input.blocked_auto_writes,
      "blocked_auto_writes",
      false
    ),
    should_not_route: Boolean(input.should_not_route),
    review_summary: text(input.review_summary, "review_summary"),
  };
}

export function parseRealityMaterialReview(
  value: unknown
): RealityMaterialReview {
  return parseMaterialReview(value);
}

export function parseMaterialRoute(value: unknown): RealityMaterialRoute {
  const input = object(value, "material route");
  ensureNoForbiddenKeys(input, "material route");
  if ("auto_create_idea" in input) {
    throw new Error("auto_create_idea is forbidden");
  }
  const departments = Array.from(
    new Set(
      textArray(input.departments, "departments").map(parseMaterialDepartment)
    )
  );
  if (departments.length === 0) throw new Error("departments must not be empty");
  const snapshot = object(input.snapshot, "snapshot");
  return {
    target: parseRealityMaterialRouteTarget(input.target),
    target_id:
      typeof input.target_id === "string" && input.target_id.trim()
        ? input.target_id.trim()
        : null,
    departments,
    reason: text(input.reason, "reason"),
    snapshot,
  };
}

export function parseRealityMaterialRoutePlan(
  value: unknown
): RealityMaterialRoutePlan {
  const input = object(value, "material route plan");
  ensureNoForbiddenKeys(input, "material route plan");
  if (!Array.isArray(input.routes)) throw new Error("routes must be an array");
  return {
    routes: input.routes
      .slice(0, 6)
      .map((route, index) => parseRouteSuggestion(route, `routes[${index}]`)),
  };
}

export function buildMaterialSnapshot(input: RealityMaterialSnapshotInput) {
  return {
    material_id: input.materialId,
    title: input.title,
    source_type: input.sourceType,
    sanitized_text: input.sanitizedText,
    extraction: input.extraction ?? null,
    draft: input.draft ?? null,
    review: input.review ?? null,
    ai_outputs_are_drafts: true,
    captured_at: new Date().toISOString(),
  };
}

export function summarizeSpreadsheetRows(
  sheets: SpreadsheetSheet[],
  maxChars = 20_000,
  maxRowsPerSheet = 30,
  maxCols = 12
) {
  const visible = sheets.filter((sheet) => sheet.state === "visible");
  const sections = visible.map((sheet) => {
    const lines = sheet.rows
      .slice(0, maxRowsPerSheet)
      .map((row) =>
        row
          .slice(0, maxCols)
          .map((cell) => {
            if (cell == null) return "";
            if (cell instanceof Date) return cell.toISOString().slice(0, 10);
            if (typeof cell === "object") return JSON.stringify(cell);
            return String(cell);
          })
          .join(" | ")
      )
      .filter((line) => line.trim().length > 0);
    return [`工作表：${sheet.name}`, ...lines].join("\n");
  });
  const raw = sections.join("\n\n---\n\n");
  const is_truncated = raw.length > maxChars;
  return {
    text: is_truncated ? raw.slice(0, maxChars) : raw,
    is_truncated,
    visible_sheet_names: visible.map((sheet) => sheet.name),
    hidden_sheet_count: sheets.length - visible.length,
    sheet_count: sheets.length,
  };
}

export function departmentLabel(department: MaterialDepartment): string {
  return {
    customer: "顾客部",
    company: "公司部",
    market: "市场部",
    judgment: "判断部",
    action: "行动部",
    self: "自我部",
  }[department];
}

export function routeTargetLabel(target: MaterialRouteTarget): string {
  return {
    reality: "现状认识",
    customer_view: "顾客视点",
    company_kb: "公司档案",
    idea: "Idea",
    retrospective: "复盘",
    reasoning: "推理工具",
    decision_closure: "统一收束",
  }[target];
}
