"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addWatch, rejectMatch, removeWatch } from "@/lib/domains/signals/kanpo";

type Result = { ok: true } | { ok: false; message: string };

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function addWatchAction(input: { name_zh: string; aliases: string; note: string; case_id: string | null }): Promise<Result> {
  const userId = await requireUserId();
  try {
    await addWatch(userId, { name_zh: input.name_zh, aliases: input.aliases.split(/\r?\n/), note: input.note, case_id: input.case_id });
    revalidatePath("/signals/kanpo");
    revalidatePath("/signals/atlas");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没加上") };
  }
}

export async function removeWatchAction(id: string): Promise<Result> {
  const userId = await requireUserId();
  try {
    await removeWatch(userId, id);
    revalidatePath("/signals/kanpo");
    revalidatePath("/signals/atlas");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没删掉") };
  }
}

export async function rejectMatchAction(id: string, key: string): Promise<Result> {
  const userId = await requireUserId();
  try {
    await rejectMatch(userId, id, key);
    revalidatePath("/signals/kanpo");
    revalidatePath("/signals/atlas");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没解除") };
  }
}
