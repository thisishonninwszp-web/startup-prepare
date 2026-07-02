"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { nextCouncilTurn } from "@/lib/ai";
import {
  normalizeCreateCouncilSession,
  normalizeCreateCustomPersona,
  slugifyPersonaName,
} from "./validation";
import type { CouncilMessage } from "./types";

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

async function requireOwnedOptionalIdea(
  ideaId: string | null,
  userId: string
): Promise<void> {
  if (!ideaId) return;
  const { data, error } = await supabaseAdmin
    .from("ideas")
    .select("user_id")
    .eq("id", ideaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) throw new Error("无权关联该想法");
}

async function requireOwnedSession(
  sessionId: string,
  userId: string
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("council_sessions")
    .select("user_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) throw new Error("无权访问该会话");
}

export async function createCustomPersona(input: {
  displayName: string;
  groundingNote: string;
}): Promise<{ key: string }> {
  const userId = await requireUserId();
  const { displayName, groundingNote } = normalizeCreateCustomPersona(input);

  const base = slugifyPersonaName(displayName);
  let key = `${base}-${userId.slice(0, 8)}`;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("council_personas")
    .select("key")
    .eq("key", key)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) key = `${base}-${userId.slice(0, 8)}-${Date.now().toString(36)}`;

  const { error } = await supabaseAdmin.from("council_personas").insert({
    key,
    display_name: displayName,
    is_builtin: false,
    grounding_note: groundingNote,
    owner_user_id: userId,
  });
  if (error) {
    console.error("创建自定义顾问失败", error.message);
    throw new Error("创建失败，请重试");
  }

  revalidatePath("/council/new");
  return { key };
}

export async function createCouncilSession(input: {
  ideaId: string | null;
  personaKeys: string[];
  title?: string;
}): Promise<{ id: string }> {
  const userId = await requireUserId();
  const { ideaId, personaKeys, title } = normalizeCreateCouncilSession({
    ideaId: input.ideaId,
    personaKeys: input.personaKeys,
    title: input.title ?? "",
  });

  await requireOwnedOptionalIdea(ideaId, userId);

  const { data: personas, error: personasError } = await supabaseAdmin
    .from("council_personas")
    .select("key, is_builtin, owner_user_id")
    .in("key", personaKeys);
  if (personasError) throw new Error(personasError.message);
  for (const key of personaKeys) {
    const persona = (personas ?? []).find((p) => p.key === key);
    if (!persona) throw new Error(`顾问 "${key}" 不存在`);
    if (!persona.is_builtin && persona.owner_user_id !== userId) {
      throw new Error(`无权邀请顾问 "${key}"`);
    }
  }

  const { data: sess, error: sessError } = await supabaseAdmin
    .from("council_sessions")
    .insert({ user_id: userId, idea_id: ideaId, title })
    .select("id")
    .single();
  if (sessError) {
    console.error("创建顾问团会话失败", sessError.message);
    throw new Error("创建失败，请重试");
  }

  const { error: joinError } = await supabaseAdmin
    .from("council_session_personas")
    .insert(
      personaKeys.map((key) => ({
        session_id: sess.id,
        persona_key: key,
        turns_since_last_spoke: 0,
      }))
    );
  if (joinError) {
    console.error("邀请顾问入场失败", joinError.message);
    await supabaseAdmin.from("council_sessions").delete().eq("id", sess.id).eq("user_id", userId);
    throw new Error("创建失败，请重试");
  }

  revalidatePath("/council");
  return { id: sess.id };
}

