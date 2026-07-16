"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  compareRealityVersions,
  nextRealityQuestions,
  synthesizeRealityMap,
  type RealityAiContext,
  type RealityAiSource,
} from "@/lib/ai";
import {
  REALITY_INTERVIEW_SOFT_LIMIT,
  parseRealityMap,
  type RealityMessage,
  type RealitySourceType,
} from "./types";
import {
  appendRealityUpdateMessage,
  assertPathNotSelected,
  assertOwnership,
  normalizeCreateRealityInput,
  normalizePathSelection,
  shouldStopRealityInterview,
  type CreateRealityInput,
  type PathSelectionInput,
} from "./validation";
import { listUnconsumedFocusExports } from "./focus-queries";

export type RealitySourceRef = { type: RealitySourceType; id: string };

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

async function requireOwnedCase(caseId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("reality_cases")
    .select(
      "id, user_id, mode, context, title, initial_statement, domains, messages, archived_at"
    )
    .eq("id", caseId)
    .maybeSingle();
  if (error) {
    console.error("读取现状课题失败", { caseId, error: error.message });
    throw new Error("读取现状课题失败，请重试");
  }
  assertOwnership(data?.user_id, userId, "无权访问该现状课题");
  if (!data) throw new Error("无权访问该现状课题");
  if (data.archived_at) throw new Error("该课题已归档");
  return data;
}

async function snapshotSource(
  ref: RealitySourceRef,
  userId: string
): Promise<Record<string, unknown>> {
  if (ref.type === "observation") {
    const { data, error } = await supabaseAdmin
      .from("observations")
      .select("id, user_id, raw_text, tags, created_at")
      .eq("id", ref.id)
      .single();
    if (error) {
      console.error("读取引用观察失败", { id: ref.id, error: error.message });
    }
    if (!data) {
      throw new Error("无权引用该观察");
    }
    assertOwnership(data.user_id, userId, "无权引用该观察");
    return {
      type: ref.type,
      label: `观察 · ${new Date(data.created_at).toLocaleDateString("zh-CN")}`,
      content: data.raw_text,
      tags: data.tags ?? [],
    };
  }

  if (ref.type === "idea") {
    const { data, error } = await supabaseAdmin
      .from("ideas")
      .select("id, user_id, title, status, hypothesis, tags")
      .eq("id", ref.id)
      .single();
    if (error) {
      console.error("读取引用想法失败", { id: ref.id, error: error.message });
    }
    if (!data) {
      throw new Error("无权引用该想法");
    }
    assertOwnership(data.user_id, userId, "无权引用该想法");
    return {
      type: ref.type,
      label: `想法 · ${data.title?.trim() || "无标题"}`,
      content: JSON.stringify({
        status: data.status,
        hypothesis: data.hypothesis,
      }),
      tags: data.tags ?? [],
    };
  }

  if (ref.type === "validation") {
    const { data, error } = await supabaseAdmin
      .from("validations")
      .select(
        "id, idea_id, has_pain, will_pay, note, contacted_at, ideas!inner(user_id, title)"
      )
      .eq("id", ref.id)
      .single();
    const relation = Array.isArray(data?.ideas) ? data?.ideas[0] : data?.ideas;
    if (error) {
      console.error("读取引用验证失败", { id: ref.id, error: error.message });
    }
    if (!data) {
      throw new Error("无权引用该验证");
    }
    assertOwnership(
      relation?.user_id as string | undefined,
      userId,
      "无权引用该验证"
    );
    return {
      type: ref.type,
      label: `验证 · ${relation?.title?.trim() || "无标题"}`,
      content: JSON.stringify({
        has_pain: data.has_pain,
        will_pay: data.will_pay,
        note: data.note,
        contacted_at: data.contacted_at,
      }),
    };
  }

  const { data, error } = await supabaseAdmin
    .from("predictions")
    .select(
      "id, idea_id, text, due_at, outcome, note, ideas!inner(user_id, title)"
    )
    .eq("id", ref.id)
    .single();
  const relation = Array.isArray(data?.ideas) ? data?.ideas[0] : data?.ideas;
  if (error) {
    console.error("读取引用预测失败", { id: ref.id, error: error.message });
  }
  if (!data) {
    throw new Error("无权引用该预测");
  }
  assertOwnership(
    relation?.user_id as string | undefined,
    userId,
    "无权引用该预测"
  );
  return {
    type: ref.type,
    label: `预测 · ${relation?.title?.trim() || "无标题"}`,
    content: JSON.stringify({
      prediction: data.text,
      due_at: data.due_at,
      outcome: data.outcome,
      note: data.note,
    }),
  };
}

function sourceColumn(type: RealitySourceType) {
  return `${type}_id`;
}

