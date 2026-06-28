import {
  REALITY_INTERVIEW_SOFT_LIMIT,
  REALITY_CONTEXTS,
  REALITY_MODES,
  type RealityContext,
  type RealityMessage,
  type RealityMode,
} from "./types";

export function assertOwnership(
  ownerId: string | null | undefined,
  currentUserId: string,
  message: string
): void {
  if (!ownerId || ownerId !== currentUserId) throw new Error(message);
}

export function shouldStopRealityInterview(
  messages: RealityMessage[],
  forceContinue: boolean
): boolean {
  if (forceContinue) return false;
  const rounds = messages.filter(
    (message) => message.role === "assistant"
  ).length;
  return rounds >= REALITY_INTERVIEW_SOFT_LIMIT;
}

export function assertPathNotSelected(selectedPath: unknown): void {
  if (selectedPath !== null && selectedPath !== undefined) {
    throw new Error("这个地图版本已经记录过路径，不能覆盖历史选择");
  }
}

export type CreateRealityInput = {
  mode: RealityMode;
  context: RealityContext;
  title: string;
  initialStatement: string;
  domains: string[];
};

export function normalizeCreateRealityInput(
  input: CreateRealityInput
): CreateRealityInput {
  if (!REALITY_MODES.includes(input.mode)) throw new Error("课题类型无效");
  if (!REALITY_CONTEXTS.includes(input.context)) throw new Error("课题语境无效");

  const title = input.title.trim();
  const initialStatement = input.initialStatement.trim();
  if (!title) throw new Error("标题不能为空");
  if (!initialStatement) throw new Error("现状描述不能为空");
  if (title.length > 120) throw new Error("标题不能超过120字");
  if (initialStatement.length > 10_000) {
    throw new Error("现状描述不能超过10000字");
  }

  const domains = Array.from(
    new Set(input.domains.map((domain) => domain.trim()).filter(Boolean))
  ).slice(0, 20);

  return {
    mode: input.mode,
    context: input.context,
    title,
    initialStatement,
    domains,
  };
}

export type PathSelectionInput = {
  pathIndex: number;
  customAction: string;
  reason: string;
  reviewDueAt: string;
};

export function normalizePathSelection(input: PathSelectionInput) {
  if (![0, 1, 2].includes(input.pathIndex)) throw new Error("路径无效");
  const reason = input.reason.trim();
  if (!reason) throw new Error("请写下选择这条路径的原因");
  if (!input.reviewDueAt.trim()) throw new Error("请选择复查日期");
  const due = new Date(input.reviewDueAt);
  if (Number.isNaN(due.getTime())) throw new Error("复查日期无效");

  return {
    pathIndex: input.pathIndex,
    customAction: input.customAction.trim(),
    reason,
    reviewDueAt: due.toISOString(),
  };
}

export function appendRealityUpdateMessage(
  messages: RealityMessage[],
  updateContext: string,
  createdAt = new Date().toISOString()
): RealityMessage[] {
  const update = updateContext.trim();
  if (!update) return messages;
  const content = `【现实更新】${update}`;
  if (messages.at(-1)?.role === "user" && messages.at(-1)?.content === content) {
    return messages;
  }
  return [...messages, { role: "user", content, created_at: createdAt }];
}
