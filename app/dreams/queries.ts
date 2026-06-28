import { supabaseAdmin } from "@/lib/supabase";
import {
  parseDreamDelta,
  parseDreamCanvas,
  parseDreamVision,
  type DreamBranchMessage,
  type DreamContext,
  type DreamScale,
} from "./types";

export async function listDreamCases(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("dream_cases")
    .select(
      "id, title, context, scale, initial_desire, updated_at, dream_versions(id, version_no, created_at), dream_branches(id, archived_at)"
    )
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const versions = Array.isArray(row.dream_versions)
      ? row.dream_versions
      : [];
    const branches = Array.isArray(row.dream_branches)
      ? row.dream_branches.filter((branch) => !branch.archived_at)
      : [];
    return {
      id: row.id as string,
      title: row.title as string,
      context: row.context as DreamContext,
      scale: row.scale as DreamScale,
      initial_desire: row.initial_desire as string,
      updated_at: row.updated_at as string,
      version_count: versions.length,
      branch_count: branches.length,
      latest_version:
        versions.sort(
          (a, b) => Number(b.version_no) - Number(a.version_no)
        )[0] ?? null,
    };
  });
}

export async function getDreamCase(caseId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("dream_cases")
    .select(
      "id, user_id, title, context, scale, initial_desire, created_at"
    )
    .eq("id", caseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) return null;
  const { data: branches, error: branchError } = await supabaseAdmin
    .from("dream_branches")
    .select(
      "id, parent_branch_id, name, fork_question, tradeoff, phase, current_question, is_focused, created_at, updated_at"
    )
    .eq("case_id", caseId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at");
  if (branchError) throw new Error(branchError.message);
  const branchIds = (branches ?? []).map((branch) => branch.id as string);
  const [
    messageResult,
    canvasResult,
    canvasSuggestionResult,
    suggestionResult,
    versionResult,
    sourceResult,
  ] =
    await Promise.all([
      branchIds.length
        ? supabaseAdmin
            .from("dream_canvas_suggestions")
            .select(
              "id, branch_id, dimension, canvas_item_id, text, source_message_ids, status, created_at"
            )
            .eq("user_id", userId)
            .in("branch_id", branchIds)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      branchIds.length
        ? supabaseAdmin
            .from("dream_branch_messages")
            .select("id, branch_id, role, content, created_at")
            .eq("user_id", userId)
            .in("branch_id", branchIds)
            .order("created_at")
        : Promise.resolve({ data: [], error: null }),
      branchIds.length
        ? supabaseAdmin
            .from("dream_branch_canvases")
            .select(
              "branch_id, revision, content, unknown_dimensions, updated_at"
            )
            .eq("user_id", userId)
            .in("branch_id", branchIds)
        : Promise.resolve({ data: [], error: null }),
      branchIds.length
        ? supabaseAdmin
            .from("dream_branch_suggestions")
            .select(
              "id, source_branch_id, label, fork_question, tradeoff, source_message_ids, status, created_at"
            )
            .eq("case_id", caseId)
            .eq("user_id", userId)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      branchIds.length
        ? supabaseAdmin
            .from("dream_versions")
            .select(
              "id, branch_id, previous_version_id, version_no, vision, delta, canvas_snapshot, created_at"
            )
            .eq("case_id", caseId)
            .in("branch_id", branchIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      supabaseAdmin
        .from("dream_sources")
        .select(
          "id, branch_id, source_type, source_id, snapshot, created_at"
        )
        .eq("case_id", caseId)
        .eq("user_id", userId)
        .order("created_at"),
    ]);
  for (const result of [
    messageResult,
    canvasResult,
    canvasSuggestionResult,
    suggestionResult,
    versionResult,
    sourceResult,
  ]) {
    if (result.error) throw new Error(result.error.message);
  }
  const messageRows = (messageResult.data ?? []) as unknown as DreamBranchMessage[];
  const canvasRows = (canvasResult.data ?? []) as unknown as Array<{
    branch_id: string;
    revision: number;
    content: unknown;
    unknown_dimensions: string[];
    updated_at: string;
  }>;
  const versionRows = (versionResult.data ?? []) as unknown as Array<{
    id: string;
    branch_id: string;
    previous_version_id: string | null;
    version_no: number;
    vision: unknown;
    delta: unknown;
    canvas_snapshot: unknown;
    created_at: string;
  }>;
  const sourceRows = (sourceResult.data ?? []) as unknown as Array<{
    id: string;
    branch_id: string | null;
    source_type: string;
    source_id: string;
    snapshot: unknown;
    created_at: string;
  }>;
  const canvasByBranch = new Map(
    canvasRows.map((canvas) => [
      canvas.branch_id as string,
      {
        ...parseDreamCanvas({
          revision: canvas.revision,
          content: canvas.content,
        }),
        unknown_dimensions: (canvas.unknown_dimensions ?? []) as string[],
        updated_at: canvas.updated_at as string,
      },
    ])
  );
  const parsedVersions = versionRows.map((version) => ({
    id: version.id as string,
    branch_id: version.branch_id as string,
    previous_version_id: version.previous_version_id as string | null,
    version_no: version.version_no as number,
    vision: parseDreamVision(version.vision),
    delta: version.delta ? parseDreamDelta(version.delta) : null,
    canvas_snapshot: version.canvas_snapshot,
    created_at: version.created_at as string,
  }));
  const canvasSuggestions = (canvasSuggestionResult.data ??
    []) as unknown as Array<{
    id: string;
    branch_id: string;
    dimension: string;
    canvas_item_id: string;
    text: string;
    source_message_ids: string[];
    status: string;
    created_at: string;
  }>;
  const branchSuggestions = (suggestionResult.data ??
    []) as unknown as Array<{
    id: string;
    source_branch_id: string;
    label: string;
    fork_question: string;
    tradeoff: string;
    source_message_ids: string[];
    status: string;
    created_at: string;
  }>;
  const parsedBranches = (branches ?? []).map((branch) => ({
    id: branch.id as string,
    parent_branch_id: branch.parent_branch_id as string | null,
    name: branch.name as string,
    fork_question: branch.fork_question as string,
    tradeoff: branch.tradeoff as string,
    phase: branch.phase as string,
    current_question: branch.current_question as string,
    is_focused: branch.is_focused as boolean,
    created_at: branch.created_at as string,
    updated_at: branch.updated_at as string,
    messages: messageRows.filter(
      (message) => message.branch_id === branch.id
    ),
    canvas: canvasByBranch.get(branch.id as string) ?? null,
    pending_inferences: canvasSuggestions.filter(
      (suggestion) => suggestion.branch_id === branch.id
    ),
    suggestions: branchSuggestions.filter(
      (suggestion) => suggestion.source_branch_id === branch.id
    ),
    sources: sourceRows.filter(
      (source) => source.branch_id === branch.id
    ),
    versions: parsedVersions
      .filter((version) => version.branch_id === branch.id)
      .sort((a, b) => b.version_no - a.version_no),
  }));
  const focusedBranches = parsedBranches.filter(
    (branch) => branch.is_focused
  );
  if (parsedBranches.length === 0 || focusedBranches.length !== 1) {
    throw new Error("梦想分支数据异常：必须且只能有一个当前焦点");
  }
  const focusedBranch = focusedBranches[0];
  return {
    id: data.id as string,
    title: data.title as string,
    context: data.context as DreamContext,
    scale: data.scale as DreamScale,
    initial_desire: data.initial_desire as string,
    created_at: data.created_at as string,
    sources: sourceRows.filter((source) => !source.branch_id),
    branches: parsedBranches,
    focused_branch: focusedBranch,
    messages: focusedBranch?.messages ?? [],
    versions: focusedBranch?.versions ?? [],
  };
}

export type DreamCaseDetail = NonNullable<
  Awaited<ReturnType<typeof getDreamCase>>
>;

export async function getDreamBranchVersion(
  caseId: string,
  branchId: string,
  versionNo: number,
  userId: string
) {
  const { data: branch, error: branchError } = await supabaseAdmin
    .from("dream_branches")
    .select("id, case_id, user_id, name, archived_at")
    .eq("id", branchId)
    .maybeSingle();
  if (branchError) throw new Error(branchError.message);
  if (!branch || branch.user_id !== userId || branch.case_id !== caseId) {
    return null;
  }
  const { data: version, error } = await supabaseAdmin
    .from("dream_versions")
    .select("id, branch_id, version_no, vision, delta, created_at")
    .eq("case_id", caseId)
    .eq("branch_id", branchId)
    .eq("version_no", versionNo)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!version) return null;
  return {
    branch: {
      id: branch.id as string,
      name: branch.name as string,
      archived_at: branch.archived_at as string | null,
    },
    version: {
      id: version.id as string,
      version_no: version.version_no as number,
      vision: parseDreamVision(version.vision),
      delta: version.delta ? parseDreamDelta(version.delta) : null,
      created_at: version.created_at as string,
    },
  };
}

export async function getOriginalDreamBranch(
  caseId: string,
  userId: string
) {
  const { data, error } = await supabaseAdmin
    .from("dream_branches")
    .select("id")
    .eq("case_id", caseId)
    .eq("user_id", userId)
    .is("parent_branch_id", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id as string | undefined;
}

export async function listRealityVersionChoices(userId: string) {
  const { data: cases, error: caseError } = await supabaseAdmin
    .from("reality_cases")
    .select("id, title")
    .eq("user_id", userId)
    .is("archived_at", null);
  if (caseError) throw new Error(caseError.message);
  const caseMap = new Map((cases ?? []).map((item) => [item.id, item.title]));
  const caseIds = Array.from(caseMap.keys());
  if (caseIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("reality_versions")
    .select("id, case_id, version_no, map, created_at")
    .in("case_id", caseIds)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map((version) => ({
    id: version.id as string,
    case_id: version.case_id as string,
    case_title: caseMap.get(version.case_id) ?? "未知现状课题",
    version_no: version.version_no as number,
    map: version.map,
    created_at: version.created_at as string,
  }));
}

export async function listDreamVersionChoices(userId: string) {
  const cases = await listDreamCases(userId);
  const caseMap = new Map(cases.map((item) => [item.id, item]));
  const caseIds = Array.from(caseMap.keys());
  if (caseIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("dream_versions")
    .select("id, case_id, branch_id, version_no, vision, created_at")
    .in("case_id", caseIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const branchIds = Array.from(
    new Set((data ?? []).map((version) => version.branch_id as string))
  );
  const { data: branches, error: branchError } = branchIds.length
    ? await supabaseAdmin
        .from("dream_branches")
        .select("id, name, is_focused")
        .eq("user_id", userId)
        .in("id", branchIds)
    : { data: [], error: null };
  if (branchError) throw new Error(branchError.message);
  const branchMap = new Map(
    (branches ?? []).map((branch) => [branch.id, branch])
  );
  return (data ?? []).map((version) => ({
    id: version.id as string,
    case_id: version.case_id as string,
    case_title: caseMap.get(version.case_id)?.title ?? "未知梦想",
    context: caseMap.get(version.case_id)?.context ?? "cross",
    scale: caseMap.get(version.case_id)?.scale ?? "small",
    branch_id: version.branch_id as string,
    branch_name:
      (branchMap.get(version.branch_id)?.name as string | undefined) ??
      "原始路径",
    is_focused: Boolean(branchMap.get(version.branch_id)?.is_focused),
    version_no: version.version_no as number,
    vision: parseDreamVision(version.vision),
    created_at: version.created_at as string,
  }));
}