export async function createRealityCase(
  input: CreateRealityInput,
  sourceRefs: RealitySourceRef[]
): Promise<string> {
  const normalized = normalizeCreateRealityInput(input);
  const userId = await requireUserId();
  const uniqueRefs = Array.from(
    new Map(sourceRefs.map((ref) => [`${ref.type}:${ref.id}`, ref])).values()
  ).slice(0, 20);
  const snapshots = await Promise.all(
    uniqueRefs.map(async (ref) => ({
      ref,
      snapshot: await snapshotSource(ref, userId),
    }))
  );

  const now = new Date().toISOString();
  const initialMessage: RealityMessage = {
    role: "user",
    content: normalized.initialStatement,
    created_at: now,
  };
  const { data: realityCase, error } = await supabaseAdmin
    .from("reality_cases")
    .insert({
      user_id: userId,
      mode: normalized.mode,
      context: normalized.context,
      title: normalized.title,
      initial_statement: normalized.initialStatement,
      domains: normalized.domains,
      messages: [initialMessage],
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (snapshots.length > 0) {
    const rows = snapshots.map(({ ref, snapshot }) => ({
      case_id: realityCase.id,
      [sourceColumn(ref.type)]: ref.id,
      source_snapshot: snapshot,
    }));
    const { error: sourceError } = await supabaseAdmin
      .from("reality_case_sources")
      .insert(rows);
    if (sourceError) {
      const { error: cleanupError } = await supabaseAdmin
        .from("reality_cases")
        .delete()
        .eq("id", realityCase.id);
      if (cleanupError) {
        console.error("现状课题来源写入失败后清理课题也失败", {
          caseId: realityCase.id,
          cleanupError: cleanupError.message,
        });
      }
      throw new Error(sourceError.message);
    }
  }

  revalidatePath("/reality");
  return realityCase.id as string;
}

async function loadAiSources(caseId: string): Promise<RealityAiSource[]> {
  const { data, error } = await supabaseAdmin
    .from("reality_case_sources")
    .select("source_snapshot")
    .eq("case_id", caseId)
    .order("added_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row, index) => {
    const source = row.source_snapshot as Partial<RealityAiSource>;
    if (
      (source.type !== "observation" &&
        source.type !== "idea" &&
        source.type !== "validation" &&
        source.type !== "prediction") ||
      typeof source.label !== "string" ||
      typeof source.content !== "string"
    ) {
      throw new Error(`引用来源 ${index + 1} 的快照格式无效`);
    }
    return source as RealityAiSource;
  });
}

function toAiContext(
  realityCase: Awaited<ReturnType<typeof requireOwnedCase>>,
  messages: RealityMessage[],
  sources: RealityAiSource[]
): RealityAiContext {
  return {
    mode: realityCase.mode,
    context: realityCase.context,
    title: realityCase.title,
    initialStatement: realityCase.initial_statement,
    domains: realityCase.domains ?? [],
    messages,
    sources,
  };
}

export async function askRealityQuestion(
  caseId: string,
  answer: string,
  forceContinue = false
) {
  const userId = await requireUserId();
  const realityCase = await requireOwnedCase(caseId, userId);
  const messages = Array.isArray(realityCase.messages)
    ? ([...realityCase.messages] as RealityMessage[])
    : [];
  const trimmed = answer.trim();
  if (trimmed) {
    if (trimmed.length > 5000) throw new Error("单次回答不能超过5000字");
    messages.push({
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    });
  }

  const turnCount = messages.filter((message) => message.role === "assistant").length;
  if (shouldStopRealityInterview(messages, forceContinue)) {
    if (trimmed) {
      const { error } = await supabaseAdmin
        .from("reality_cases")
        .update({ messages, updated_at: new Date().toISOString() })
        .eq("id", caseId);
      if (error) throw new Error(error.message);
    }
    return {
      messages,
      questions: [] as string[],
      missingDimensions: [] as string[],
      readyToSynthesize: true,
      softLimitReached: true,
    };
  }

  const sources = await loadAiSources(caseId);
  const result = await nextRealityQuestions(
    toAiContext(realityCase, messages, sources)
  );
  messages.push({
    role: "assistant",
    content: result.questions.join("\n"),
    created_at: new Date().toISOString(),
  });
  const { error } = await supabaseAdmin
    .from("reality_cases")
    .update({ messages, updated_at: new Date().toISOString() })
    .eq("id", caseId);
  if (error) throw new Error(error.message);

  revalidatePath(`/reality/${caseId}`);
  return {
    messages,
    questions: result.questions,
    missingDimensions: result.missing_dimensions,
    readyToSynthesize: result.ready_to_synthesize,
    softLimitReached: turnCount + 1 >= REALITY_INTERVIEW_SOFT_LIMIT,
  };
}

export async function generateRealityVersion(
  caseId: string,
  updateContext: string
): Promise<string> {
  const userId = await requireUserId();
  const realityCase = await requireOwnedCase(caseId, userId);
  const existingMessages = Array.isArray(realityCase.messages)
    ? (realityCase.messages as RealityMessage[])
    : [];
  const messages = appendRealityUpdateMessage(
    existingMessages,
    updateContext
  );
  const sources = await loadAiSources(caseId);
  const focusExports = await listUnconsumedFocusExports(caseId, userId);
  const focusSources: RealityAiSource[] = focusExports.map((item) => ({
    type: "focus",
    label: `聚焦探索 · ${item.anchor.label} · ${item.anchor.text}`,
    content: JSON.stringify({
      user_grounded: item.summary.user_grounded,
      updated_understanding: item.summary.updated_understanding,
      remaining_unknown: item.summary.remaining_unknown,
      ai_inferences: item.summary.ai_inferences,
      candidate_action: item.summary.candidate_action,
    }),
  }));

  // 现实更新先保存。即使后续 AI 失败，用户输入也不会丢失；重试时不会重复追加。
  if (messages !== existingMessages) {
    const { error: messageError } = await supabaseAdmin
      .from("reality_cases")
      .update({ messages, updated_at: new Date().toISOString() })
      .eq("id", caseId);
    if (messageError) throw new Error(messageError.message);
  }

  // AI 阶段全部成功后才写 DB，避免空版本和半成品版本。
  const map = await synthesizeRealityMap(
    toAiContext(realityCase, messages, [...sources, ...focusSources])
  );
  const { data: previous, error: previousError } = await supabaseAdmin
    .from("reality_versions")
    .select("id, version_no, map")
    .eq("case_id", caseId)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousError) throw new Error(previousError.message);

  const delta = previous
    ? await compareRealityVersions(
        parseRealityMap(previous.map),
        map,
        updateContext.trim()
      )
    : null;
  let { data: versionId, error } = await supabaseAdmin.rpc(
    "insert_reality_version_with_focus",
    {
      p_user_id: userId,
      p_case_id: caseId,
      p_previous_version_id: previous?.id ?? null,
      p_map: map,
      p_delta: delta,
      p_focus_session_ids: focusExports.map((item) => item.id),
    }
  );
  if (
    error &&
    focusExports.length === 0 &&
    (error.code === "PGRST202" ||
      error.code === "42883" ||
      error.message.includes("insert_reality_version_with_focus"))
  ) {
    const fallback = await supabaseAdmin
      .from("reality_versions")
      .insert({
        case_id: caseId,
        previous_version_id: previous?.id ?? null,
        version_no: (previous?.version_no ?? 0) + 1,
        map,
        delta,
      })
      .select("id")
      .single();
    versionId = fallback.data?.id ?? null;
    error = fallback.error;
  }
  if (error) throw new Error(error.message);
  if (!versionId) throw new Error("现状地图版本写入失败");

  const { error: touchError } = await supabaseAdmin
    .from("reality_cases")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", caseId);
  if (touchError) {
    console.error("现状地图已生成，但课题更新时间刷新失败", {
      caseId,
      error: touchError.message,
    });
  }
  revalidatePath("/reality");
  revalidatePath(`/reality/${caseId}`);
  return versionId as string;
}

