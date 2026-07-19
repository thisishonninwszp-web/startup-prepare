"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { battleRecap, demonOpening, demonTurn } from "@/lib/ai";
import type { BattleMessage } from "./types";
import { getBattleSession } from "./queries";

/** 软上限：第 8 个用户回合后心魔强制词穷。 */
const MAX_USER_TURNS = 8;

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

async function requireActiveBattle(sessionId: string, userId: string) {
  const session = await getBattleSession(sessionId, userId);
  if (!session) throw new Error("对战不存在或无权访问");
  if (session.status !== "active") throw new Error("这场对战已经结束了");
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

async function saveMessages(sessionId: string, messages: BattleMessage[]) {
  const { error } = await supabaseAdmin
    .from("battle_sessions")
    .update({ messages })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}

/** 复盘并结束。复盘 AI 失败时对战停在 active，可从 UI 重试收兵。 */
async function concludeWithRecap(session: {
  id: string;
  claim: string;
  messages: BattleMessage[];
}) {
  const recap = await battleRecap({ claim: session.claim, messages: session.messages });
  const { error } = await supabaseAdmin
    .from("battle_sessions")
    .update({
      recap,
      status: "concluded",
      concluded_at: new Date().toISOString(),
    })
    .eq("id", session.id);
  if (error) throw new Error(error.message);
}

/** 立主张：心魔开盘陈词成功后才落库（失败时表单文本在客户端可重试）。 */
export async function createBattle(input: {
  claim: string;
  ideaId?: string | null;
}): Promise<{ sessionId: string }> {
  const userId = await requireUserId();
  const claim = input.claim.trim();
  if (!claim) throw new Error("先写下你想信的那个主张");
  const ideaId = input.ideaId?.trim() || null;
  await requireOwnedOptionalIdea(ideaId, userId);

  const opening = await demonOpening(claim);
  const messages: BattleMessage[] = [
    {
      role: "demon",
      content: opening.content,
      fallacies: opening.fallacies,
      out_of_excuses: false,
    },
  ];
  const { data, error } = await supabaseAdmin
    .from("battle_sessions")
    .insert({ user_id: userId, idea_id: ideaId, claim, messages, status: "active" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/battle");
  return { sessionId: data.id as string };
}

/**
 * 进攻一回合。先落用户消息（AI 失败进攻不丢），再落心魔回合；
 * 心魔词穷或达软上限时接着跑复盘并结束。
 */
export async function attack(input: { sessionId: string; attack: string }): Promise<void> {
  const userId = await requireUserId();
  const session = await requireActiveBattle(input.sessionId, userId);
  const attackText = input.attack.trim();
  if (!attackText) throw new Error("先写下你的进攻");

  const withUser: BattleMessage[] = [
    ...session.messages,
    { role: "user", content: attackText },
  ];
  await saveMessages(session.id, withUser);

  const turn = await demonTurn({
    claim: session.claim,
    history: session.messages,
    attack: attackText,
  });
  const userTurns = withUser.filter((m) => m.role === "user").length;
  const outOfExcuses = turn.out_of_excuses || userTurns >= MAX_USER_TURNS;
  const withDemon: BattleMessage[] = [
    ...withUser,
    {
      role: "demon",
      content: turn.content,
      fallacies: turn.fallacies,
      out_of_excuses: outOfExcuses,
    },
  ];
  await saveMessages(session.id, withDemon);

  if (outOfExcuses) {
    await concludeWithRecap({ id: session.id, claim: session.claim, messages: withDemon });
  }
  revalidatePath("/battle");
}

/** 收兵：随时可结束；也用于心魔已词穷但复盘失败后的重试。 */
export async function concede(input: { sessionId: string }): Promise<void> {
  const userId = await requireUserId();
  const session = await requireActiveBattle(input.sessionId, userId);
  await concludeWithRecap(session);
  revalidatePath("/battle");
}

/** 亲笔立场（主产物），concluded 后可反复修订覆盖。 */
export async function saveFinalPosition(input: {
  sessionId: string;
  finalPosition: string;
}): Promise<void> {
  const userId = await requireUserId();
  const session = await getBattleSession(input.sessionId, userId);
  if (!session) throw new Error("对战不存在或无权访问");
  if (session.status !== "concluded") throw new Error("先结束对战再写立场");
  const finalPosition = input.finalPosition.trim();
  if (!finalPosition) throw new Error("立场不能是空的");
  const { error } = await supabaseAdmin
    .from("battle_sessions")
    .update({ final_position: finalPosition })
    .eq("id", session.id);
  if (error) throw new Error(error.message);
  revalidatePath("/battle");
}

/** 亲笔"学到了"，沉淀进 /learnings。 */
export async function saveBattleLearned(input: {
  sessionId: string;
  learned: string;
}): Promise<void> {
  const userId = await requireUserId();
  const session = await getBattleSession(input.sessionId, userId);
  if (!session) throw new Error("对战不存在或无权访问");
  if (session.status !== "concluded") throw new Error("先结束对战再总结");
  const learned = input.learned.trim();
  if (!learned) throw new Error("总结不能为空");
  const { error } = await supabaseAdmin
    .from("battle_sessions")
    .update({ learned })
    .eq("id", session.id);
  if (error) throw new Error(error.message);
  revalidatePath("/battle");
  revalidatePath("/learnings");
}
