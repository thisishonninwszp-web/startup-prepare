"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { appendResearch, researchSnapshots } from "@/lib/domains/signals/events/research";
import type { ResearchKind } from "@/lib/domains/signals/events/research-shared";
import { eventsEnabled } from "./enabled";
async function viewer() { const { data: { user }, error } = await createClient().auth.getUser(); if (!eventsEnabled() || error || !user) throw new Error("事件研究尚未开启或未登录。"); return user.id; }
function fail(error: unknown) { return { ok: false as const, message: error instanceof Error ? error.message : "这次未保存，输入仍在。" }; }
export async function addResearchAction(eventId: string, input: { kind: ResearchKind; subjectId?: string | null; payload: Record<string, unknown>; requestId: string }) {
  try {
    if (["dossier", "understanding", "window_check", "window"].includes(input.kind)) throw new Error("请使用对应的生成或观察操作。");
    const data = await appendResearch(await viewer(), eventId, input); revalidatePath(`/signals/events/${eventId}`); return { ok: true as const, data };
  } catch (error) { return fail(error); }
}
export async function connectionSourcesAction(targetEventId: string) {
  try { return { ok: true as const, data: (await researchSnapshots(await viewer(), targetEventId)).map((row) => ({ ...row, captured_text: row.captured_text.slice(0, 10000) })) }; }
  catch (error) { return fail(error); }
}

