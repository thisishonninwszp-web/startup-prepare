"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { challenge, draftExperiment, preMortem, realityCheck, suggestKnowledgeCards } from "@/lib/ai";
import { getRelevantKnowledgeCards } from "@/app/knowledge/queries";
import { tavilySearch } from "@/lib/external";
import {
  AI_ROLES,
  HYPOTHESIS_FIELDS,
  IDEA_STATUSES,
  SIGNAL_VALUES,
  VERDICTS,
  isAiLocked,
  isHypothesisComplete,
  type AiRole,
  type ChatTurn,
  type ExitCriterion,
  type Hypothesis,
  type Idea,
  type IdeaStatus,
  type DeathMode,
  type LearningLog,
  type Prediction,
  type PredictionOutcome,
  type RealityCheckResult,
  type SignalValue,
  type Validation,
  type Verdict,
  OBSERVATION_PROMOTED_TAG,
  observationSourceTag,
  visibleTags,
} from "./types";

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

async function assertOwnsIdea(ideaId: string, userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("ideas")
    .select("user_id")
    .eq("id", ideaId)
    .single();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) throw new Error("无权访问该想法");
}

/**
 * 拖拽改变想法状态。
 * 拖入"验证中"时同时刷新 last_activity_at（为第 5 阶段的强制出口机制埋点）。
 */
export async function updateIdeaStatus(
  ideaId: string,
  status: IdeaStatus
): Promise<void> {
  if (!IDEA_STATUSES.includes(status)) throw new Error("非法状态");

  const userId = await requireUserId();
  await assertOwnsIdea(ideaId, userId);

  const patch: { status: IdeaStatus; last_activity_at?: string } = { status };
  if (status === "验证中") {
    // 门禁：假设句式未填满，不能进入"验证中"（可证伪性原则）。
    const { data: row, error: hErr } = await supabaseAdmin
      .from("ideas")
      .select("hypothesis")
      .eq("id", ideaId)
      .single();
    if (hErr) throw new Error(hErr.message);
    if (!isHypothesisComplete(row?.hypothesis as Hypothesis)) {
      throw new Error("假设句式未填满，无法进入“验证中”。");
    }
    // 门禁：没有预先写下退出条件，不能进入"验证中"（反事后合理化）。
    const { count, error: critErr } = await supabaseAdmin
      .from("idea_exit_criteria")
      .select("id", { count: "exact", head: true })
      .eq("idea_id", ideaId)
      .eq("user_id", userId);
    if (critErr) throw new Error(critErr.message);
    if ((count ?? 0) === 0) {
      throw new Error(
        "进入“验证中”之前，先写下至少一条退出条件：出现什么情况你就杀掉这个想法。"
      );
    }
    patch.last_activity_at = new Date().toISOString();
  }

  const { error } = await supabaseAdmin
    .from("ideas")
    .update(patch)
    .eq("id", ideaId);
  if (error) throw new Error(error.message);
}

/**
 * 把一条观察"提升"为想法：创建一条 ideas 记录，初始 status='观察'，
 * 标题取观察原文，标签从来源观察继承。
 */
export async function promoteObservationToIdea(
  observationId: string
): Promise<Idea> {
  const userId = await requireUserId();

  const { data: obs, error: obsError } = await supabaseAdmin
    .from("observations")
    .select("user_id, raw_text, tags")
    .eq("id", observationId)
    .single();
  if (obsError) throw new Error(obsError.message);
  if (!obs || obs.user_id !== userId) throw new Error("无权访问该观察");

  const sourceTag = observationSourceTag(observationId);
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("ideas")
    .select("id, title, status, tags, created_at, last_activity_at")
    .eq("user_id", userId)
    .contains("tags", [sourceTag])
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  const observationTags = (obs.tags ?? []) as string[];
  const promotedTags = Array.from(
    new Set([...observationTags, OBSERVATION_PROMOTED_TAG])
  );
  if (existing) {
    const { error: markerError } = await supabaseAdmin
      .from("observations")
      .update({ tags: promotedTags })
      .eq("id", observationId)
      .eq("user_id", userId);
    if (markerError) throw new Error(markerError.message);
    return { ...existing, tags: visibleTags(existing.tags ?? []) } as Idea;
  }

  const { data, error } = await supabaseAdmin
    .from("ideas")
    .insert({
      user_id: userId,
      title: obs.raw_text,
      status: "观察",
      tags: [...visibleTags(observationTags), sourceTag],
    })
    .select("id, title, status, tags, created_at, last_activity_at")
    .single();
  if (error) throw new Error(error.message);

  const { error: markerError } = await supabaseAdmin
    .from("observations")
    .update({ tags: promotedTags })
    .eq("id", observationId)
    .eq("user_id", userId);
  if (markerError) throw new Error(markerError.message);

  return { ...data, tags: visibleTags(data.tags ?? []) } as Idea;
}

