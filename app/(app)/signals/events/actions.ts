"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createEvent, includeSignal, excludeSignal, updateEvent } from "@/lib/domains/signals/events/commands";
import { listEvents, suggestMembers, listMembershipHistory } from "@/lib/domains/signals/events/queries";
import { eventsEnabled } from "./enabled";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

async function viewerId(): Promise<string> {
  if (!eventsEnabled()) throw new Error("事件档案暂未开启，现有新闻阅读不受影响。");
  const { data: { user }, error } = await createClient().auth.getUser();
  if (error || !user) throw new Error("请先登录。");
  return user.id;
}

function failure(error: unknown) {
  return { ok: false as const, message: error instanceof Error ? error.message : "这次操作没有完成，输入仍在，请重试。" };
}

export async function createEventAction(input: Parameters<typeof createEvent>[1]): Promise<Result<{ id: string }>> {
  try {
    const data = await createEvent(await viewerId(), input);
    revalidatePath("/signals/events");
    return { ok: true, data };
  } catch (error) { return failure(error); }
}

export async function updateEventAction(input: Parameters<typeof updateEvent>[1]): Promise<Result<null>> {
  try {
    await updateEvent(await viewerId(), input);
    revalidatePath(`/signals/events/${input.eventId}`);
    revalidatePath("/signals/events");
    revalidatePath("/signals/memory");
    return { ok: true, data: null };
  } catch (error) { return failure(error); }
}

export async function includeSignalAction(input: Parameters<typeof includeSignal>[1]): Promise<Result<{ revision: number }>> {
  try {
    const data = await includeSignal(await viewerId(), input);
    revalidatePath(`/signals/events/${input.eventId}`);
    revalidatePath("/signals/events");
    return { ok: true, data };
  } catch (error) { return failure(error); }
}

export async function excludeSignalAction(input: Parameters<typeof excludeSignal>[1]): Promise<Result<{ revision: number }>> {
  try {
    const data = await excludeSignal(await viewerId(), input);
    revalidatePath(`/signals/events/${input.eventId}`);
    return { ok: true, data };
  } catch (error) { return failure(error); }
}

export async function listEventsAction(search = ""): Promise<Result<Awaited<ReturnType<typeof listEvents>>>> {
  try { return { ok: true, data: await listEvents(await viewerId(), { search: String(search).slice(0, 120), limit: 20 }) }; }
  catch (error) { return failure(error); }
}

export async function loadCandidatesAction(eventId: string): Promise<Result<Awaited<ReturnType<typeof suggestMembers>>>> {
  try { return { ok: true, data: await suggestMembers(await viewerId(), eventId, { limit: 20 }) }; }
  catch (error) { return failure(error); }
}

export async function loadEventHistoryAction(eventId: string): Promise<Result<Awaited<ReturnType<typeof listMembershipHistory>>>> {
  try { return { ok: true, data: await listMembershipHistory(await viewerId(), eventId) }; }
  catch (error) { return failure(error); }
}