export async function sendCouncilMessage(input: {
  sessionId: string;
  content: string;
  idempotencyKey: string;
}): Promise<{ replies: CouncilMessage[] }> {
  const userId = await requireUserId();
  await requireOwnedSession(input.sessionId, userId);

  const content = input.content.trim();
  if (!content) throw new Error("消息不能为空");
  if (content.length > 2000) throw new Error("消息不能超过 2000 字");

  const key = input.idempotencyKey.trim();
  if (!key) throw new Error("缺少幂等键");

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("council_messages")
    .select("id")
    .eq("session_id", input.sessionId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  if (!existing) {
    const { error: insertError } = await supabaseAdmin.from("council_messages").insert({
      session_id: input.sessionId,
      user_id: userId,
      role: "user",
      content,
      idempotency_key: key,
    });
    if (insertError) {
      const { data: raced, error: racedError } = await supabaseAdmin
        .from("council_messages")
        .select("id")
        .eq("session_id", input.sessionId)
        .eq("idempotency_key", key)
        .maybeSingle();
      if (racedError) throw new Error(racedError.message);
      if (!raced) throw new Error(insertError.message);
    }
  }

  const { data: joined, error: joinedError } = await supabaseAdmin
    .from("council_session_personas")
    .select("persona_key, turns_since_last_spoke")
    .eq("session_id", input.sessionId);
  if (joinedError) throw new Error(joinedError.message);
  if (!joined || joined.length === 0) throw new Error("该会话没有邀请任何顾问");

  const personaKeys = joined.map((j) => j.persona_key);
  const { data: personaRows, error: personaRowsError } = await supabaseAdmin
    .from("council_personas")
    .select("key, display_name, grounding_note")
    .in("key", personaKeys);
  if (personaRowsError) throw new Error(personaRowsError.message);

  const { data: historyRows, error: historyError } = await supabaseAdmin
    .from("council_messages")
    .select("role, persona_key, content")
    .eq("session_id", input.sessionId)
    .order("created_at", { ascending: true })
    .limit(60);
  if (historyError) throw new Error(historyError.message);

  const personas = joined.map((j) => {
    const row = (personaRows ?? []).find((p) => p.key === j.persona_key);
    return {
      key: j.persona_key,
      display_name: row?.display_name ?? j.persona_key,
      grounding_note: row?.grounding_note ?? "",
      turns_since_last_spoke: j.turns_since_last_spoke,
    };
  });

  const history = (historyRows ?? []).map((m) => ({
    role: m.role as "user" | "persona",
    persona_key: m.persona_key ?? null,
    content: m.content,
  }));

  const turn = await nextCouncilTurn({ personas, history, latestMessage: content });

  const { data: insertedReplies, error: repliesError } = await supabaseAdmin
    .from("council_messages")
    .insert(
      turn.replies.map((r) => ({
        session_id: input.sessionId,
        user_id: userId,
        role: "persona" as const,
        persona_key: r.persona_key,
        grounded_reference: r.grounded_reference,
        content: r.content,
        sharpest_question: r.sharpest_question,
      }))
    )
    .select(
      "id, session_id, role, persona_key, grounded_reference, content, sharpest_question, created_at"
    );
  if (repliesError) {
    console.error("插入顾问发言失败", repliesError.message);
    throw new Error("顾问发言保存失败，请重试");
  }

  const spokeKeys = new Set(turn.replies.map((r) => r.persona_key));
  const counterResults = await Promise.all(
    personaKeys.map((personaKey) =>
      supabaseAdmin
        .from("council_session_personas")
        .update({
          turns_since_last_spoke: spokeKeys.has(personaKey)
            ? 0
            : (joined.find((j) => j.persona_key === personaKey)?.turns_since_last_spoke ?? 0) + 1,
        })
        .eq("session_id", input.sessionId)
        .eq("persona_key", personaKey)
    )
  );
  for (const result of counterResults) {
    if (result.error) {
      console.error("更新顾问发言间隔计数失败", result.error.message);
    }
  }

  const { error: touchError } = await supabaseAdmin
    .from("council_sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", input.sessionId);
  if (touchError) {
    console.error("更新会话时间戳失败", touchError.message);
  }

  revalidatePath(`/council/${input.sessionId}`);

  return {
    replies: (insertedReplies ?? []).map((m) => ({
      id: m.id,
      session_id: m.session_id,
      role: m.role as "user" | "persona",
      persona_key: m.persona_key ?? null,
      grounded_reference: m.grounded_reference,
      content: m.content,
      sharpest_question: m.sharpest_question ?? null,
      created_at: m.created_at,
    })),
  };
}

export async function archiveCouncilSession(sessionId: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabaseAdmin
    .from("council_sessions")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId);
  if (error) {
    console.error("归档顾问团会话失败", error.message);
    throw new Error("归档失败，请重试");
  }
  revalidatePath("/council");
}
