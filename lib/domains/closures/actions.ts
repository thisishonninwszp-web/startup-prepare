"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { draftDecisionClosure } from "@/lib/ai";
import {
  getReflectionSettings,
  todayInTimezone,
} from "@/app/(app)/retrospectives/queries";
import { loadClosureSourceSnapshot } from "@/app/(app)/reality/closure-queries";
import { buildRealityDecisionClosureSource } from "./reality-source";
import {
  assertDecisionClosureDueDate,
  parseDecisionClosureDraft,
  validateDecisionClosureDraft,
  type DecisionClosureDraft,
} from "./domain";

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

function normalizeResultNote(value: string): string {
  const note = value.trim();
  if (!note) throw new Error("实际结果不能为空");
  if (note.length > 2000) throw new Error("实际结果过长");
  return note;
}

function normalizeReplaceReason(value: string | null | undefined): string | null {
  if (value == null) return null;
  const reason = value.trim();
  if (!reason) throw new Error("替代当前下一步时必须记录原因");
  if (reason.length > 2000) throw new Error("替代原因过长");
  return reason;
}

async function requireRealityDecisionSource(
  caseId: string,
  versionId: string,
  userId: string
) {
  const source = await loadClosureSourceSnapshot(caseId, versionId, userId);
  if (!source) throw new Error("现状版本不存在或无权访问");
  return {
    realitySource: source,
    decisionSource: buildRealityDecisionClosureSource(source),
  };
}

export async function prepareRealityDecisionClosure(
  caseId: string,
  versionId: string
): Promise<{ draft: DecisionClosureDraft; source_version_no: number }> {
  const userId = await requireUserId();
  const { realitySource, decisionSource } = await requireRealityDecisionSource(
    caseId,
    versionId,
    userId
  );
  const today = await currentUserDate(userId);
  const draft = await draftDecisionClosure(
    {
      object_type: "reality_case",
      object_title: realitySource.reality.realityCase.title,
      origin_module: "reality",
      source: decisionSource,
    },
    today
  );
  validateDecisionClosureDraft(draft, decisionSource, today);
  return {
    draft,
    source_version_no: realitySource.reality.version.version_no,
  };
}

export async function saveRealityDecisionClosure(input: {
  case_id: string;
  version_id: string;
  draft: DecisionClosureDraft;
  replaces_closure_id?: string | null;
  replace_reason?: string | null;
}): Promise<{ id: string }> {
  const userId = await requireUserId();
  const { realitySource, decisionSource } = await requireRealityDecisionSource(
    input.case_id,
    input.version_id,
    userId
  );
  const today = await currentUserDate(userId);
  const draft = parseDecisionClosureDraft(input.draft);
  assertDecisionClosureDueDate(draft.due_on, today);
  validateDecisionClosureDraft(draft, decisionSource, today);
  const replaceReason = input.replaces_closure_id
    ? normalizeReplaceReason(input.replace_reason)
    : null;

  const { data, error } = await supabaseAdmin.rpc("save_decision_closure", {
    p_user_id: userId,
    p_object_type: "reality_case",
    p_object_id: input.case_id,
    p_origin_module: "reality",
    p_title: realitySource.reality.realityCase.title,
    p_payload: draft,
    p_sources: [
      {
        source_type: "reality_version",
        source_id: input.version_id,
        source_version_id: input.version_id,
        snapshot: decisionSource,
        basis_refs: draft.basis_refs,
      },
    ],
    p_replaces_closure_id: input.replaces_closure_id ?? null,
    p_replace_reason: replaceReason,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/reality");
  revalidatePath(`/reality/${input.case_id}`);
  return { id: data as string };
}

export async function resolveDecisionClosure(
  closureId: string,
  outcome: "completed" | "not_completed",
  note: string,
  revalidateHref: string
): Promise<void> {
  const userId = await requireUserId();
  const normalized = normalizeResultNote(note);
  const { error } = await supabaseAdmin.rpc("resolve_decision_closure", {
    p_closure_id: closureId,
    p_user_id: userId,
    p_outcome: outcome,
    p_note: normalized,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath(revalidateHref);
}
