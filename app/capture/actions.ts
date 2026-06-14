"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { runInquiry, clusterObservations, themeToDirection } from "@/lib/ai";
import { PAIN_TAGS, type DirectionDraft } from "../ideas/types";

export type Observation = {
  id: string;
  raw_text: string;
  tags: string[];
  created_at: string;
};

/** 取当前登录用户 id，未登录直接抛错（中间件已挡住未登录，这里是兜底）。 */
async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

/**
 * 保存一条观察。捕捉要 30 秒内完成，所以这里只做插入、立即返回，
 * AI 追问由前端拿到结果后单独触发（generateInquiry），不阻塞输入框清空。
 */
export async function createObservation(
  rawText: string,
  tags: string[]
): Promise<Observation> {
  const text = rawText.trim();
  if (!text) throw new Error("观察内容不能为空");

  const userId = await requireUserId();

  const { data, error } = await supabaseAdmin
    .from("observations")
    .insert({ user_id: userId, raw_text: text, tags })
    .select("id, raw_text, tags, created_at")
    .single();

  if (error) throw new Error(error.message);
  return data as Observation;
}

/**
 * 对一条已保存的观察生成 AI 三问，并把对话存入 ai_sessions（role='inquirer'）。
 * 返回 3 个问题给前端展示在观察卡片下方。
 */
export async function generateInquiry(
  observationId: string,
  rawText: string
): Promise<string[]> {
  // 校验这条观察属于当前用户，避免越权写入。
  const userId = await requireUserId();
  const { data: obs, error: obsError } = await supabaseAdmin
    .from("observations")
    .select("id, user_id")
    .eq("id", observationId)
    .single();
  if (obsError) throw new Error(obsError.message);
  if (!obs || obs.user_id !== userId) throw new Error("无权访问该观察");

  const questions = await runInquiry(rawText);

  const messages = [
    { role: "user", content: rawText },
    { role: "inquirer", content: questions },
  ];

  const { error: insertError } = await supabaseAdmin
    .from("ai_sessions")
    .insert({
      observation_id: observationId,
      role: "inquirer",
      messages,
    });
  if (insertError) throw new Error(insertError.message);

  return questions;
}

export type RecurringSignal = {
  theme: string;
  count: number;
  /** 代表性观察（用于展示与"提升为想法"）。 */
  sampleText: string;
  repId: string;
  /** 该主题里若干样例观察文本（喂给 AI 逼成方向）。 */
  sampleTexts: string[];
  /** 该主题里带"真痛/愿付费"标签的观察数（痛点雷达，绝对计数）。 */
  painCount: number;
};

/**
 * 扫描当前用户近期的观察，找出反复出现的主题 + 痛感强度。
 * 把大脑会忽略的重复模式推到使用者面前（对抗盲区）。
 */
export async function findRecurringSignals(): Promise<RecurringSignal[]> {
  const userId = await requireUserId();

  const { data: obs, error } = await supabaseAdmin
    .from("observations")
    .select("id, raw_text, tags")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) throw new Error(error.message);

  const items = (obs ?? []).map((o) => ({
    id: o.id as string,
    text: o.raw_text as string,
  }));
  if (items.length < 3) return [];

  const clusters = await clusterObservations(items);
  const textById = new Map(items.map((it) => [it.id, it.text]));
  const tagsById = new Map(
    (obs ?? []).map((o) => [o.id as string, (o.tags as string[]) ?? []])
  );
  const painSet = new Set<string>(PAIN_TAGS);

  return clusters
    .map((c) => {
      const painCount = c.ids.filter((id) =>
        (tagsById.get(id) ?? []).some((t) => painSet.has(t))
      ).length;
      return {
        theme: c.theme,
        count: c.count,
        sampleText: textById.get(c.ids[0]) ?? "",
        repId: c.ids[0],
        sampleTexts: c.ids.slice(0, 3).map((id) => textById.get(id) ?? ""),
        painCount,
      };
    })
    // 痛感密集的主题排前，其次按出现次数。
    .sort((a, b) => b.painCount - a.painCount || b.count - a.count);
}

/** 把一个反复主题逼成候选方向草稿（先证伪，不评价）。 */
export async function draftDirectionFromTheme(
  theme: string,
  sampleTexts: string[]
): Promise<DirectionDraft> {
  await requireUserId();
  return themeToDirection(theme, sampleTexts);
}
