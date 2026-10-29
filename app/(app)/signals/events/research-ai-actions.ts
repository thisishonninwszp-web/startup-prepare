"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateResearch, type GenerateResearchInput } from "@/lib/domains/signals/events/research-ai";
import { eventsEnabled } from "./enabled";
export async function generateResearchAction(eventId: string, input: GenerateResearchInput) {
  try {
    const { data: { user }, error } = await createClient().auth.getUser();
    if (!eventsEnabled() || error || !user) throw new Error("事件研究尚未开启或未登录。");
    const data = await generateResearch(user.id, eventId, input);
    revalidatePath(`/signals/events/${eventId}`); return { ok: true as const, data };
  } catch (error) { return { ok: false as const, message: error instanceof Error ? error.message : "本次未生成，先前草稿仍保留。" }; }
}
