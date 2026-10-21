/**
 * Reddit 官方接口：应用级 OAuth（client_credentials）。免登录的 .json 地址已被硬封 403、robots.txt 也不许爬，只能走这条。
 * 要配 REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET（reddit.com/prefs/apps 建一个 script 类应用；2025-11 起新应用还要向 Reddit 申请、
 * 人工审批才能用）。没配返回 null。
 * 材料抓取和「听一听」共用。
 */

export const REDDIT_UA = "web:ideaos:0.1 (signal crawler)";

let cached: { token: string; until: number } | null = null;

export async function redditToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (cached && cached.until > Date.now()) return cached.token;
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": REDDIT_UA,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Reddit 鉴权失败 ${res.status}`);
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  cached = { token: data.access_token, until: Date.now() + Math.max(60, (data.expires_in ?? 3600) - 60) * 1000 };
  return data.access_token;
}
