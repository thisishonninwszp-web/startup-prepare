"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { challenge } from "@/lib/ai";
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
  type Hypothesis,
  type Idea,
  type IdeaStatus,
  type LearningLog,
  type SignalValue,
  type Validation,
  type Verdict,
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

  const { data, error } = await supabaseAdmin
    .from("ideas")
    .insert({
      user_id: userId,
      title: obs.raw_text,
      status: "观察",
      tags: obs.tags ?? [],
    })
    .select("id, title, status, tags, created_at, last_activity_at")
    .single();
  if (error) throw new Error(error.message);

  return data as Idea;
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

  // 仅保留已知字段，避免写入脏数据。
  const clean: Hypothesis = {};
  for (const f of HYPOTHESIS_FIELDS) {
    const v = (hypothesis[f.key] ?? "").trim();
    if (v) clean[f.key] = v;
  }
  const riskiest = (hypothesis.riskiest_assumption ?? "").trim();
  if (riskiest) clean.riskiest_assumption = riskiest;

  const { error } = await supabaseAdmin
    .from("ideas")
    .update({ hypothesis: clean })
    .eq("id", ideaId);
  if (error) throw new Error(error.message);
}

/** 把假设渲染成给 AI 的上下文文字。 */
function renderHypothesis(h: Hypothesis): string {
  const v = (k: keyof Hypothesis) => (h[k] ?? "").trim() || "（未填）";
  const sentence =
    `${v("target_user")} 有 ${v("pain")}，现在用 ${v("alternative")} 解决，` +
    `但 ${v("why_insufficient")}，如果有 ${v("solution")}，愿意付 ${v("willingness_to_pay")}。`;
  const riskiest = (h.riskiest_assumption ?? "").trim();
  return riskiest ? `${sentence}\n最关键假设：${riskiest}` : sentence;
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
    .select("user_id, hypothesis, status, last_activity_at")
    .eq("id", ideaId)
    .single();
  if (ideaErr) throw new Error(ideaErr.message);
  if (!idea || idea.user_id !== userId) throw new Error("无权访问该想法");

  // 强制出口机制：被锁定时，服务端也拒绝 AI 质疑（不只是前端置灰）。
  if (isAiLocked(idea.status as IdeaStatus, idea.last_activity_at as string)) {
    throw new Error("AI 质疑已暂停，请先记录一次真实接触。");
  }

  // 取该角色已有的会话（一个 idea+role 一行）。
  const { data: existing } = await supabaseAdmin
    .from("ai_sessions")
    .select("id, messages")
    .eq("idea_id", ideaId)
    .eq("role", role)
    .maybeSingle();

  const turns: ChatTurn[] = Array.isArray(existing?.messages)
    ? (existing!.messages as ChatTurn[])
    : [];

  const trimmed = (userMessage ?? "").trim();
  if (trimmed) turns.push({ role: "user", content: trimmed });

  const context = renderHypothesis((idea.hypothesis ?? {}) as Hypothesis);
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
