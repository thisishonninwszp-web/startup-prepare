"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { appendJudgmentUpdate, listJudgmentUpdates, requireOwnJudgment } from "@/lib/domains/signals/judgment-updates";
import type { JudgmentUpdate, JudgmentUpdateInput } from "@/lib/domains/signals/judgment-updates-shared";
import { checkOutcomeEvidence } from "@/lib/domains/signals/practice";
import type { OutcomeEvidence } from "@/lib/domains/signals/practice-shared";

type Failure = { ok: false; message: string };

async function requireUserId(): Promise<string> {
  const client = createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error("未登录");
  return user.id;
}

function failure(error: unknown, fallback: string): Failure {
  return { ok: false, message: error instanceof Error ? error.message : fallback };
}

export async function loadJudgmentUpdatesAction(judgmentId: string): Promise<{ ok: true; updates: JudgmentUpdate[] } | Failure> {
  try {
    const userId = await requireUserId();
    return { ok: true, updates: await listJudgmentUpdates(userId, judgmentId) };
  } catch (error) {
    return failure(error, "判断历史没能读出来，请重试");
  }
}

export async function appendJudgmentUpdateAction(judgmentId: string, input: JudgmentUpdateInput): Promise<{ ok: true; update: JudgmentUpdate } | Failure> {
  try {
    const userId = await requireUserId();
    const update = await appendJudgmentUpdate(userId, judgmentId, input);
    revalidatePath("/signals", "layout");
    return { ok: true, update };
  } catch (error) {
    return failure(error, "新判断没有保存，请重试");
  }
}

export async function checkJudgmentEvidenceAction(judgmentId: string): Promise<{ ok: true; evidence: OutcomeEvidence } | Failure> {
  try {
    const userId = await requireUserId();
    await requireOwnJudgment(userId, judgmentId);
    const evidence = await checkOutcomeEvidence(userId, judgmentId);
    revalidatePath("/signals", "layout");
    return { ok: true, evidence };
  } catch (error) {
    return failure(error, "支持和反对证据这次没查成，请重试");
  }
}
