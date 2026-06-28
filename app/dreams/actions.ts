"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  compareDreamBranches,
  compareDreamVersions,
  nextDreamQuestions,
  nextDreamTurn,
  suggestDreamBranches,
  type DreamAiContext,
} from "@/lib/ai";
import {
  applyDreamCanvasPatches,
  canCreateDreamBranch,
  confirmedDreamCanvas,
  DREAM_CONTEXTS,
  DREAM_CANVAS_DIMENSIONS,
  DREAM_SCALES,
  parseDreamCanvas,
  parseDreamVision,
  projectDreamCanvas,
  removeDreamCanvasItem,
  resolveDreamCanvasItem,
  upsertConfirmedDreamCanvasItem,
  type DreamBranchMessage,
  type DreamCanvasDimension,
  type DreamContext,
  type DreamMessage,
  type DreamScale,
} from "./types";

const DREAM_PROMPT_VERSION = "dream-v1";

async function requireUserId() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

function cleanText(value: string, label: string, max = 10_000) {
  const text = value.trim();
  if (!text) throw new Error(`${label}不能为空`);
  if (text.length > max) throw new Error(`${label}不能超过${max}字`);
  return text;
}

async function requireDreamCase(caseId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("dream_cases")
    .select(
      "id, user_id, title, context, scale, initial_desire, messages, archived_at"
    )
    .eq("id", caseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) throw new Error("无权访问该梦想");
  if (data.archived_at) throw new Error("该梦想已经归档");
  return data;
}

