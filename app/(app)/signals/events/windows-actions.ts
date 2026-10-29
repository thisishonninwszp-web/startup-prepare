"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadResearch, appendResearch } from "@/lib/domains/signals/events/research";
import { checkWindow, validateWindowUrl } from "@/lib/domains/signals/events/windows";
import { eventsEnabled } from "./enabled";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
async function viewerId(): Promise<string> {
  if (!eventsEnabled()) throw new Error("事件档案暂未开启。");
  const { data: { user }, error } = await createClient().auth.getUser();
  if (error || !user) throw new Error("请先登录。");
  return user.id;
}
const failure = (error: unknown) => ({ ok: false as const, message: error instanceof Error ? error.message : "保存未完成，请重试。" });

export async function addWindowAction(input: { eventId: string; url: string; field: string; cadence: "manual" | "weekly" | "monthly"; requestId: string }): Promise<Result<{ id: string }>> {
  try {
    const viewer = await viewerId();
    const url = validateWindowUrl(input.url.trim()).href;
    const field = input.field.trim();
    if (field.length > 200) throw new Error("原文标记请控制在 200 字内。");
    if (!["manual", "weekly", "monthly"].includes(input.cadence)) throw new Error("无效的检查频率。");
    const data = await appendResearch(viewer, input.eventId, { kind: "window", requestId: input.requestId, payload: { url, field, cadence: input.cadence } });
    revalidatePath(`/signals/events/${input.eventId}`);
    return { ok: true, data: { id: data.id } };
  } catch (error) { return failure(error); }
}

export async function checkWindowAction(input: { eventId: string; windowId: string; requestId: string }): Promise<Result<{ id: string }>> {
  try {
    const viewer = await viewerId();
    const research = await loadResearch(viewer, input.eventId);
    if (!research.available) throw new Error("现实观察窗口所需的数据库结构尚未开启。");
    const window = research.entries.find(entry => entry.id === input.windowId && entry.kind === "window" && entry.event_id === input.eventId && (!entry.user_id || entry.user_id === viewer));
    if (!window || typeof window.payload.url !== "string" || typeof window.payload.field !== "string") throw new Error("观察窗口不存在或无法读取。");
    const previous = research.entries.find(entry => entry.client_request_id === input.requestId);
    if (previous) {
      if (previous.kind !== "window_check" || previous.subject_id !== window.id || previous.event_id !== input.eventId || previous.user_id && previous.user_id !== viewer) throw new Error("请求编号已用于其他操作，请重新操作。");
      revalidatePath(`/signals/events/${input.eventId}`);
      return { ok: true, data: { id: previous.id } };
    }
    const result = await checkWindow(window.payload.url, window.payload.field);
    const data = await appendResearch(viewer, input.eventId, { kind: "window_check", subjectId: window.id, requestId: input.requestId, payload: { ...result } });
    revalidatePath(`/signals/events/${input.eventId}`);
    return { ok: true, data: { id: data.id } };
  } catch (error) { return failure(error); }
}

