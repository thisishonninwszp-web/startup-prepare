"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { AiGatewayError, humanAiErrorMessage } from "@/lib/ai-gateway";
import { fetchDailyNews } from "@/lib/domains/signals/daily-news";
import { ensureSignalAnalysis, type StoredHistory } from "@/lib/domains/signals/analysis";
import { ensureSignalHistory } from "@/lib/domains/signals/history";
import { draftNodeBayes, expandInference, saveNodeBayes } from "@/lib/domains/signals/inference";
import type { BayesState, InferenceNode } from "@/lib/domains/signals/inference-shared";
import { generateBrief } from "@/lib/domains/signals/brief";
import { newsSourceLabel, type SignalKind } from "@/lib/domains/signals/feeds";
import { fetchGithubTools } from "@/lib/domains/signals/github";
import {
  resolveJudgment,
  retryJudgmentFeedback,
  submitJudgment,
  type ConfidenceKey,
  type HorizonKey,
} from "@/lib/domains/signals/practice";
import { createObservation } from "../capture/actions";
import { EXTERNAL_TAG } from "../ideas/types";

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

async function getPendingSignal(id: string) {
  const { data: row, error } = await supabaseAdmin
    .from("external_signals")
    .select("id, status, source, title, url")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  if (row.status !== "pending") throw new Error("这条已经处理过了");
  return {
    title: (row.title as string | null) ?? "",
    source: newsSourceLabel(row.source as string),
    url: (row.url as string | null) ?? "",
  };
}

export async function refreshSignals(
  kind: SignalKind
): Promise<{ inserted: number; failed: string[] }> {
  await requireUserId();
  if (kind === "tools") {
    const { inserted } = await fetchGithubTools();
    revalidatePath("/signals");
    return { inserted, failed: [] };
  }
  const { inserted, failed } = await fetchDailyNews();
  revalidatePath("/signals");
  return { inserted, failed };
}

/**
 * 记一笔：新闻 + 你为什么在意 → 一条带"外部"标签的观察。
 * 走观察而不是材料箱，是为了让它和平时的观察一起进痛点雷达、进周复盘。
 * 你的那句话放最前面 —— 新闻本身不是信号，你对它的反应才是。
 */
export async function keepSignal(id: string, note: string): Promise<string> {
  await requireUserId();
  const signal = await getPendingSignal(id);

  const text = [
    note.trim(),
    `读到：${signal.title}（${signal.source}）`,
    signal.url,
  ]
    .filter(Boolean)
    .join("\n");

  const observation = await createObservation(text, [EXTERNAL_TAG]);

  const { error: updateError } = await supabaseAdmin
    .from("external_signals")
    .update({ status: "promoted", promoted_observation_id: observation.id })
    .eq("id", id);
  if (updateError) throw new Error(updateError.message);

  revalidatePath("/signals");
  revalidatePath("/capture");
  return observation.id;
}

export async function dismissSignal(id: string): Promise<void> {
  await requireUserId();
  const { error } = await supabaseAdmin
    .from("external_signals")
    .update({ status: "dismissed" })
    .eq("id", id)
    .eq("status", "pending");
  if (error) throw new Error(error.message);
  revalidatePath("/signals");
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof AiGatewayError) return humanAiErrorMessage(error.code);
  return error instanceof Error ? error.message : fallback;
}

/** 详情页的深读：第一次生成并存下，之后直接读。 */
export async function analyzeSignal(
  id: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    await ensureSignalAnalysis(userId, id);
    revalidatePath(`/signals/${id}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "深读没生成出来") };
  }
}

/** 页面上手动生成今天的精选（cron 没跑、或者刚写了背景想马上看）。 */
export async function generateBriefNow(
  kind: SignalKind
): Promise<{ ok: true; count: number } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    let items = await generateBrief(userId, kind);
    if (items === null) {
      // 还没抓过这一类（比如刚加的源、或 cron 还没跑）：先抓一轮再挑
      if (kind === "tools") await fetchGithubTools();
      else await fetchDailyNews();
      items = await generateBrief(userId, kind);
    }
    revalidatePath("/signals");
    return { ok: true, count: items?.length ?? 0 };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "精选没生成出来") };
  }
}

// ── 读新闻练判断 ───────────────────────────────────────────────────────────

/** 先写判断：存进 predictions + signal_judgments，再让 AI 挑刺。 */
export async function submitJudgmentAction(input: {
  signalId: string;
  question: string;
  judgment: string;
  horizon: HorizonKey;
  confidence: ConfidenceKey | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    await submitJudgment({ userId, ...input });
    revalidatePath("/signals");
    revalidatePath(`/signals/${input.signalId}`);
    revalidatePath("/signals/practice");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "判断没存上") };
  }
}

/** 到期对账：看对了 / 看错了，可以补一句为什么。 */
export async function resolveJudgmentAction(
  predictionId: string,
  outcome: "hit" | "miss",
  note: string
): Promise<void> {
  const userId = await requireUserId();
  await resolveJudgment(userId, predictionId, outcome, note);
  revalidatePath("/signals");
  revalidatePath("/signals/practice");
}

export async function retryJudgmentFeedbackAction(
  judgmentId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    await retryJudgmentFeedback(userId, judgmentId);
    revalidatePath("/signals");
    revalidatePath("/signals/practice");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "挑刺没生成出来") };
  }
}

// ── 历史上类似的事 ─────────────────────────────────────────────────────────

/** 第一次点开时生成并存下，之后直接读。写判断之前就能看。 */
export async function ensureHistoryAction(
  signalId: string
): Promise<{ ok: true; history: StoredHistory } | { ok: false; message: string }> {
  await requireUserId();
  try {
    return { ok: true, history: await ensureSignalHistory(signalId) };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "历史参照没生成出来") };
  }
}

// ── 往下推 ─────────────────────────────────────────────────────────────────

/** 推某一步的下一层（parentId 为 null 时推第一层）。给了 direction 就按方向另推一组。 */
export async function expandInferenceAction(
  signalId: string,
  parentId: string | null,
  direction?: string
): Promise<{ ok: true; nodes: InferenceNode[] } | { ok: false; message: string }> {
  await requireUserId();
  try {
    return { ok: true, nodes: await expandInference(signalId, parentId, direction) };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没推出来") };
  }
}

/** 贝叶斯草稿：AI 只给粗档，返回给页面让用户改，不落库。 */
export async function draftBayesAction(
  signalId: string,
  nodeId: string
): Promise<{ ok: true; state: BayesState } | { ok: false; message: string }> {
  await requireUserId();
  try {
    return { ok: true, state: await draftNodeBayes(signalId, nodeId) };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "草稿没起出来") };
  }
}

export async function saveBayesAction(
  signalId: string,
  nodeId: string,
  state: BayesState
): Promise<{ ok: true; nodes: InferenceNode[] } | { ok: false; message: string }> {
  await requireUserId();
  try {
    return { ok: true, nodes: await saveNodeBayes(signalId, nodeId, state) };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没存上") };
  }
}
