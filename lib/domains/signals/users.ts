import { supabaseAdmin } from "@/lib/supabase";
import { resolveContextUser } from "@/lib/domains/ai-context/load";
import { memberEmails, ownerEmail } from "@/lib/members";

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

let ownerCache: { id: string | null; at: number } | null = null;

/** 主账号（IDEAOS_USER_EMAIL）的 id；没配或找不到返回 null。查一次缓存十分钟。 */
export async function ownerUserId(): Promise<string | null> {
  const email = ownerEmail();
  if (!email) return null;
  if (ownerCache && Date.now() - ownerCache.at < 600_000) return ownerCache.id;
  const id = await resolveContextUser(email)
    .then((u) => u.id)
    .catch(() => null);
  ownerCache = { id, at: Date.now() };
  return id;
}

/**
 * 这个账号看的是谁的报告、谁的预测题：没配主账号、或者自己就是主账号 → 自己的；
 * 别的账号（朋友）→ 主账号那一份（共用，去掉只关于主账号的那几句）。
 */
export async function sharedViewFor(userId: string): Promise<{ sourceUserId: string; shared: boolean }> {
  const owner = await ownerUserId();
  return owner && owner !== userId ? { sourceUserId: owner, shared: true } : { sourceUserId: userId, shared: false };
}

/** 名单上已经注册了的朋友（发公共提醒邮件用）。 */
export async function memberAccounts(): Promise<{ id: string; email: string }[]> {
  const emails = memberEmails();
  if (emails.length === 0) return [];
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) throw new Error(error.message);
  return data.users.filter((u) => u.email && emails.includes(u.email.toLowerCase())).map((u) => ({ id: u.id, email: u.email as string }));
}