/**
 * 保存假设句式（含最关键假设）。整体覆盖 ideas.hypothesis。
 */
export async function updateHypothesis(
  ideaId: string,
  hypothesis: Hypothesis
): Promise<void> {
  const userId = await requireUserId();
  await assertOwnsIdea(ideaId, userId);

  const { error } = await supabaseAdmin
    .from("ideas")
    .update({ hypothesis: sanitizeHypothesis(hypothesis) })
    .eq("id", ideaId);
  if (error) throw new Error(error.message);
}

/** 只保留已知字段、去空白，避免写入脏数据。 */
function sanitizeHypothesis(hypothesis: Hypothesis): Hypothesis {
  const clean: Hypothesis = {};
  for (const f of HYPOTHESIS_FIELDS) {
    const v = (hypothesis[f.key] ?? "").trim();
    if (v) clean[f.key] = v;
  }
  const riskiest = (hypothesis.riskiest_assumption ?? "").trim();
  if (riskiest) clean.riskiest_assumption = riskiest;
  const adv = (hypothesis.unfair_advantage ?? "").trim();
  if (adv) clean.unfair_advantage = adv;
  const dist = (hypothesis.distribution ?? "").trim();
  if (dist) clean.distribution = dist;
  const test = (hypothesis.smallest_test ?? "").trim();
  if (test) clean.smallest_test = test;
  return clean;
}

/**
 * 由一个"反复主题"直接创建候选方向（idea）：status='观察'，预填 AI 草拟的假设。
 * 候选方向就是 ideas 表里的一条 idea，不引入新实体。
 */
export async function createIdeaFromTheme(
  title: string,
  hypothesis: Hypothesis,
  tags: string[]
): Promise<Idea> {
  const userId = await requireUserId();

  const { data, error } = await supabaseAdmin
    .from("ideas")
    .insert({
      user_id: userId,
      title: title.trim() || null,
      status: "观察",
      tags,
      hypothesis: sanitizeHypothesis(hypothesis),
    })
    .select("id, title, status, tags, created_at, last_activity_at")
    .single();
  if (error) throw new Error(error.message);

  return data as Idea;
}

/** 把假设渲染成给 AI 的上下文文字。 */
function renderHypothesis(h: Hypothesis): string {
  const v = (k: keyof Hypothesis) => (h[k] ?? "").trim() || "（未填）";
  const sentence =
    `${v("target_user")} 有 ${v("pain")}，现在用 ${v("alternative")} 解决，` +
    `但 ${v("why_insufficient")}，如果有 ${v("solution")}，愿意付 ${v("willingness_to_pay")}。`;
  const extra: string[] = [];
  const riskiest = (h.riskiest_assumption ?? "").trim();
  if (riskiest) extra.push(`最关键假设：${riskiest}`);
  const adv = (h.unfair_advantage ?? "").trim();
  if (adv) extra.push(`不公平优势：${adv}`);
  const dist = (h.distribution ?? "").trim();
  if (dist) extra.push(`分发设想：${dist}`);
  return [sentence, ...extra].join("\n");
}

/**
 * 以某角色对想法发起/继续对抗性质疑。
 * @param userMessage 用户这一轮的回应；null/空 表示开场（让 AI 先开问）
 * @returns 该角色更新后的完整对话
 */
