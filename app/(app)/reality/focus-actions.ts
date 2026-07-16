"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { answerFocusedRealityInquiry } from "@/lib/ai";
import {
  hasImmediateSafetyRisk,
  normalizeFocusQuestion,
  shouldFinalizeFocus,
  type RealityFocusLocator,
  type RealityFocusResponse,
} from "./focus";
import {
  getRealityFocusSession,
  loadOwnedFocusAnchor,
} from "./focus-queries";

const FOCUS_SAFETY_MESSAGE =
  "你刚才表达了可能立即伤害自己或他人的危险。请停止使用本工具进行分析，立即联系当地紧急服务，或联系现在能陪在你身边的可信任的人。";

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

export async function createRealityFocusSession(
  caseId: string,
  versionId: string,
  locator: RealityFocusLocator
){
  const userId = await requireUserId();
  const resolved = await loadOwnedFocusAnchor(
    caseId,
    versionId,
    userId,
    locator
  );
  if (!resolved) throw new Error("现状版本不存在或无权访问");
  const { data, error } = await supabaseAdmin
    .from("reality_focus_sessions")
    .insert({
      user_id: userId,
      case_id: caseId,
      version_id: versionId,
      anchor_type: locator.type,
      anchor_index: locator.index,
      anchor_snapshot: resolved.anchor,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(`/reality/${caseId}`);
  return getRealityFocusSession(data.id as string, userId);
}

export async function answerRealityFocus(input: {
  session_id: string;
  question: string;
  client_key: string;
  force_finalize?: boolean;
}) {
  const userId = await requireUserId();
  const question = normalizeFocusQuestion(input.question);
  const sessionBefore = await getRealityFocusSession(input.session_id, userId);
  if (!sessionBefore) throw new Error("聚焦探索不存在或无权访问");

  const { data: turnData, error: reserveError } = await supabaseAdmin.rpc(
    "reserve_reality_focus_turn",
    {
      p_session_id: input.session_id,
      p_user_id: userId,
      p_question: question,
      p_client_key: input.client_key,
    }
  );
  if (reserveError) throw new Error(reserveError.message);
  const turnNo = Number(turnData);
  const existingReply = sessionBefore.messages.find(
    (message) =>
      message.turn_no === turnNo &&
      (message.role === "assistant" || message.role === "safety")
  );
  if (existingReply) return sessionBefore;

  if (hasImmediateSafetyRisk(question)) {
    const payload = { message: FOCUS_SAFETY_MESSAGE };
    const { error } = await supabaseAdmin.rpc(
      "stop_reality_focus_for_safety",
      {
        p_session_id: input.session_id,
        p_user_id: userId,
        p_turn_no: turnNo,
        p_payload: payload,
      }
    );
    if (error) throw new Error(error.message);
    revalidatePath(`/reality/${sessionBefore.case_id}`);
    return getRealityFocusSession(input.session_id, userId);
  }

  const resolved = await loadOwnedFocusAnchor(
    sessionBefore.case_id,
    sessionBefore.version_id,
    userId,
    {
      type: sessionBefore.anchor.type,
      index: sessionBefore.anchor.index,
    }
  );
  if (!resolved) throw new Error("聚焦探索来源版本不存在");
  const finalize = shouldFinalizeFocus(
    turnNo,
    Boolean(input.force_finalize)
  );
  const history = sessionBefore.messages
    .filter(
      (message) =>
        message.turn_no < turnNo &&
        (message.role === "user" || message.role === "assistant")
    )
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content,
    }));

  let response: RealityFocusResponse;
  try {
    response = await answerFocusedRealityInquiry({
      reality: resolved.map,
      anchor: resolved.anchor,
      history,
      question,
      turn_no: turnNo,
      finalize,
    });
  } catch (cause) {
    console.error("聚焦探索问题已保存，但AI回答失败", {
      sessionId: input.session_id,
      turnNo,
      cause,
    });
    throw new Error("问题已保存，但AI回答失败。请直接重试。");
  }
  const { error: completeError } = await supabaseAdmin.rpc(
    "complete_reality_focus_turn",
    {
      p_session_id: input.session_id,
      p_user_id: userId,
      p_turn_no: turnNo,
      p_payload: response,
      p_is_final: response.is_final,
      p_summary: response.summary,
    }
  );
  if (completeError) {
    console.error("聚焦探索问题已保存，但AI回答写入失败", {
      sessionId: input.session_id,
      turnNo,
      error: completeError.message,
    });
    throw new Error("问题已保存，但AI回答写入失败。请直接重试。");
  }
  revalidatePath(`/reality/${sessionBefore.case_id}`);
  return getRealityFocusSession(input.session_id, userId);
}

export async function setRealityFocusExports(input: {
  session_id: string;
  include_in_closure: boolean;
  include_in_next_version: boolean;
}): Promise<void> {
  const userId = await requireUserId();
  const session = await getRealityFocusSession(input.session_id, userId);
  if (!session || session.status !== "completed") {
    throw new Error("只有已完成的聚焦探索可以导出");
  }
  const { error } = await supabaseAdmin
    .from("reality_focus_sessions")
    .update({
      include_in_closure: input.include_in_closure,
      include_in_next_version: input.include_in_next_version,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.session_id)
    .eq("user_id", userId)
    .eq("status", "completed");
  if (error) throw new Error(error.message);
  revalidatePath(`/reality/${session.case_id}`);
}
