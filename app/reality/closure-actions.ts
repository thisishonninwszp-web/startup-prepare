"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { draftRealityClosure } from "@/lib/ai";
import {
  getReflectionSettings,
  todayInTimezone,
} from "@/app/retrospectives/queries";
import {
  assertClosureDueDate,
  normalizeClosureResolution,
  normalizeReplacementReason,
  parseRealityClosureDraft,
  type RealityClosureDraft,
} from "./closure";
import {
  fingerprintClosureSource,
  validateClosureAgainstSource,
} from "./closure-source";
import { loadClosureSourceSnapshot } from "./closure-queries";

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

async function currentUserDate(userId: string): Promise<string> {
  const settings = await getReflectionSettings(userId);
  return todayInTimezone(settings.timezone);
}

async function requireClosureSource(
  caseId: string,
  versionId: string,
  userId: string
) {
  const source = await loadClosureSourceSnapshot(caseId, versionId, userId);
  if (!source) throw new Error("现状版本不存在或无权访问");
  if (!source.reality.selected_path) {
    throw new Error("请先确认一条初步方向，再收束下一步");
  }
  return source;
}

export async function prepareRealityClosure(
  caseId: string,
  versionId: string
): Promise<{
  draft: RealityClosureDraft;
  source_fingerprint: string;
  source_version_no: number;
  reasoning_count: number;
}> {
  const userId = await requireUserId();
  const source = await requireClosureSource(caseId, versionId, userId);
  const today = await currentUserDate(userId);
  const draft = await draftRealityClosure(source, today);
  return {
    draft,
    source_fingerprint: fingerprintClosureSource(source),
    source_version_no: source.reality.version.version_no,
    reasoning_count:
      source.reasoning.bayesian.length +
      source.reasoning.fermi.length +
      source.reasoning.reframing.length,
  };
}

export async function saveRealityClosure(input: {
  case_id: string;
  version_id: string;
  draft: RealityClosureDraft;
  source_fingerprint: string;
  replaces_closure_id?: string | null;
  replace_reason?: string | null;
}): Promise<{ id: string }> {
  const userId = await requireUserId();
  const source = await requireClosureSource(
    input.case_id,
    input.version_id,
    userId
  );
  const currentFingerprint = fingerprintClosureSource(source);
  if (currentFingerprint !== input.source_fingerprint) {
    throw new Error(
      "现状或关联分析已经变化。你的编辑仍保留，请重新生成后再确认。"
    );
  }
  const draft = parseRealityClosureDraft(input.draft);
  const today = await currentUserDate(userId);
  assertClosureDueDate(draft.due_on, today);
  validateClosureAgainstSource(draft, source, today);
  const replaceReason = input.replaces_closure_id
    ? normalizeReplacementReason(input.replace_reason)
    : null;

  const { data, error } = await supabaseAdmin.rpc("save_reality_closure", {
    p_user_id: userId,
    p_case_id: input.case_id,
    p_source_version_id: input.version_id,
    p_payload: draft,
    p_source_snapshot: source,
    p_source_fingerprint: currentFingerprint,
    p_replaces_closure_id: input.replaces_closure_id ?? null,
    p_replace_reason: replaceReason,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/reality");
  revalidatePath(`/reality/${input.case_id}`);
  return { id: data as string };
}

export async function resolveRealityClosure(
  closureId: string,
  outcome: "completed" | "not_completed",
  note: string,
  caseId: string
): Promise<void> {
  const userId = await requireUserId();
  const normalized = normalizeClosureResolution(outcome, note);
  const { error } = await supabaseAdmin.rpc("resolve_reality_closure", {
    p_closure_id: closureId,
    p_user_id: userId,
    p_outcome: normalized.outcome,
    p_note: normalized.note,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/reality");
  revalidatePath(`/reality/${caseId}`);
}

export async function reconfirmRealityClosure(
  closureId: string,
  versionId: string,
  note: string,
  caseId: string
): Promise<void> {
  const userId = await requireUserId();
  const normalizedNote = normalizeReplacementReason(note);
  const { error } = await supabaseAdmin.rpc("reconfirm_reality_closure", {
    p_closure_id: closureId,
    p_user_id: userId,
    p_reality_version_id: versionId,
    p_note: normalizedNote,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/reality/${caseId}`);
}