export async function selectRealityPath(
  versionId: string,
  input: PathSelectionInput
): Promise<void> {
  const normalized = normalizePathSelection(input);
  const userId = await requireUserId();
  const { data: version, error } = await supabaseAdmin
    .from("reality_versions")
    .select("id, case_id, map, selected_path, reality_cases!inner(user_id)")
    .eq("id", versionId)
    .single();
  const relation = Array.isArray(version?.reality_cases)
    ? version?.reality_cases[0]
    : version?.reality_cases;
  if (error || !version || relation?.user_id !== userId) {
    throw new Error("无权修改该现状地图");
  }
  assertPathNotSelected(version.selected_path);

  const map = parseRealityMap(version.map);
  const selectedPath = map.paths[normalized.pathIndex];
  const { error: updateError } = await supabaseAdmin
    .from("reality_versions")
    .update({
      selected_path: selectedPath,
      custom_action: normalized.customAction || null,
      selection_reason: normalized.reason,
      review_due_at: normalized.reviewDueAt,
    })
    .eq("id", versionId);
  if (updateError) throw new Error(updateError.message);

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/reality");
  revalidatePath(`/reality/${version.case_id}`);
}

export async function archiveRealityCase(caseId: string): Promise<void> {
  const userId = await requireUserId();
  await requireOwnedCase(caseId, userId);
  const { error } = await supabaseAdmin
    .from("reality_cases")
    .update({
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", caseId);
  if (error) throw new Error(error.message);
  revalidatePath("/reality");
}
