/**
 * 谁能用这个网站（中间件和后台都用，不碰数据库）：
 * - IDEAOS_USER_EMAIL：主账号（他自己）。每天的报告、预测题都以这个账号为准。
 * - IDEAOS_MEMBERS：另外允许用的邮箱（朋友），逗号或空格隔开。
 * 两个都没配 = 谁注册都能用（原来的样子）；配了任何一个，不在名单上的账号登录后只看到「还没对你开放」，
 * 用不了任何 AI 功能（免得陌生人注册来花他的钱）。
 */

const norm = (e: string) => e.trim().toLowerCase();

export function ownerEmail(env: Record<string, string | undefined> = process.env): string | null {
  const e = norm(env.IDEAOS_USER_EMAIL ?? "");
  return e || null;
}

/** 朋友们的邮箱（不含主账号），小写、去重。 */
export function memberEmails(env: Record<string, string | undefined> = process.env): string[] {
  const owner = ownerEmail(env);
  return Array.from(new Set((env.IDEAOS_MEMBERS ?? "").split(/[\s,，;；]+/).map(norm).filter((e) => e.includes("@") && e !== owner)));
}

/** 这个邮箱能不能用：没配名单时谁都能用；配了就只认主账号和名单上的。 */
export function isAllowedEmail(email: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  const owner = ownerEmail(env);
  const members = memberEmails(env);
  if (!owner && members.length === 0) return true;
  const e = norm(email ?? "");
  return !!e && (e === owner || members.includes(e));
}
