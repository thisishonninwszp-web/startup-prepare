"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { saveReasoning } from "@/lib/domains/observations/reasoning/commands";
import { loadReasoning } from "@/lib/domains/observations/reasoning/queries";
import type { ReasoningInput } from "@/lib/domains/observations/reasoning/domain";
import { eventsEnabled } from "./enabled";
async function viewer() {
  if (!eventsEnabled() || process.env.REASONING_ATTENTION_ENABLED !== "true") throw new Error("推理记录尚未开启。");
  const { data: { user }, error } = await createClient().auth.getUser(); if (error || !user) throw new Error("请先登录。"); return user.id;
}
function fail(error: unknown) { return { ok: false as const, message: error instanceof Error ? error.message : "这次未保存，输入仍在。" }; }
export async function loadReasoningAction(eventId: string, afterRevision = 0, limit = 50) {
  try { return { ok: true as const, data: await loadReasoning(await viewer(), eventId, afterRevision, limit) }; } catch (error) { return fail(error); }
}
export async function saveReasoningAction(eventId: string, input: ReasoningInput) {
  try {
    const data = await saveReasoning(await viewer(), eventId, input);
    try { revalidatePath(`/signals/events/${eventId}`); } catch { return { ok: true as const, data, refreshWarning: "记录已保存，但页面刷新失败，请重新加载历史。" }; }
    return { ok: true as const, data };
  } catch (error) { return fail(error); }
}
