"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { analyzeNewsItem, type NewsAnalysis } from "@/lib/ai";
import { AiGatewayError, humanAiErrorMessage } from "@/lib/ai-gateway";
import { fetchDailyNews } from "@/lib/domains/signals/daily-news";
import { fetchArticleBody } from "@/lib/domains/signals/article";
import { generateBrief, loadSignalReader } from "@/lib/domains/signals/brief";
import { newsSourceLabel, type SignalKind } from "@/lib/domains/signals/feeds";
import { fetchGithubTools } from "@/lib/domains/signals/github";
import { usableSummary } from "@/lib/domains/signals/summary";
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
    .select("id, status, source, title, url, raw_text")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  if (row.status !== "pending") throw new Error("这条已经处理过了");
  return {
    title: (row.title as string | null) ?? "",
    rawText: row.raw_text as string,
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

export type AnalyzeSignalResult =
  | { ok: true; analysis: NewsAnalysis }
  | { ok: false; message: string };

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof AiGatewayError) return humanAiErrorMessage(error.code);
  return error instanceof Error ? error.message : fallback;
}

/** 这条意味着什么：读正文（拿得到的话）+ 你写的背景 + 想法和梦想的标题。结果不落库。 */
export async function analyzeSignal(id: string): Promise<AnalyzeSignalResult> {
  const userId = await requireUserId();
  try {
    const signal = await getPendingSignal(id);
    const [reader, body] = await Promise.all([
      loadSignalReader(userId),
      fetchArticleBody(signal.url),
    ]);
    const analysis = await analyzeNewsItem({
      ...reader,
      title: signal.title,
      summary: usableSummary(signal.title, signal.rawText),
      body,
      source: signal.source,
    });
    return { ok: true, analysis };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "分析失败") };
  }
}

/** 页面上手动生成今天的精选（cron 没跑、或者刚写了背景想马上看）。 */
export async function generateBriefNow(
  kind: SignalKind
): Promise<{ ok: true; count: number } | { ok: false; message: string }> {
  const userId = await requireUserId();
  try {
    const items = await generateBrief(userId, kind);
    revalidatePath("/signals");
    return { ok: true, count: items.length };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "精选没生成出来") };
  }
}

/** AI 读新闻时知道的"你"。写过之后，每天早上 cron 才会给你生成精选。 */
export async function saveSignalContext(context: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabaseAdmin
    .from("signal_profiles")
    .upsert(
      { user_id: userId, context: context.trim().slice(0, 1000), updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (error) throw new Error(error.message);
  revalidatePath("/signals");
}
