"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { clearReadingPreference, loadReadingPreferences, setReadingPreference } from "@/lib/domains/signals/reading-preferences";
import type { ReadingPreferencesState, ReadingPreferenceValue } from "@/lib/domains/signals/reading-preferences-shared";

type Result = { ok: true; state: ReadingPreferencesState } | { ok: false; message: string };

async function viewerId(): Promise<string> {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

async function refreshed(userId: string): Promise<Result> {
  const state = await loadReadingPreferences(userId);
  revalidatePath("/signals", "layout");
  return { ok: true, state };
}

export async function setReadingPreferenceAction(signalId: string, preference: ReadingPreferenceValue): Promise<Result> {
  try {
    const userId = await viewerId();
    await setReadingPreference(userId, signalId, preference);
    return await refreshed(userId);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "没能保存阅读偏好，请重试。" };
  }
}

export async function clearReadingPreferenceAction(eventKey: string): Promise<Result> {
  try {
    const userId = await viewerId();
    await clearReadingPreference(userId, eventKey);
    return await refreshed(userId);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "没能恢复默认，请重试。" };
  }
}