async function dreamAiContext(
  dreamCase: Awaited<ReturnType<typeof requireDreamCase>>,
  userId: string,
  messages?: DreamMessage[]
): Promise<DreamAiContext> {
  const { data: sources, error } = await supabaseAdmin
    .from("dream_sources")
    .select("id, source_type, source_id, snapshot")
    .eq("case_id", dreamCase.id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return {
    context: dreamCase.context as DreamContext,
    scale: dreamCase.scale as DreamScale,
    title: dreamCase.title,
    initialDesire: dreamCase.initial_desire,
    messages:
      messages ??
      ((Array.isArray(dreamCase.messages)
        ? dreamCase.messages
        : []) as DreamMessage[]),
    sources: (sources ?? []).map((source) => ({
      id: `${source.source_type}:${source.source_id}`,
      label: "现状地图",
      snapshot: source.snapshot,
    })),
  };
}

export async function createDreamCase(input: {
  title: string;
  context: DreamContext;
  scale: DreamScale;
  initialDesire: string;
}) {
  const userId = await requireUserId();
  if (!DREAM_CONTEXTS.includes(input.context)) throw new Error("梦想语境无效");
  if (!DREAM_SCALES.includes(input.scale)) throw new Error("梦想尺度无效");
  const desire = cleanText(input.initialDesire, "最初愿望");
  const { data, error } = await supabaseAdmin.rpc(
    "create_dream_case_with_branch",
    {
      p_user_id: userId,
      p_title: cleanText(input.title, "标题", 120),
      p_context: input.context,
      p_scale: input.scale,
      p_initial_desire: desire,
    }
  );
  if (error) throw new Error(error.message);
  revalidatePath("/dreams");
  return data as string;
}

async function requireDreamBranch(
  caseId: string,
  branchId: string,
  userId: string
) {
  const dreamCase = await requireDreamCase(caseId, userId);
  const { data, error } = await supabaseAdmin
    .from("dream_branches")
    .select(
      "id, case_id, user_id, name, phase, current_question, is_focused, archived_at"
    )
    .eq("id", branchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (
    !data ||
    data.user_id !== userId ||
    data.case_id !== caseId ||
    data.archived_at
  ) {
    throw new Error("无权访问该梦想分支");
  }
  return { dreamCase, branch: data };
}

async function loadBranchCanvas(branchId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("dream_branch_canvases")
    .select("branch_id, user_id, revision, content, unknown_dimensions")
    .eq("branch_id", branchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) throw new Error("无权访问该梦想画布");
  return {
    canvas: parseDreamCanvas({
      revision: data.revision,
      content: data.content,
    }),
    unknownDimensions: (data.unknown_dimensions ?? []) as string[],
  };
}

async function loadBranchMessages(
  branchId: string,
  userId: string
): Promise<DreamBranchMessage[]> {
  const { data, error } = await supabaseAdmin
    .from("dream_branch_messages")
    .select("id, branch_id, role, content, created_at")
    .eq("branch_id", branchId)
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as DreamBranchMessage[];
}

async function loadDreamSources(
  caseId: string,
  branchId: string,
  userId: string
) {
  const { data, error } = await supabaseAdmin
    .from("dream_sources")
    .select("id, branch_id, source_type, source_id, snapshot")
    .eq("case_id", caseId)
    .eq("user_id", userId)
    .or(`branch_id.is.null,branch_id.eq.${branchId}`)
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) throw new Error(error.message);
  return (data ?? []).map((source) => ({
    id: `${source.source_type}:${source.source_id}`,
    label: source.branch_id ? "分支现状地图" : "梦想现状地图",
    snapshot: {
      excerpt: JSON.stringify(source.snapshot).slice(0, 8_000),
    },
  }));
}

async function persistDreamAnswer(
  branchId: string,
  userId: string,
  answer: string,
  idempotencyKey: string
) {
  const key = cleanText(idempotencyKey, "幂等键", 120);
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("dream_branch_messages")
    .select("id, branch_id, role, content, created_at")
    .eq("branch_id", branchId)
    .eq("user_id", userId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return existing as DreamBranchMessage;
  const { data, error } = await supabaseAdmin
    .from("dream_branch_messages")
    .insert({
      branch_id: branchId,
      user_id: userId,
      role: "user",
      content: cleanText(answer, "回答", 3000),
      idempotency_key: key,
    })
    .select("id, branch_id, role, content, created_at")
    .single();
  if (error) {
    const { data: raced, error: racedError } = await supabaseAdmin
      .from("dream_branch_messages")
      .select("id, branch_id, role, content, created_at")
      .eq("branch_id", branchId)
      .eq("user_id", userId)
      .eq("idempotency_key", key)
      .maybeSingle();
    if (racedError) throw new Error(racedError.message);
    if (raced) return raced as DreamBranchMessage;
    throw new Error(error.message);
  }
  return data as DreamBranchMessage;
}

export async function answerDreamTurn(input: {
  caseId: string;
  branchId: string;
  answer: string;
  idempotencyKey: string;
  expectedRevision: number;
}) {
  const userId = await requireUserId();
  const { dreamCase, branch } = await requireDreamBranch(
    input.caseId,
    input.branchId,
    userId
  );
  await persistDreamAnswer(
    input.branchId,
    userId,
    input.answer,
    input.idempotencyKey
  );
  const [allMessages, canvasBundle, sources] = await Promise.all([
    loadBranchMessages(input.branchId, userId),
    loadBranchCanvas(input.branchId, userId),
    loadDreamSources(input.caseId, input.branchId, userId),
  ]);
  const messages = allMessages.slice(-24).map((message) => ({
    ...message,
    content: message.content.slice(0, 2_000),
  }));
  if (canvasBundle.canvas.revision !== input.expectedRevision) {
    throw new Error("画布已经更新，回答已保存；请刷新后重试AI整理");
  }
  const turn = await nextDreamTurn({
    branchId: input.branchId,
    context: dreamCase.context as DreamContext,
    scale: dreamCase.scale as DreamScale,
    title: dreamCase.title,
    initialDesire: dreamCase.initial_desire,
    phase: branch.phase,
    messages,
    canvas: canvasBundle.canvas,
    sources,
  });
  const updated = applyDreamCanvasPatches(
    canvasBundle.canvas,
    turn,
    input.expectedRevision
  );
  const inferenceRows = turn.inferences.map((inference) => ({
    ...inference,
    canvas_item_id: `${inference.source_message_ids.join("-")}:${inference.source_ids.join("-")}:${inference.dimension}:${inference.text}`,
  }));
  const { error } = await supabaseAdmin.rpc("apply_dream_turn", {
    p_branch_id: input.branchId,
    p_user_id: userId,
    p_expected_revision: input.expectedRevision,
    p_content: updated.content,
    p_unknown_dimensions: turn.unknown_dimensions,
    p_phase: turn.phase,
    p_question: turn.question,
    p_inferences: inferenceRows,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/dreams/${input.caseId}`);
  return { turn, revision: updated.revision };
}

async function persistCanvasWithRevision(
  branchId: string,
  userId: string,
  expectedRevision: number,
  next: ReturnType<typeof parseDreamCanvas>
) {
  const { data, error } = await supabaseAdmin
    .from("dream_branch_canvases")
    .update({
      content: next.content,
      revision: next.revision,
      updated_at: new Date().toISOString(),
    })
    .eq("branch_id", branchId)
    .eq("user_id", userId)
    .eq("revision", expectedRevision)
    .select("branch_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("画布已经更新，请刷新后重试");
}

export async function saveDreamCanvasItem(input: {
  caseId: string;
  branchId: string;
  dimension: DreamCanvasDimension;
  itemId?: string | null;
  text: string;
  expectedRevision: number;
}) {
  const userId = await requireUserId();
  await requireDreamBranch(input.caseId, input.branchId, userId);
  if (!DREAM_CANVAS_DIMENSIONS.includes(input.dimension)) {
    throw new Error("画布维度无效");
  }
  const { canvas } = await loadBranchCanvas(input.branchId, userId);
  const next = upsertConfirmedDreamCanvasItem(
    canvas,
    input.dimension,
    input.itemId ?? null,
    cleanText(input.text, "画布内容", 1000),
    input.expectedRevision
  );
  await persistCanvasWithRevision(
    input.branchId,
    userId,
    input.expectedRevision,
    next
  );
  revalidatePath(`/dreams/${input.caseId}`);
}

export async function deleteDreamCanvasItem(input: {
  caseId: string;
  branchId: string;
  dimension: DreamCanvasDimension;
  itemId: string;
  expectedRevision: number;
}) {
  const userId = await requireUserId();
  await requireDreamBranch(input.caseId, input.branchId, userId);
  const { canvas } = await loadBranchCanvas(input.branchId, userId);
  const next = removeDreamCanvasItem(
    canvas,
    input.dimension,
    input.itemId,
    input.expectedRevision
  );
  await persistCanvasWithRevision(
    input.branchId,
    userId,
    input.expectedRevision,
    next
  );
  revalidatePath(`/dreams/${input.caseId}`);
}

export async function resolveDreamInference(input: {
  caseId: string;
  branchId: string;
  suggestionId: string;
  resolution: "accept" | "reject";
  expectedRevision: number;
}) {
  const userId = await requireUserId();
  await requireDreamBranch(input.caseId, input.branchId, userId);
  const { data: suggestion, error } = await supabaseAdmin
    .from("dream_canvas_suggestions")
    .select("id, branch_id, user_id, canvas_item_id, status")
    .eq("id", input.suggestionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (
    !suggestion ||
    suggestion.user_id !== userId ||
    suggestion.branch_id !== input.branchId ||
    suggestion.status !== "pending"
  ) {
    throw new Error("画布建议不存在或已经处理");
  }
  const { canvas } = await loadBranchCanvas(input.branchId, userId);
  const next = resolveDreamCanvasItem(
    canvas,
    suggestion.canvas_item_id,
    input.resolution,
    input.expectedRevision
  );
  const { error: updateError } = await supabaseAdmin.rpc(
    "resolve_dream_canvas_suggestion",
    {
      p_suggestion_id: input.suggestionId,
      p_branch_id: input.branchId,
      p_user_id: userId,
      p_expected_revision: input.expectedRevision,
      p_content: next.content,
      p_resolution:
        input.resolution === "accept" ? "accepted" : "rejected",
    }
  );
  if (updateError) throw new Error(updateError.message);
  revalidatePath(`/dreams/${input.caseId}`);
}

export async function generateDreamBranchSuggestions(
  caseId: string,
  branchId: string
) {
  const userId = await requireUserId();
  await requireDreamBranch(caseId, branchId, userId);
  const [allMessages, { canvas }] = await Promise.all([
    loadBranchMessages(branchId, userId),
    loadBranchCanvas(branchId, userId),
  ]);
  const messages = allMessages.slice(-40).map((message) => ({
    ...message,
    content: message.content.slice(0, 2_000),
  }));
  const result = await suggestDreamBranches({
    branchId,
    messages,
    canvas: confirmedDreamCanvas(canvas),
  });
  let createdIds: string[] = [];
  if (result.suggestions.length) {
    const { data, error } = await supabaseAdmin
      .from("dream_branch_suggestions")
      .insert(
        result.suggestions.map((suggestion) => ({
          case_id: caseId,
          source_branch_id: branchId,
          user_id: userId,
          label: suggestion.label,
          fork_question: suggestion.fork_question,
          tradeoff: suggestion.tradeoff,
          source_message_ids: suggestion.source_message_ids,
        }))
      )
      .select("id");
    if (error) throw new Error(error.message);
    createdIds = (data ?? []).map((item) => item.id as string);
  }
  let rejectQuery = supabaseAdmin
    .from("dream_branch_suggestions")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("case_id", caseId)
    .eq("source_branch_id", branchId)
    .eq("user_id", userId)
    .eq("status", "pending");
  if (createdIds.length) {
    rejectQuery = rejectQuery.not("id", "in", `(${createdIds.join(",")})`);
  }
  const { error: rejectError } = await rejectQuery;
  if (rejectError) throw new Error(rejectError.message);
  revalidatePath(`/dreams/${caseId}`);
  return result;
}

export async function acceptDreamBranchSuggestion(
  caseId: string,
  suggestionId: string
) {
  const userId = await requireUserId();
  const dreamCase = await requireDreamCase(caseId, userId);
  const { count, error: countError } = await supabaseAdmin
    .from("dream_branches")
    .select("id", { count: "exact", head: true })
    .eq("case_id", dreamCase.id)
    .eq("user_id", userId)
    .is("archived_at", null);
  if (countError) throw new Error(countError.message);
  if (!canCreateDreamBranch(count ?? 0)) {
    throw new Error("同一梦想最多保留5个活跃分支");
  }
  const { data, error } = await supabaseAdmin.rpc(
    "accept_dream_branch_suggestion",
    {
      p_suggestion_id: suggestionId,
      p_user_id: userId,
    }
  );
  if (error) throw new Error(error.message);
  revalidatePath(`/dreams/${caseId}`);
  return data as string;
}

export async function rejectDreamBranchSuggestion(
  caseId: string,
  suggestionId: string
) {
  const userId = await requireUserId();
  await requireDreamCase(caseId, userId);
  const { data, error } = await supabaseAdmin
    .from("dream_branch_suggestions")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("id", suggestionId)
    .eq("case_id", caseId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("分支建议不存在或已经处理");
  revalidatePath(`/dreams/${caseId}`);
}

export async function focusDreamBranch(caseId: string, branchId: string) {
  const userId = await requireUserId();
  await requireDreamBranch(caseId, branchId, userId);
  const { error } = await supabaseAdmin.rpc("set_focused_dream_branch", {
    p_case_id: caseId,
    p_branch_id: branchId,
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/dreams/${caseId}`);
}

export async function archiveDreamBranch(caseId: string, branchId: string) {
  const userId = await requireUserId();
  await requireDreamBranch(caseId, branchId, userId);
  const { error } = await supabaseAdmin.rpc("archive_dream_branch", {
    p_branch_id: branchId,
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/dreams/${caseId}`);
}

export async function compareDreamCaseBranches(caseId: string) {
  const userId = await requireUserId();
  await requireDreamCase(caseId, userId);
  const { data: branches, error } = await supabaseAdmin
    .from("dream_branches")
    .select("id, name")
    .eq("case_id", caseId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at");
  if (error) throw new Error(error.message);
  if (!branches || branches.length < 2) {
    throw new Error("至少需要两个活跃分支才能比较");
  }
  const canvases = await Promise.all(
    branches.map(async (branch) => ({
      id: branch.id as string,
      name: branch.name as string,
      canvas: confirmedDreamCanvas(
        (await loadBranchCanvas(branch.id, userId)).canvas
      ),
    }))
  );
  return compareDreamBranches({ branches: canvases });
}

export async function continueDreamInterview(
  caseId: string,
  answer?: string
) {
  const userId = await requireUserId();
  const dreamCase = await requireDreamCase(caseId, userId);
  const messages = (Array.isArray(dreamCase.messages)
    ? [...dreamCase.messages]
    : []) as DreamMessage[];
  if (answer?.trim()) {
    messages.push({
      role: "user",
      content: cleanText(answer, "回答", 3000),
    });
    const { error: answerError } = await supabaseAdmin
      .from("dream_cases")
      .update({ messages, updated_at: new Date().toISOString() })
      .eq("id", caseId)
      .eq("user_id", userId);
    if (answerError) throw new Error(answerError.message);
  }
  const result = await nextDreamQuestions(
    await dreamAiContext(dreamCase, userId, messages)
  );
  messages.push({
    role: "assistant",
    content: result.questions.join("\n"),
  });
  const { error } = await supabaseAdmin
    .from("dream_cases")
    .update({ messages, updated_at: new Date().toISOString() })
    .eq("id", caseId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dreams/${caseId}`);
  return result;
}

export async function attachRealityToDream(
  caseId: string,
  realityVersionId: string,
  scope: "case" | "branch" = "case",
  branchId?: string
) {
  const userId = await requireUserId();
  await requireDreamCase(caseId, userId);
  if (scope === "branch") {
    if (!branchId) throw new Error("请选择梦想分支");
    await requireDreamBranch(caseId, branchId, userId);
  }
  const { data, error } = await supabaseAdmin
    .from("reality_versions")
    .select(
      "id, case_id, version_no, map, delta, created_at, reality_cases!inner(user_id, title)"
    )
    .eq("id", realityVersionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const realityCase = Array.isArray(data?.reality_cases)
    ? data?.reality_cases[0]
    : data?.reality_cases;
  if (!data || realityCase?.user_id !== userId) {
    throw new Error("无权引用该现状地图");
  }
  let existingQuery = supabaseAdmin
    .from("dream_sources")
    .select("id")
    .eq("case_id", caseId)
    .eq("user_id", userId)
    .eq("source_type", "reality")
    .eq("source_id", realityVersionId);
  existingQuery =
    scope === "branch"
      ? existingQuery.eq("branch_id", branchId!)
      : existingQuery.is("branch_id", null);
  const { data: existing, error: existingError } =
    await existingQuery.maybeSingle();
  if (existingError) throw new Error(existingError.message);
  const { error: insertError } = existing
    ? { error: null }
    : await supabaseAdmin.from("dream_sources").insert({
        case_id: caseId,
        branch_id: scope === "branch" ? branchId : null,
        user_id: userId,
        source_type: "reality",
        source_id: realityVersionId,
        snapshot: {
          title: realityCase.title,
          version_no: data.version_no,
          map: data.map,
          delta: data.delta,
          created_at: data.created_at,
        },
      });
  if (insertError) throw new Error(insertError.message);
  revalidatePath(`/dreams/${caseId}`);
}

export async function createDreamVersion(
  caseId: string,
  branchId: string,
  changeReason = ""
) {
  const userId = await requireUserId();
  await requireDreamBranch(caseId, branchId, userId);
  const { canvas } = await loadBranchCanvas(branchId, userId);
  const versionCanvas = confirmedDreamCanvas(canvas);
  const vision = projectDreamCanvas(versionCanvas);
  const { data: previous, error: previousError } = await supabaseAdmin
    .from("dream_versions")
    .select("id, version_no, vision")
    .eq("branch_id", branchId)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousError) throw new Error(previousError.message);
  const delta = previous
    ? await compareDreamVersions(
        parseDreamVision(previous.vision),
        vision,
        changeReason
      )
    : null;
  const { data: sources, error: sourceError } = await supabaseAdmin
    .from("dream_sources")
    .select("id, branch_id, source_type, source_id, snapshot")
    .eq("case_id", caseId)
    .eq("user_id", userId)
    .or(`branch_id.is.null,branch_id.eq.${branchId}`);
  if (sourceError) throw new Error(sourceError.message);
  const { data, error } = await supabaseAdmin.rpc(
    "create_dream_branch_version",
    {
      p_case_id: caseId,
      p_branch_id: branchId,
      p_user_id: userId,
      p_vision: vision,
      p_canvas_snapshot: versionCanvas,
      p_delta: delta,
      p_prompt_version: DREAM_PROMPT_VERSION,
      p_sources: (sources ?? []).map((source) => ({
        source_scope: source.branch_id ? "branch" : "case",
        source_type: source.source_type,
        source_id: source.source_id,
        snapshot: source.snapshot,
      })),
    }
  );
  if (error) throw new Error(error.message);
  revalidatePath("/dreams");
  revalidatePath(`/dreams/${caseId}`);
  return data as string;
}
