import type { RawSignal } from "../types.js";
import { PER_SOURCE_LIMIT } from "../config.js";

/**
 * 楽天市場商品搜索：从商品标题与描述里抽消费者关心的功能和痛点。
 * 需 RAKUTEN_APP_ID（免费注册 https://webservice.rakuten.co.jp）。
 */
export async function fetchRakuten(query: string): Promise<RawSignal[]> {
  const appId = process.env.RAKUTEN_APP_ID;
  if (!appId) return [];
  const params = new URLSearchParams({
    applicationId: appId,
    keyword: query,
    hits: String(PER_SOURCE_LIMIT),
    format: "json",
  });
  const res = await fetch(
    `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20170706?${params.toString()}`,
    { headers: { "User-Agent": "ideaos-crawler/0.1" } }
  );
  if (!res.ok) throw new Error(`楽天 ${res.status}`);
  const data = (await res.json()) as {
    Items?: (
      | { Item?: { itemName?: string; itemCaption?: string; itemUrl?: string; itemCode?: string } }
      | { itemName?: string; itemCaption?: string; itemUrl?: string; itemCode?: string }
    )[];
  };
  return (data.Items ?? [])
    .map((raw): RawSignal | null => {
      const it =
        "Item" in raw && raw.Item
          ? raw.Item
          : (raw as { itemName?: string; itemCaption?: string; itemUrl?: string; itemCode?: string });
      const text = (it.itemCaption ?? it.itemName ?? "").trim();
      if (!it.itemCode || !text) return null;
      return {
        source: "rakuten",
        sourceId: it.itemCode,
        url: it.itemUrl ?? null,
        title: it.itemName ?? "楽天商品",
        rawText: text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000),
        query,
      };
    })
    .filter((r): r is RawSignal => r !== null);
}
