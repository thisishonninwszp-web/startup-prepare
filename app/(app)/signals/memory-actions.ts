"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  askArchive,
  marksFor,
  searchArchive,
  searchOpportunities,
  setMark,
  type ArchiveAnswer,
  type ArchiveHit,
  type Mark,
  type MarkKind,
  type TimelineEvent,
} from "@/lib/domains/signals/memory";
import { sharedViewFor } from "@/lib/domains/signals/users";
import { tokyoToday } from "@/lib/domains/signals/brief";
import { confirmResolution, revealQuestion, setMyForecast } from "@/lib/domains/signals/forecast";
import { saveExperimentForecast } from "@/lib/domains/signals/experiments";
import { rateRecall, recallReveal, type RecallReveal } from "@/lib/domains/signals/recall";
import type { RecallResult } from "@/lib/domains/signals/recall-shared";
import type { ExperimentKind } from "@/lib/domains/signals/experiments-shared";

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** 在存档里找（关键词 + 按意思），顺带时差图谱、官报里对得上的（排时间线用）。 */
export async function searchArchiveAction(
  query: string
): Promise<{ ok: true; hits: ArchiveHit[]; marks: Record<string, Mark>; extras: TimelineEvent[] } | { ok: false; message: string }> {
  try {
    const userId = await requireUserId();
    const view = await sharedViewFor(userId);
    const [hits, extras] = await Promise.all([
      searchArchive(query),
      // 图谱是查出来的世界上的事，不是谁的私事：朋友的账号也查主账号攒的那份
      searchOpportunities(query, view.sourceUserId).catch((e) => {
        console.error("search opportunities", e);
        return [] as TimelineEvent[];
      }),
    ]);
    const marks = await marksFor(userId, hits.map((h) => h.id));
    return { ok: true, hits, marks: Object.fromEntries(marks), extras };
  } catch (error) {
    return { ok: false, message: message(error, "这次没找成") };
  }
}

/** 问存档（只许引用存档里找到的那几条）。 */
export async function askArchiveAction(question: string): Promise<{ ok: true; answer: ArchiveAnswer } | { ok: false; message: string }> {
  try {
    await requireUserId();
    return { ok: true, answer: await askArchive(question) };
  } catch (error) {
    return { ok: false, message: message(error, "这次没答成") };
  }
}

/** 标一下（重要 / 跟我有关 / 存疑），null = 取消。 */
export async function setMarkAction(signalId: string, mark: MarkKind | null, note = ""): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const userId = await requireUserId();
    await setMark(userId, signalId, mark, note);
    revalidatePath("/signals/memory");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: message(error, "没标上") };
  }
}

export async function setMyForecastAction(questionId: string, probability: number): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const userId = await requireUserId();
    await setMyForecast(userId, questionId, probability, tokyoToday());
    revalidatePath("/signals/forecast");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: message(error, "没记上") };
  }
}

export async function revealQuestionAction(questionId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const userId = await requireUserId();
    await revealQuestion(userId, questionId);
    revalidatePath("/signals/forecast");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: message(error, "没打开") };
  }
}

export async function confirmResolutionAction(questionId: string, verdict: "yes" | "no" | "void", note = ""): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const userId = await requireUserId();
    await confirmResolution(userId, questionId, verdict, note);
    revalidatePath("/signals/forecast");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: message(error, "没记上") };
  }
}

/** 先猜一个自己实验的结果（题目、门槛由服务器重新算）。 */
export async function saveExperimentForecastAction(
  pick: { kind: ExperimentKind; targetId: string; platform: string },
  probability: number
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const userId = await requireUserId();
    await saveExperimentForecast(userId, tokyoToday(), pick, probability);
    revalidatePath("/signals/forecast");
    revalidatePath("/signals/gaps/door");
    revalidatePath("/signals");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: message(error, "没记上") };
  }
}

/** 回想：他想过以后看答案。 */
export async function recallRevealAction(signalId: string): Promise<{ ok: true; reveal: RecallReveal } | { ok: false; message: string }> {
  try {
    const userId = await requireUserId();
    return { ok: true, reveal: await recallReveal(userId, signalId) };
  } catch (error) {
    return { ok: false, message: message(error, "没取到") };
  }
}

/** 回想：记得 / 模糊 / 忘了，排下一次。 */
export async function rateRecallAction(signalId: string, result: RecallResult): Promise<{ ok: true; next: string } | { ok: false; message: string }> {
  try {
    const userId = await requireUserId();
    const next = await rateRecall(userId, signalId, result, tokyoToday());
    revalidatePath("/signals");
    revalidatePath("/signals/memory");
    return { ok: true, next };
  } catch (error) {
    return { ok: false, message: message(error, "没记上") };
  }
}