export async function sendRoleMessage(
  ideaId: string,
  role: AiRole,
  userMessage: string | null
): Promise<ChatTurn[]> {
  if (!AI_ROLES.some((r) => r.key === role)) throw new Error("非法角色");

  const userId = await requireUserId();

  const { data: idea, error: ideaErr } = await supabaseAdmin
    .from("ideas")
    .select("user_id, hypothesis, status, last_activity_at, tags")
    .eq("id", ideaId)
    .single();
  if (ideaErr) throw new Error(ideaErr.message);
  if (!idea || idea.user_id !== userId) throw new Error("无权访问该想法");

  // 强制出口机制：被锁定时，服务端也拒绝 AI 质疑（不只是前端置灰）。
  if (isAiLocked(idea.status as IdeaStatus, idea.last_activity_at as string)) {
    throw new Error("AI 质疑已暂停，请先记录一次真实接触。");
  }

  // 取该角色已有的会话（一个 idea+role 一行）。
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("ai_sessions")
    .select("id, messages")
    .eq("idea_id", ideaId)
    .eq("role", role)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  const turns: ChatTurn[] = Array.isArray(existing?.messages)
    ? (existing!.messages as ChatTurn[])
    : [];

  const trimmed = (userMessage ?? "").trim();
  if (trimmed) turns.push({ role: "user", content: trimmed });

  const hypothesis = (idea.hypothesis ?? {}) as Hypothesis;
  const ideaTags = (idea.tags as string[] | null) ?? [];
  const hypothesisText = Object.values(hypothesis).filter(Boolean).join(" ");
  const keywords = [
    ...ideaTags,
    ...hypothesisText.split(/[\s,，、。；：！？]+/).filter((w) => w.length > 1),
  ];
  const knowledgeCards = await getRelevantKnowledgeCards(userId, keywords, 4);
  const knowledgeContext =
    knowledgeCards.length > 0
      ? `\n\n=== 用户积累的上下文知识 ===\n${knowledgeCards.map((c) => `[${c.card_type === "market" ? "市场事实" : c.card_type === "customer" ? "顾客规律" : c.card_type === "judgment" ? "判断历史" : "领域知识"}] ${c.content}`).join("\n")}`
      : "";

  const context = renderHypothesis(hypothesis) + knowledgeContext;
  const reply = await challenge(role, context, turns);
  turns.push({ role: "assistant", content: reply });

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from("ai_sessions")
      .update({ messages: turns })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabaseAdmin
      .from("ai_sessions")
      .insert({ idea_id: ideaId, role, messages: turns });
    if (error) throw new Error(error.message);
  }

  return turns;
}

/**
 * 记录一次真实接触。只有两个二元信号 + 选填备注（宪法第 4 条，不做多级分类）。
 * 同时刷新所属想法的 last_activity_at——这是强制出口机制解锁的唯一途径。
 */
export async function addValidation(
  ideaId: string,
  hasPain: SignalValue,
  willPay: SignalValue,
  note: string
): Promise<Validation> {
  const valid = (v: string) => SIGNAL_VALUES.some((s) => s.key === v);
  if (!valid(hasPain) || !valid(willPay)) throw new Error("非法信号值");

  const userId = await requireUserId();
  await assertOwnsIdea(ideaId, userId);

  const { data, error } = await supabaseAdmin
    .from("validations")
    .insert({
      idea_id: ideaId,
      has_pain: hasPain,
      will_pay: willPay,
      note: note.trim() || null,
    })
    .select("id, has_pain, will_pay, note, contacted_at")
    .single();
  if (error) throw new Error(error.message);

  // 真实接触刷新活动时间 → 解除强制出口锁定。
  const { error: updErr } = await supabaseAdmin
    .from("ideas")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", ideaId);
  if (updErr) throw new Error(updErr.message);

  return data as Validation;
}

/**
 * 验证记录提交后，AI 从备注中提炼知识卡片建议（最多 2 条）。
 * 客户端可在 addValidation 成功后异步调用此函数以不阻塞主流程。
 */
export async function suggestKnowledgeCardsFromValidation(
  note: string
): Promise<import("@/lib/ai").KnowledgeCardSuggestion[]> {
  if (!note.trim()) return [];
  await requireUserId();
  return suggestKnowledgeCards(note);
}

/** Go/Pivot/Kill/Hold 对应的状态变更（Pivot/Hold 不改状态）。 */
const VERDICT_STATUS: Partial<Record<Verdict, IdeaStatus>> = {
  Go: "MVP候选",
  Kill: "归档",
};

/**
 * 记录一次决策。Kill 时附带 Learning Log（宪法第 7 条，用"学到了什么"框定）。
 * @returns 决策后该想法的状态
 */
