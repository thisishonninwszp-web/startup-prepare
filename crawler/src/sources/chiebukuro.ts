import type { RawSignal } from "../types.js";
import { PER_SOURCE_LIMIT } from "../config.js";

/**
 * Yahoo! 知恵袋：日本最大 Q&A。
 * 需 YAHOO_JAPAN_APP_ID（免费注册 https://e.developer.yahoo.co.jp/register）。
 */
export async function fetchChiebukuro(query: string): Promise<RawSignal[]> {
  const appId = process.env.YAHOO_JAPAN_APP_ID;
  if (!appId) return [];
  const params = new URLSearchParams({
    appid: appId,
    query,
    output: "json",
    results: String(PER_SOURCE_LIMIT),
  });
  const res = await fetch(
    `https://chiebukuro.yahooapis.jp/api/v1/search?${params.toString()}`,
    { headers: { "User-Agent": "ideaos-crawler/0.1" } }
  );
  if (!res.ok) throw new Error(`知恵袋 ${res.status}`);
  const data = (await res.json()) as {
    ResultSet?: {
      Result?:
        | { Id?: string; Subject?: string; DetailUrl?: string; Content?: string; BestAnswer?: { Content?: string } }[]
        | { Id?: string; Subject?: string; DetailUrl?: string; Content?: string; BestAnswer?: { Content?: string } };
    };
  };
  const results = data.ResultSet?.Result;
  const items = Array.isArray(results) ? results : results ? [results] : [];
  return items
    .map((it): RawSignal | null => {
      const text = (it.BestAnswer?.Content ?? it.Content ?? it.Subject ?? "").trim();
      if (!it.Id || !text) return null;
      return {
        source: "chiebukuro",
        sourceId: it.Id,
        url: it.DetailUrl ?? null,
        title: it.Subject ?? "知恵袋",
        rawText: text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
        query,
      };
    })
    .filter((r): r is RawSignal => r !== null);
}
