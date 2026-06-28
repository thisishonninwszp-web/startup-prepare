"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  buildDreamVision,
  compareDreamVersions,
  nextDreamQuestions,
  type DreamAiContext,
} from "@/lib/ai";
import {
  DREAM_CONTEXTS,
  DREAM_SCALES,
  parseDreamVision,
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
  const { data, error } = await supabaseAdmin
    .from("dream_cases")
    .insert({
      user_id: userId,
      title: cleanText(input.title, "标题", 120),
      context: input.context,
      scale: input.scale,
      initial_desire: desire,
      messages: [{ role: "user", content: desire }],
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/dreams");
  return data.id as string;
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
  realityVersionId: string
) {
  const userId = await requireUserId();
  await requireDreamCase(caseId, userId);
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
  const { error: insertError } = await supabaseAdmin
    .from("dream_sources")
    .upsert(
      {
        case_id: caseId,
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
      },
      { onConflict: "case_id,source_type,source_id" }
    );
  if (insertError) throw new Error(insertError.message);
  revalidatePath(`/dreams/${caseId}`);
}

export async function createDreamVersion(
  caseId: string,
  changeReason = ""
) {
  const userId = await requireUserId();
  const dreamCase = await requireDreamCase(caseId, userId);
  const context = await dreamAiContext(dreamCase, userId);
  const vision = await buildDreamVision(context);
  const { data: previous, error: previousError } = await supabaseAdmin
    .from("dream_versions")
    .select("id, version_no, vision")
    .eq("case_id", caseId)
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
  const { data, error } = await supabaseAdmin
    .from("dream_versions")
    .insert({
      case_id: caseId,
      previous_version_id: previous?.id ?? null,
      version_no: (previous?.version_no ?? 0) + 1,
      vision,
      delta,
      prompt_version: DREAM_PROMPT_VERSION,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const { error: caseUpdateError } = await supabaseAdmin
    .from("dream_cases")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", caseId)
    .eq("user_id", userId);
  if (caseUpdateError) throw new Error(caseUpdateError.message);
  revalidatePath("/dreams");
  revalidatePath(`/dreams/${caseId}`);
  return data.id as string;
}