export async function decide(
  ideaId: string,
  verdict: Verdict,
  learning: LearningLog | null
): Promise<IdeaStatus> {
  if (!VERDICTS.some((v) => v.key === verdict)) throw new Error("非法决策");

  const userId = await requireUserId();
  await assertOwnsIdea(ideaId, userId);

  // Go/Kill 之前必须逐条对照当初写下的退出条件（反事后合理化）。
  if (verdict === "Go" || verdict === "Kill") {
    const { count, error: critErr } = await supabaseAdmin
      .from("idea_exit_criteria")
      .select("id", { count: "exact", head: true })
      .eq("idea_id", ideaId)
      .eq("user_id", userId)
      .eq("triggered", "unreviewed");
    if (critErr) throw new Error(critErr.message);
    if ((count ?? 0) > 0) {
      throw new Error(
        "决策前先对照退出条件：把每一条标记为“触发了”或“没触发”。"
      );
    }
  }

  // 前三项打包进 reason，"学到什么"单独进 learned。
  let reason: string | null = null;
  let learned: string | null = null;
  if (verdict === "Kill" && learning) {
    reason = JSON.stringify({
      original_judgment: learning.original_judgment.trim(),
      validation_action: learning.validation_action.trim(),
      real_result: learning.real_result.trim(),
    });
    learned = learning.learned.trim() || null;
  }

  const { error: decErr } = await supabaseAdmin
    .from("decisions")
    .insert({ idea_id: ideaId, verdict, reason, learned });
  if (decErr) throw new Error(decErr.message);

  const newStatus = VERDICT_STATUS[verdict];
  if (newStatus) {
    const { error: updErr } = await supabaseAdmin
      .from("ideas")
      .update({ status: newStatus })
      .eq("id", ideaId);
    if (updErr) throw new Error(updErr.message);
    return newStatus;
  }

  // Pivot / Hold 不改状态：返回当前状态。
  const { data: row, error } = await supabaseAdmin
    .from("ideas")
    .select("status")
    .eq("id", ideaId)
    .single();
  if (error) throw new Error(error.message);
  return row!.status as IdeaStatus;
}

/**
 * 写下一条带日期的可证伪预测（校准回路）。错了这个方向就死的那种赌注。
 */
export async function createPrediction(
  ideaId: string,
  text: string,
  dueAt: string
): Promise<Prediction> {
  const t = text.trim();
  if (!t) throw new Error("预测内容不能为空");
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) throw new Error("非法日期");

  const userId = await requireUserId();
  await assertOwnsIdea(ideaId, userId);

  const { data, error } = await supabaseAdmin
    .from("predictions")
    .insert({
      idea_id: ideaId,
      user_id: userId,
      source_type: "idea",
      text: t,
      due_at: due.toISOString(),
    })
    .select("id, text, due_at, made_at, outcome, resolved_at, note")
    .single();
  if (error) throw new Error(error.message);

  return data as Prediction;
}

/** 对账：把一条预测标记为命中 / 没命中。 */
export async function resolvePrediction(
  predictionId: string,
  outcome: PredictionOutcome,
  note: string
): Promise<Prediction> {
  if (outcome !== "hit" && outcome !== "miss") throw new Error("非法结论");

  const userId = await requireUserId();
  const { data: pred, error: pErr } = await supabaseAdmin
    .from("predictions")
    .select("idea_id")
    .eq("id", predictionId)
    .single();
  if (pErr) throw new Error(pErr.message);
  if (!pred) throw new Error("预测不存在");
  await assertOwnsIdea(pred.idea_id as string, userId);

  const { data, error } = await supabaseAdmin
    .from("predictions")
    .update({
      outcome,
      resolved_at: new Date().toISOString(),
      note: note.trim() || null,
    })
    .eq("id", predictionId)
    .select("id, text, due_at, made_at, outcome, resolved_at, note")
    .single();
  if (error) throw new Error(error.message);

  return data as Prediction;
}

/** 读该想法的假设，AI 草拟一个本周可做、能证伪最关键假设的最小实验。 */
export async function draftSmallestTest(ideaId: string): Promise<string> {
  const userId = await requireUserId();
  const { data: idea, error } = await supabaseAdmin
    .from("ideas")
    .select("user_id, hypothesis")
    .eq("id", ideaId)
    .single();
  if (error) throw new Error(error.message);
  if (!idea || idea.user_id !== userId) throw new Error("无权访问该想法");
  return draftExperiment(renderHypothesis((idea.hypothesis ?? {}) as Hypothesis));
}

