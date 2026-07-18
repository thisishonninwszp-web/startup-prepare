"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { critiqueOwnPlan, expandOwnPlan, generateDecoyPlan, revealDecoy } from "@/lib/ai";
import {
  DEFAULT_DECOY_STYLE,
  isDecoyStyle,
  parseDecoyPlan,
  type DecoySessionStatus,
} from "./types";
import { getDecoySession } from "./queries";

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

async function requireSession(sessionId: string, userId: string, allowed: DecoySessionStatus[]) {
  const session = await getDecoySession(sessionId, userId);
  if (!session) throw new Error("练习不存在或无权访问");
  if (!allowed.includes(session.status)) {
    throw new Error(`当前阶段（${session.status}）不允许此操作`);
  }
  return session;
}

async function requireOwnedOptionalIdea(ideaId: string | null, userId: string) {
  if (!ideaId) return;
  const { data, error } = await supabaseAdmin
    .from("ideas")
    .select("user_id")
    .eq("id", ideaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) throw new Error("无权关联该想法");
}

/** 出题：AI 先生成，成功才落库（失败时表单文本还在客户端，可重试）。 */
export async function createDecoySession(input: {
  problem: string;
  ideaId?: string | null;
  style?: string;
}): Promise<{ sessionId: string }> {
  const userId = await requireUserId();
  const problem = input.problem.trim();
  if (!problem) throw new Error("先写下卡住你的问题");
  const ideaId = input.ideaId?.trim() || null;
  await requireOwnedOptionalIdea(ideaId, userId);
  const style = isDecoyStyle(input.style) ? input.style : DEFAULT_DECOY_STYLE;

  const plan = await generateDecoyPlan(problem, style);
  const { data, error } = await supabaseAdmin
    .from("decoy_sessions")
    .insert({
      user_id: userId,
      idea_id: ideaId,
      problem,
      plan: { ...plan, style },
      status: "drafted",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/decoy");
  return { sessionId: data.id as string };
}

/** 质疑 + 揭底。先落质疑（challenged），AI 失败时质疑不丢，可重试揭底。 */
export async function submitChallenges(input: {
  sessionId: string;
  challenges: string;
}): Promise<void> {
  const userId = await requireUserId();
  const session = await requireSession(input.sessionId, userId, ["drafted", "challenged"]);
  const challenges = input.challenges.trim();
  if (!challenges) throw new Error("先写下你的质疑，再揭底");

  const { error: saveError } = await supabaseAdmin
    .from("decoy_sessions")
    .update({ challenges, status: "challenged" })
    .eq("id", session.id);
  if (saveError) throw new Error(saveError.message);

  const reveal = await revealDecoy({
    problem: session.problem,
    plan: parseDecoyPlan(session.plan),
    challenges,
  });
  const { error } = await supabaseAdmin
    .from("decoy_sessions")
    .update({ reveal, status: "revealed", revealed_at: new Date().toISOString() })
    .eq("id", session.id);
  if (error) throw new Error(error.message);
  revalidatePath("/decoy");
}

/** challenged 卡住时（揭底 AI 失败后刷新）重试揭底。 */
export async function retryReveal(input: { sessionId: string }): Promise<void> {
  const userId = await requireUserId();
  const session = await requireSession(input.sessionId, userId, ["challenged"]);
  if (!session.challenges) throw new Error("没有已保存的质疑");
  await submitChallenges({ sessionId: session.id, challenges: session.challenges });
}

/** 写自己的方案（主产物）+ AI 一次性质疑。同样两段落库。 */
export async function submitOwnPlan(input: {
  sessionId: string;
  ownPlan: string;
}): Promise<void> {
  const userId = await requireUserId();
  const session = await requireSession(input.sessionId, userId, ["revealed", "drafting_own"]);
  const ownPlan = input.ownPlan.trim();
  if (!ownPlan) throw new Error("这一步的产物是你自己的方案，不能空着");

  const { error: saveError } = await supabaseAdmin
    .from("decoy_sessions")
    .update({ own_plan: ownPlan, status: "drafting_own" })
    .eq("id", session.id);
  if (saveError) throw new Error(saveError.message);

  const critique = await critiqueOwnPlan({ problem: session.problem, ownPlan });
  const { error } = await supabaseAdmin
    .from("decoy_sessions")
    .update({
      own_plan_critique: critique,
      status: "concluded",
      concluded_at: new Date().toISOString(),
    })
    .eq("id", session.id);
  if (error) throw new Error(error.message);
  revalidatePath("/decoy");
}

/** drafting_own 卡住时重试质疑。 */
export async function retryCritique(input: { sessionId: string }): Promise<void> {
  const userId = await requireUserId();
  const session = await requireSession(input.sessionId, userId, ["drafting_own"]);
  if (!session.own_plan) throw new Error("没有已保存的方案");
  await submitOwnPlan({ sessionId: session.id, ownPlan: session.own_plan });
}

/** 结束后修订自己的方案：直接覆盖，不触发新质疑（spec/YAGNI）。 */
export async function reviseOwnPlan(input: {
  sessionId: string;
  ownPlan: string;
}): Promise<void> {
  const userId = await requireUserId();
  const session = await requireSession(input.sessionId, userId, ["concluded"]);
  const ownPlan = input.ownPlan.trim();
  if (!ownPlan) throw new Error("方案不能改成空的");
  const { error } = await supabaseAdmin
    .from("decoy_sessions")
    .update({ own_plan: ownPlan })
    .eq("id", session.id);
  if (error) throw new Error(error.message);
  revalidatePath("/decoy");
}

/** 可选扩写定稿。可重复调用，覆盖旧定稿。 */
export async function expandFinalPlan(input: { sessionId: string }): Promise<void> {
  const userId = await requireUserId();
  const session = await requireSession(input.sessionId, userId, ["concluded"]);
  if (!session.own_plan) throw new Error("先写自己的方案");
  const finalPlan = await expandOwnPlan({
    problem: session.problem,
    ownPlan: session.own_plan,
    critique: session.own_plan_critique,
  });
  const { error } = await supabaseAdmin
    .from("decoy_sessions")
    .update({ final_plan: finalPlan })
    .eq("id", session.id);
  if (error) throw new Error(error.message);
  revalidatePath("/decoy");
}

/** 用户亲笔一句总结，沉淀到"学到了"。 */
export async function saveDecoyLearned(input: {
  sessionId: string;
  learned: string;
}): Promise<void> {
  const userId = await requireUserId();
  const session = await requireSession(input.sessionId, userId, ["revealed", "drafting_own", "concluded"]);
  const learned = input.learned.trim();
  if (!learned) throw new Error("总结不能为空");
  const { error } = await supabaseAdmin
    .from("decoy_sessions")
    .update({ learned })
    .eq("id", session.id);
  if (error) throw new Error(error.message);
  revalidatePath("/decoy");
  revalidatePath("/learnings");
}
