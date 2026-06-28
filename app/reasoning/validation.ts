export type CreateBayesianBeliefInput = {
  question: string;
  prior: number | null;
  idea_id: string | null;
};

export type CreateFermiEstimateInput = {
  question: string;
  category: string;
  idea_id: string | null;
};

export type CreateReframingSessionInput = {
  topic_text: string;
  context_note: string;
  idea_id: string | null;
};

export function normalizeCreateBayesianBelief(
  raw: unknown
): CreateBayesianBeliefInput {
  if (!raw || typeof raw !== "object") throw new Error("无效输入");
  const input = raw as Record<string, unknown>;
  const question =
    typeof input.question === "string" ? input.question.trim() : "";
  if (!question) throw new Error("信念问题不能为空");
  if (question.length > 500) throw new Error("信念问题不能超过 500 字");
  let prior: number | null = null;
  if (
    input.prior !== undefined &&
    input.prior !== null &&
    input.prior !== ""
  ) {
    const p = parseFloat(String(input.prior));
    if (isNaN(p) || p < 0 || p > 1) {
      throw new Error("先验概率必须是 0 到 1 之间的数字");
    }
    prior = Math.round(p * 10000) / 10000;
  }
  const idea_id =
    typeof input.idea_id === "string" && input.idea_id.trim()
      ? input.idea_id.trim()
      : null;
  return { question, prior, idea_id };
}

export function normalizeCreateFermiEstimate(
  raw: unknown
): CreateFermiEstimateInput {
  if (!raw || typeof raw !== "object") throw new Error("无效输入");
  const input = raw as Record<string, unknown>;
  const question =
    typeof input.question === "string" ? input.question.trim() : "";
  if (!question) throw new Error("估算问题不能为空");
  if (question.length > 500) throw new Error("估算问题不能超过 500 字");
  const category =
    typeof input.category === "string" && input.category.trim()
      ? input.category.trim()
      : "market";
  const idea_id =
    typeof input.idea_id === "string" && input.idea_id.trim()
      ? input.idea_id.trim()
      : null;
  return { question, category, idea_id };
}

export function normalizeCreateReframingSession(
  raw: unknown
): CreateReframingSessionInput {
  if (!raw || typeof raw !== "object") throw new Error("无效输入");
  const input = raw as Record<string, unknown>;
  const topic_text =
    typeof input.topic_text === "string" ? input.topic_text.trim() : "";
  if (!topic_text) throw new Error("课题描述不能为空");
  if (topic_text.length > 1000) throw new Error("课题描述不能超过 1000 字");
  const context_note =
    typeof input.context_note === "string" ? input.context_note.trim() : "";
  const idea_id =
    typeof input.idea_id === "string" && input.idea_id.trim()
      ? input.idea_id.trim()
      : null;
  return { topic_text, context_note, idea_id };
}

export function assertFermiComponentValues(low: number, high: number): void {
  if (!isFinite(low) || !isFinite(high)) {
    throw new Error("组成部分值必须是有限数字");
  }
  if (low <= 0 || high <= 0) {
    throw new Error("组成部分值必须大于 0");
  }
  if (low > high) {
    throw new Error("低值不能大于高值");
  }
}

export function assertLinkedIdeaOwner(
  linkedOwnerId: string | null,
  userId: string
): void {
  if (linkedOwnerId !== null && linkedOwnerId !== userId) {
    throw new Error("无权关联该想法");
  }
}