/** 拿该想法的假设做预演死亡，返回最相关的 2-3 种死法。 */
export async function runPreMortem(ideaId: string): Promise<DeathMode[]> {
  const userId = await requireUserId();
  const { data: idea, error } = await supabaseAdmin
    .from("ideas")
    .select("user_id, hypothesis")
    .eq("id", ideaId)
    .single();
  if (error) throw new Error(error.message);
  if (!idea || idea.user_id !== userId) throw new Error("无权访问该想法");
  return preMortem(renderHypothesis((idea.hypothesis ?? {}) as Hypothesis));
}

/** 方向现实检验：联网搜该方向 → 对抗性简报 + 来源。 */
export async function runRealityCheck(
  ideaId: string
): Promise<RealityCheckResult> {
  const userId = await requireUserId();
  const { data: idea, error } = await supabaseAdmin
    .from("ideas")
    .select("user_id, hypothesis")
    .eq("id", ideaId)
    .single();
  if (error) throw new Error(error.message);
  if (!idea || idea.user_id !== userId) throw new Error("无权访问该想法");

  const h = (idea.hypothesis ?? {}) as Hypothesis;
  const query =
    [h.target_user, h.pain, h.solution]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join(" ")
      .slice(0, 200) || "创业方向";
  const sources = await tavilySearch(query);
  return realityCheck(renderHypothesis(h), sources);
}

// ── 退出条件预承诺 ────────────────────────────────────────────────────────────

/**
 * 添加一条退出条件："出现什么情况我就杀掉这个想法"。
 * 任何阶段都可以补充，但进入"验证中"至少要有一条。
 */
export async function addExitCriterion(
  ideaId: string,
  text: string
): Promise<ExitCriterion> {
  const userId = await requireUserId();
  await assertOwnsIdea(ideaId, userId);

  const criterion = text.trim();
  if (!criterion) throw new Error("退出条件不能为空");
  if (criterion.length > 200) throw new Error("退出条件不能超过 200 字");

  const { data, error } = await supabaseAdmin
    .from("idea_exit_criteria")
    .insert({ idea_id: ideaId, user_id: userId, criterion })
    .select("id, criterion, triggered, reviewed_at, created_at")
    .single();
  if (error) throw new Error(error.message);
  return data as ExitCriterion;
}

/**
 * 删除一条退出条件。只允许在进入"验证中"之前删除——
 * 一旦开始验证，预先承诺就锁定，防止中途悄悄放宽标准。
 */
export async function deleteExitCriterion(criterionId: string): Promise<void> {
  const userId = await requireUserId();

  const { data: row, error: rowErr } = await supabaseAdmin
    .from("idea_exit_criteria")
    .select("id, idea_id, user_id")
    .eq("id", criterionId)
    .maybeSingle();
  if (rowErr) throw new Error(rowErr.message);
  if (!row || row.user_id !== userId) throw new Error("无权删除该退出条件");

  const { data: idea, error: ideaErr } = await supabaseAdmin
    .from("ideas")
    .select("status")
    .eq("id", row.idea_id)
    .single();
  if (ideaErr) throw new Error(ideaErr.message);
  if (idea.status === "验证中") {
    throw new Error("验证已经开始，退出条件不能再删除——这正是预先承诺的意义。");
  }

  const { error } = await supabaseAdmin
    .from("idea_exit_criteria")
    .delete()
    .eq("id", criterionId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/**
 * 决策前对照：把一条退出条件标记为"触发了 / 没触发"。二元，不打分。
 */
export async function reviewExitCriterion(
  criterionId: string,
  triggered: "yes" | "no"
): Promise<void> {
  if (triggered !== "yes" && triggered !== "no") throw new Error("非法标记");
  const userId = await requireUserId();

  const { data: row, error: rowErr } = await supabaseAdmin
    .from("idea_exit_criteria")
    .select("id, user_id")
    .eq("id", criterionId)
    .maybeSingle();
  if (rowErr) throw new Error(rowErr.message);
  if (!row || row.user_id !== userId) throw new Error("无权标记该退出条件");

  const { error } = await supabaseAdmin
    .from("idea_exit_criteria")
    .update({ triggered, reviewed_at: new Date().toISOString() })
    .eq("id", criterionId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
