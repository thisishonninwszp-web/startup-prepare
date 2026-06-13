"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { runInquiry } from "@/lib/ai";

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
