"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { challengeWithSelf } from "@/lib/ai";
import { parseAiErrorMessage } from "@/lib/ai-error";
import { getSelfContextState, getLinkedSelfRecords, getSelfRecord, requireSelfTarget, setSelfLink } from "./queries";
import { parseTarget, parseSource, type SelfTarget, type SelfSource, type SelfRecord } from "./domain";

async function userId(): Promise<string> {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) throw new Error("请先登录，再关联自己的记录");
  return user.id;
}
async function result<T>(operation: () => Promise<T>): Promise<{ data: T; error?: never } | { error: string; data?: never }> {
  try { return { data: await operation() }; }
  catch (error) {
    const message = error instanceof Error ? error.message : "暂时没有完成，请重试";
    return { error: parseAiErrorMessage(message)?.message ?? message };
  }
}

export async function loadDecisionSelfContext(target: SelfTarget) {
  return result(async () => getSelfContextState(await userId(), parseTarget(target.type, target.id)));
}

export async function changeDecisionSelfLink(target: SelfTarget, source: SelfSource, selected: boolean) {
  return result(async () => {
    const user = await userId();
    const validTarget = parseTarget(target.type, target.id);
    const validSource = parseSource(source.type, source.id);
    await setSelfLink(user, validTarget, validSource, selected);
    revalidatePath(`/workbench/${target.type}/${target.id}`);
    return { ...validSource, record: selected ? await getSelfRecord(user, validSource) : null };
  });
}

export async function questionDecisionWithSelf(target: SelfTarget) {
  return result(async () => {
    const user = await userId();
    const validTarget = parseTarget(target.type, target.id);
    const decision = await requireSelfTarget(user, validTarget, true);
    const links = await getLinkedSelfRecords(user, validTarget);
    if (links.some((link) => !link.record)) throw new Error("有已关联的记录无法读取，请先移除失效记录");
    const records = links.map((link) => link.record).filter((record): record is SelfRecord => record !== null);
    return { challenge: await challengeWithSelf(decision.context, records), records };
  });
}
