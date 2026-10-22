import { supabaseAdmin } from "@/lib/supabase";
import { resolveContextUser } from "@/lib/domains/ai-context/load";

/**
 * 后台（每天的报告、提醒邮件、预测账本、算指纹以外的活）给哪些账号跑。
 * 配了 IDEAOS_USER_EMAIL 就只给那一个账号 —— 单人用，别的（测试时注册的）账号不再每天花 AI 的钱，
 * 邮件和今日总览也不会落到别的账号上；没配就照旧给最近一个月用过报告的账号。
 */
export async function signalUserIds(): Promise<string[]> {
  const email = process.env.IDEAOS_USER_EMAIL?.trim();
  if (email) return [(await resolveContextUser(email)).id];
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin.from("signal_briefs").select("user_id").gte("brief_date", monthAgo);
  if (error) throw new Error(error.message);
  return Array.from(new Set((data ?? []).map((r) => r.user_id as string)));
}
