import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 邮件里「点一下就完成」的链接（/a/<口令>）：标新闻、给预测题点一档、回想。不用登录 ——
 * 口令里写着是谁、做什么、对哪一条、哪个值、什么时候过期，用服务器的密钥签名（ACTION_SECRET，没配就用 CRON_SECRET）。
 * 点开只是一页「确认」，按了按钮才算（邮箱的安全扫描会预先打开链接，不能一打开就记上）。
 * list：一分钟清单那一页（t 是哪一天），一页里点好几件，每个按钮再验一次口令。
 */

export type ActionKind = "mark" | "forecast" | "recall" | "list" | "listen";
export type ActionPayload = { u: string; k: ActionKind; t: string; v: string; e: number };

/** 链接几天内有效。 */
export const ACTION_TTL_DAYS = 7;
/** 一分钟清单的链接几天内有效（单件的 7 天；清单能点的事更多，短一点）。 */
export const LIST_TTL_DAYS = 3;

export function actionSecret(env: Record<string, string | undefined> = process.env): string | null {
  return env.ACTION_SECRET || env.CRON_SECRET || null;
}

const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("base64url");

export function signAction(p: Omit<ActionPayload, "e">, secret: string, now = Date.now(), ttlDays = ACTION_TTL_DAYS): string {
  const body = Buffer.from(JSON.stringify({ ...p, e: Math.floor(now / 1000) + ttlDays * 86_400 })).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** 验签名、验格式、验过期；不对返回 null。 */
export function verifyAction(token: string, secret: string, now = Date.now()): ActionPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(body, secret));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ActionPayload;
    if (typeof p.u !== "string" || typeof p.t !== "string" || typeof p.v !== "string" || typeof p.e !== "number") return null;
    if (!["mark", "forecast", "recall", "list", "listen"].includes(p.k)) return null;
    return p.e * 1000 >= now ? p : null;
  } catch {
    return null;
  }
}

export function actionUrl(base: string, token: string): string {
  return `${base}/a/${token}`;
}
