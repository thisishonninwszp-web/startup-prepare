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

export const DREAM_INTERVIEW_PHASES = [
  "memory_bridge",
  "future_day",
  "people",
  "inner_state",
  "meaning",
  "non_negotiables",
  "fork_point",
] as const;
export type DreamInterviewPhase = (typeof DREAM_INTERVIEW_PHASES)[number];

export const DREAM_CANVAS_DIMENSIONS = [
  "memory_fragments",
  "scene_title",
  "horizon",
  "location",
  "people",
  "sensory_details",
  "actions",
  "inner_state",
  "desired_changes",
  "past_roots",
  "non_negotiables",
  "costs",
  "assumptions",
  "reality_signals",
  "conflicts",
] as const;
export type DreamCanvasDimension =
  (typeof DREAM_CANVAS_DIMENSIONS)[number];

export type DreamBranchMessage = {
  id: string;
  branch_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type ExplicitDreamCanvasPatch = {
  dimension: DreamCanvasDimension;
  text: string;
  source_quote: string;
  source_message_id: string;
};

export type InferredDreamCanvasPatch = {
  dimension: DreamCanvasDimension;
  text: string;
  source_message_ids: string[];
  source_ids: string[];
  status: "pending";
};

export type DreamTurn = {
  question: string;
  phase: DreamInterviewPhase;
  target_dimension: DreamCanvasDimension;
  explicit_patches: ExplicitDreamCanvasPatch[];
  inferences: InferredDreamCanvasPatch[];
  unknown_dimensions: DreamCanvasDimension[];
  ready_to_synthesize: boolean;
};

export type DreamCanvasItem = {
  id: string;
  text: string;
  origin: "explicit" | "inferred" | "user" | "legacy";
  status: "confirmed" | "pending";
  source_message_ids: string[];
  source_ids?: string[];
};

export type DreamCanvas = {
  revision: number;
  content: Record<DreamCanvasDimension, DreamCanvasItem[]>;
};

export type DreamBranchSuggestion = {
  label: string;
  fork_question: string;
  tradeoff: string;
  source_message_ids: string[];
};

export type DreamBranchSuggestions = {
  suggestions: DreamBranchSuggestion[];
};

export type DreamBranchComparison = {
  common_ground: string[];
  differences: {
    dimension: DreamCanvasDimension;
    branches: { branch_id: string; summary: string }[];
  }[];
  unknowns: string[];
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

function canvasDimension(
  value: unknown,
  label: string
): DreamCanvasDimension {
  const dimension = stringValue(value, label) as DreamCanvasDimension;
  if (!DREAM_CANVAS_DIMENSIONS.includes(dimension)) {
    throw new Error(`${label}不是有效画布维度`);
  }
  return dimension;
}

export function parseDreamTurn(value: unknown): DreamTurn {
  const input = object(value, "梦想单题访谈");
  if (Array.isArray(input.questions)) {
    throw new Error("每轮只能返回一道问题");
  }
  const phase = stringValue(input.phase, "phase") as DreamInterviewPhase;
  if (!DREAM_INTERVIEW_PHASES.includes(phase)) {
    throw new Error("phase不是有效访谈阶段");
  }
  if (!Array.isArray(input.explicit_patches)) {
    throw new Error("explicit_patches必须是数组");
  }
  if (!Array.isArray(input.inferences)) {
    throw new Error("inferences必须是数组");
  }
  if (!Array.isArray(input.unknown_dimensions)) {
    throw new Error("unknown_dimensions必须是数组");
  }
  if (typeof input.ready_to_synthesize !== "boolean") {
    throw new Error("ready_to_synthesize必须是布尔值");
  }
  return {
    question: stringValue(input.question, "question"),
    phase,
    target_dimension: canvasDimension(
      input.target_dimension,
      "target_dimension"
    ),
    explicit_patches: input.explicit_patches.map((item, index) => {
      const row = object(item, `explicit_patches[${index}]`);
      return {
        dimension: canvasDimension(
          row.dimension,
          `explicit_patches[${index}].dimension`
        ),
        text: stringValue(row.text, `explicit_patches[${index}].text`),
        source_quote: stringValue(
          row.source_quote,
          `explicit_patches[${index}].source_quote`
        ),
        source_message_id: stringValue(
          row.source_message_id,
          `explicit_patches[${index}].source_message_id`
        ),
      };
    }),
    inferences: input.inferences.map((item, index) => {
      const row = object(item, `inferences[${index}]`);
      return {
        dimension: canvasDimension(
          row.dimension,
          `inferences[${index}].dimension`
        ),
        text: stringValue(row.text, `inferences[${index}].text`),
        source_message_ids: strings(
          row.source_message_ids,
          `inferences[${index}].source_message_ids`
        ),
        source_ids: Array.isArray(row.source_ids)
          ? strings(row.source_ids, `inferences[${index}].source_ids`)
          : [],
        status: "pending" as const,
      };
    }),
    unknown_dimensions: input.unknown_dimensions.map(
      (item, index) =>
        canvasDimension(item, `unknown_dimensions[${index}]`)
    ),
    ready_to_synthesize: input.ready_to_synthesize,
  };
}

export function validateDreamPhaseTransition(
  current: DreamInterviewPhase,
  next: DreamInterviewPhase
) {
  const currentIndex = DREAM_INTERVIEW_PHASES.indexOf(current);
  const nextIndex = DREAM_INTERVIEW_PHASES.indexOf(next);
  if (
    currentIndex < 0 ||
    nextIndex < 0 ||
    nextIndex < currentIndex ||
    nextIndex > currentIndex + 1
  ) {
    throw new Error("梦想访谈阶段必须按顺序推进");
  }
}

export function emptyDreamCanvas(): DreamCanvas {
  return {
    revision: 0,
    content: Object.fromEntries(
      DREAM_CANVAS_DIMENSIONS.map((dimension) => [dimension, []])
    ) as unknown as Record<DreamCanvasDimension, DreamCanvasItem[]>,
  };
}

export function parseDreamCanvas(value: unknown): DreamCanvas {
  const input = object(value, "梦想画布");
  const revision =
    typeof input.revision === "string" && /^(0|[1-9]\d*)$/.test(input.revision)
      ? Number(input.revision)
      : input.revision;
  if (
    typeof revision !== "number" ||
    !Number.isSafeInteger(revision) ||
    revision < 0
  ) {
    const receivedValue =
      input.revision === null
        ? "null"
        : typeof input.revision === "object"
          ? "<non-scalar>"
          : String(input.revision);
    throw new Error(
      `梦想画布revision无效（type=${typeof input.revision}, value=${receivedValue}）`
    );
  }
  const rawContent = object(input.content, "梦想画布content");
  const content = Object.fromEntries(
    DREAM_CANVAS_DIMENSIONS.map((dimension) => {
      const items = rawContent[dimension];
      if (!Array.isArray(items)) {
        throw new Error(`梦想画布${dimension}必须是数组`);
      }
      return [
        dimension,
        items.map((item, index) => {
          const row = object(item, `${dimension}[${index}]`);
          if (
            row.origin !== "explicit" &&
            row.origin !== "inferred" &&
            row.origin !== "user" &&
            row.origin !== "legacy"
          ) {
            throw new Error(`${dimension}[${index}].origin无效`);
          }
          if (row.status !== "confirmed" && row.status !== "pending") {
            throw new Error(`${dimension}[${index}].status无效`);
          }
          return {
            id: stringValue(row.id, `${dimension}[${index}].id`),
            text: stringValue(row.text, `${dimension}[${index}].text`),
            origin: row.origin,
            status: row.status,
            source_message_ids: strings(
              row.source_message_ids,
              `${dimension}[${index}].source_message_ids`
            ),
            source_ids: Array.isArray(row.source_ids)
              ? strings(row.source_ids, `${dimension}[${index}].source_ids`)
              : [],
          } satisfies DreamCanvasItem;
        }),
      ];
    })
  ) as Record<DreamCanvasDimension, DreamCanvasItem[]>;
  return { revision, content };
}

export function validateExplicitDreamPatches(
  patches: ExplicitDreamCanvasPatch[],
  messages: DreamBranchMessage[],
  branchId: string
) {
  const byId = new Map(messages.map((message) => [message.id, message]));
  for (const patch of patches) {
    const source = byId.get(patch.source_message_id);
    if (!source || source.branch_id !== branchId) {
      throw new Error("画布引用了其他分支的消息");
    }
    if (
      source.role !== "user" ||
      !source.content.includes(patch.source_quote)
    ) {
      throw new Error("画布引用的原话不存在");
    }
    if (patch.text !== patch.source_quote) {
      throw new Error("原话画布内容必须逐字保存；改写只能进入AI推演");
    }
  }
}

export function applyDreamCanvasPatches(
  canvas: DreamCanvas,
  turn: DreamTurn,
  expectedRevision: number
): DreamCanvas {
  if (canvas.revision !== expectedRevision) {
    throw new Error("画布已经更新，请基于最新版本重试");
  }
  const content = Object.fromEntries(
    DREAM_CANVAS_DIMENSIONS.map((dimension) => [
      dimension,
      [...canvas.content[dimension]],
    ])
  ) as Record<DreamCanvasDimension, DreamCanvasItem[]>;
  for (const patch of turn.explicit_patches) {
    const id = `${patch.source_message_id}:${patch.dimension}:${patch.text}`;
    if (!content[patch.dimension].some((item) => item.id === id)) {
      content[patch.dimension].push({
        id,
        text: patch.text,
        origin: "explicit",
        status: "confirmed",
        source_message_ids: [patch.source_message_id],
      });
    }
  }
  for (const patch of turn.inferences) {
    const id = `${patch.source_message_ids.join("-")}:${patch.source_ids.join("-")}:${patch.dimension}:${patch.text}`;
    if (!content[patch.dimension].some((item) => item.id === id)) {
      content[patch.dimension].push({
        id,
        text: patch.text,
        origin: "inferred",
        status: "pending",
        source_message_ids: patch.source_message_ids,
        source_ids: patch.source_ids,
      });
    }
  }
  return { revision: expectedRevision + 1, content };
}

function confirmedTexts(
  canvas: DreamCanvas,
  dimension: DreamCanvasDimension
) {
  return canvas.content[dimension]
    .filter((item) => item.status === "confirmed")
    .map((item) => item.text);
}

function firstConfirmed(
  canvas: DreamCanvas,
  dimension: DreamCanvasDimension
) {
  return confirmedTexts(canvas, dimension)[0] ?? "尚未看清";
}

export function projectDreamCanvas(canvas: DreamCanvas): DreamVision {
  const list = (dimension: DreamCanvasDimension) => {
    const values = confirmedTexts(canvas, dimension);
    return values.length ? values : ["尚未看清"];
  };
  return {
    scene: {
      title: firstConfirmed(canvas, "scene_title"),
      horizon: firstConfirmed(canvas, "horizon"),
      location: firstConfirmed(canvas, "location"),
      people: list("people"),
      sensory_details: list("sensory_details"),
      actions: list("actions"),
      inner_state: firstConfirmed(canvas, "inner_state"),
    },
    desired_changes: list("desired_changes"),
    past_roots: list("past_roots"),
    non_negotiables: list("non_negotiables"),
    costs: list("costs"),
    assumptions: list("assumptions"),
    reality_signals: list("reality_signals"),
    conflicts: list("conflicts"),
  };
}

export function confirmedDreamCanvas(canvas: DreamCanvas): DreamCanvas {
  return {
    revision: canvas.revision,
    content: Object.fromEntries(
      DREAM_CANVAS_DIMENSIONS.map((dimension) => [
        dimension,
        canvas.content[dimension].filter(
          (item) => item.status === "confirmed"
        ),
      ])
    ) as Record<DreamCanvasDimension, DreamCanvasItem[]>,
  };
}

export function resolveDreamCanvasItem(
  canvas: DreamCanvas,
  itemId: string,
  resolution: "accept" | "reject",
  expectedRevision: number
): DreamCanvas {
  if (canvas.revision !== expectedRevision) {
    throw new Error("画布不是最新版本，请刷新后重试");
  }
  let found = false;
  const content = Object.fromEntries(
    DREAM_CANVAS_DIMENSIONS.map((dimension) => [
      dimension,
      canvas.content[dimension]
        .filter((item) => {
          if (item.id !== itemId) return true;
          found = true;
          return resolution !== "reject";
        })
        .map((item) =>
          item.id === itemId ? { ...item, status: "confirmed" as const } : item
        ),
    ])
  ) as Record<DreamCanvasDimension, DreamCanvasItem[]>;
  if (!found) throw new Error("画布建议不存在");
  return { revision: expectedRevision + 1, content };
}

export function upsertConfirmedDreamCanvasItem(
  canvas: DreamCanvas,
  dimension: DreamCanvasDimension,
  itemId: string | null,
  textValue: string,
  expectedRevision: number
): DreamCanvas {
  if (canvas.revision !== expectedRevision) {
    throw new Error("画布不是最新版本，请刷新后重试");
  }
  const text = textValue.trim();
  if (!text) throw new Error("画布内容不能为空");
  const content = Object.fromEntries(
    DREAM_CANVAS_DIMENSIONS.map((key) => [
      key,
      canvas.content[key].map((item) => ({ ...item })),
    ])
  ) as Record<DreamCanvasDimension, DreamCanvasItem[]>;
  const existingIndex = itemId
    ? content[dimension].findIndex((item) => item.id === itemId)
    : -1;
  const item: DreamCanvasItem = {
    id: itemId ?? `user:${dimension}:${expectedRevision + 1}`,
    text,
    origin: "user",
    status: "confirmed",
    source_message_ids:
      existingIndex >= 0
        ? content[dimension][existingIndex].source_message_ids
        : [],
    source_ids:
      existingIndex >= 0
        ? content[dimension][existingIndex].source_ids ?? []
        : [],
  };
  if (existingIndex >= 0) content[dimension][existingIndex] = item;
  else content[dimension].push(item);
  return { revision: expectedRevision + 1, content };
}

export function removeDreamCanvasItem(
  canvas: DreamCanvas,
  dimension: DreamCanvasDimension,
  itemId: string,
  expectedRevision: number
): DreamCanvas {
  if (canvas.revision !== expectedRevision) {
    throw new Error("画布不是最新版本，请刷新后重试");
  }
  const before = canvas.content[dimension];
  const after = before.filter((item) => item.id !== itemId);
  if (after.length === before.length) throw new Error("画布内容不存在");
  return {
    revision: expectedRevision + 1,
    content: {
      ...canvas.content,
      [dimension]: after,
    },
  };
}

export function canCreateDreamBranch(activeBranchCount: number) {
  return activeBranchCount >= 0 && activeBranchCount < 5;
}

const REALITY_ONLY_DREAM_DIMENSIONS = new Set<DreamCanvasDimension>([
  "costs",
  "assumptions",
  "reality_signals",
  "conflicts",
]);

export function validateDreamInferenceReferences(
  inferences: InferredDreamCanvasPatch[],
  allowedMessageIds: Set<string>,
  allowedSourceIds: Set<string>
) {
  for (const inference of inferences) {
    const hasMessages = inference.source_message_ids.length > 0;
    const hasSources = inference.source_ids.length > 0;
    if (!hasMessages && !hasSources) {
      throw new Error("AI推演缺少来源");
    }
    if (
      inference.source_message_ids.some((id) => !allowedMessageIds.has(id))
    ) {
      throw new Error("AI推演引用了未知消息");
    }
    if (inference.source_ids.some((id) => !allowedSourceIds.has(id))) {
      throw new Error("AI推演引用了未知现实来源");
    }
    if (hasSources && !REALITY_ONLY_DREAM_DIMENSIONS.has(inference.dimension)) {
      throw new Error("现实来源不能修改未来场景");
    }
  }
}

export function parseDreamBranchSuggestions(
  value: unknown
): DreamBranchSuggestions {
  const input = object(value, "梦想分支建议");
  if (
    !Array.isArray(input.suggestions) ||
    input.suggestions.length > 3
  ) {
    throw new Error("分支建议最多3条");
  }
  return {
    suggestions: input.suggestions.map((item, index) => {
      const row = object(item, `suggestions[${index}]`);
      if ("score" in row || "probability" in row) {
        throw new Error("梦想分支禁止评分");
      }
      return {
        label: stringValue(row.label, `suggestions[${index}].label`),
        fork_question: stringValue(
          row.fork_question,
          `suggestions[${index}].fork_question`
        ),
        tradeoff: stringValue(
          row.tradeoff,
          `suggestions[${index}].tradeoff`
        ),
        source_message_ids: strings(
          row.source_message_ids,
          `suggestions[${index}].source_message_ids`
        ),
      };
    }),
  };
}

export function parseDreamBranchComparison(
  value: unknown
): DreamBranchComparison {
  const input = object(value, "梦想分支比较");
  const containsForbiddenJudgment = (candidate: unknown): boolean => {
    if (Array.isArray(candidate)) {
      return candidate.some(containsForbiddenJudgment);
    }
    if (!candidate || typeof candidate !== "object") return false;
    const row = candidate as Record<string, unknown>;
    if (
      ["recommendation", "winner", "score", "probability"].some(
        (key) => key in row
      )
    ) {
      return true;
    }
    return Object.values(row).some(containsForbiddenJudgment);
  };
  if (containsForbiddenJudgment(input)) {
    throw new Error("梦想分支比较禁止推荐或评分");
  }
  if (!Array.isArray(input.differences)) {
    throw new Error("differences必须是数组");
  }
  return {
    common_ground: strings(input.common_ground, "common_ground"),
    differences: input.differences.map((item, index) => {
      const row = object(item, `differences[${index}]`);
      if (!Array.isArray(row.branches)) {
        throw new Error(`differences[${index}].branches必须是数组`);
      }
      return {
        dimension: canvasDimension(
          row.dimension,
          `differences[${index}].dimension`
        ),
        branches: row.branches.map((branch, branchIndex) => {
          const value = object(
            branch,
            `differences[${index}].branches[${branchIndex}]`
          );
          return {
            branch_id: stringValue(value.branch_id, "branch_id"),
            summary: stringValue(value.summary, "summary"),
          };
        }),
      };
    }),
    unknowns: strings(input.unknowns, "unknowns"),
  };
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
