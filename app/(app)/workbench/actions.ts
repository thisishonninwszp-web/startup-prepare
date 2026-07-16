"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWorkbenchSchemaStatus } from "./queries";
import {
  DECISION_OBJECT_TYPES,
  type WorkbenchObjectType,
} from "./domain";

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

function normalizeText(value: string, label: string, max = 2000): string {
  const text = value.trim();
  if (!text) throw new Error(`${label}不能为空`);
  if (text.length > max) throw new Error(`${label}过长`);
  return text;
}

export async function resolveWorkbenchClosure(input: {
  closureId: string;
  objectType: WorkbenchObjectType;
  objectId: string;
  outcome: "completed" | "not_completed";
  actualResult: string;
  gapReason: "judgment" | "execution" | "environment_change" | "luck" | "unknown";
  updatedRule?: string;
}): Promise<void> {
  if (!DECISION_OBJECT_TYPES.includes(input.objectType)) {
    throw new Error("决策对象类型无效");
  }
  const userId = await requireUserId();
  const actualResult = normalizeText(input.actualResult, "实际结果");
  const updatedRule = input.updatedRule?.trim() || null;
  const { data: closure, error: closureError } = await supabaseAdmin
    .from("decision_closures")
    .select("id, user_id, object_type, object_id, current_judgment, status")
    .eq("id", input.closureId)
    .maybeSingle();
  if (closureError) throw new Error(closureError.message);
  if (
    !closure ||
    closure.user_id !== userId ||
    closure.object_type !== input.objectType ||
    closure.object_id !== input.objectId ||
    closure.status !== "active"
  ) {
    throw new Error("当前收束不存在或无权操作");
  }

  const { error } = await supabaseAdmin.rpc("resolve_decision_closure", {
    p_closure_id: input.closureId,
    p_user_id: userId,
    p_outcome: input.outcome,
    p_note: actualResult,
  });
  if (error) throw new Error(error.message);

  if (await getWorkbenchSchemaStatus()) {
    const { error: learningError } = await supabaseAdmin
      .from("decision_object_learnings")
      .insert({
        user_id: userId,
        object_type: input.objectType,
        object_id: input.objectId,
        closure_id: input.closureId,
        original_judgment: closure.current_judgment,
        actual_result: actualResult,
        gap_reason: input.gapReason,
        updated_rule: updatedRule,
      });
    if (learningError) throw new Error(learningError.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/workbench");
  revalidatePath(`/workbench/${input.objectType}/${input.objectId}`);
}
