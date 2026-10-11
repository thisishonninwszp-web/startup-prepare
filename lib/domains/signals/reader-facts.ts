import { supabaseAdmin } from "@/lib/supabase";
import { extractSituationFacts, type SituationFact } from "@/lib/ai";

/**
 * 从 /self 的自述里抽"处境事实"，给读新闻的 AI 当背景。
 *
 * 宪法写着"自述不进推理" —— 防的是把"我很有野心"这类自我评价当成关于自己的证据。
 * 经用户裁决（2026-10）开一个口子：只抽处境事实（工作、行业、在学、在做的事），
 * 每条必须能在原文里逐字找到出处（parseSituationFacts 核对），
 * 而且只用于判断"这条新闻跟他有没有关系"，不进 self 台账的任何推理。
 *
 * 抽一次存在 signal_profiles.facts；有比 facts_from 更新的自述时才重抽。
 */

const MAX_DECLARATIONS = 30;

export async function loadSituationFacts(userId: string): Promise<SituationFact[]> {
  const [declarations, cached] = await Promise.all([
    supabaseAdmin
      .from("self_declarations")
      .select("text, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_DECLARATIONS),
    supabaseAdmin.from("signal_profiles").select("facts, facts_from").eq("user_id", userId).maybeSingle(),
  ]);
  if (declarations.error) throw new Error(declarations.error.message);
  // 迁移 057 没跑时没有缓存列，不抽，报告照常（只是少了处境这一块）
  if (cached.error) {
    if (/facts/.test(cached.error.message)) return [];
    throw new Error(cached.error.message);
  }

  const rows = declarations.data ?? [];
  if (rows.length === 0) return [];
  const newest = rows[0].created_at as string;
  const cachedFacts = (cached.data?.facts as SituationFact[] | null) ?? null;
  const cachedFrom = (cached.data?.facts_from as string | null) ?? null;
  if (cachedFacts && cachedFrom && new Date(cachedFrom).getTime() >= new Date(newest).getTime()) {
    return cachedFacts;
  }

  // 旧的在前，让"最近的自述"在模型眼里是后来的说法
  const facts = await extractSituationFacts(rows.map((r) => r.text as string).reverse());
  const { error } = await supabaseAdmin
    .from("signal_profiles")
    .upsert(
      { user_id: userId, facts, facts_from: newest, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (error) throw new Error(error.message);
  return facts;
}
