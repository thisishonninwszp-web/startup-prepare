import type { RawSignal, SourceFetcher } from "../types.js";
import { PER_SOURCE_LIMIT } from "../config.js";

/**
 * Qiita（日本最大的技术/创作者社区），走公共 API v2（免登录，匿名 60 次/小时）。
 * 盯日本市场的真实讨论与痛点。文档：https://qiita.com/api/v2/docs
 */
const ITEMS = "https://qiita.com/api/v2/items";

type QiitaItem = {
  id: string;
  title?: string;
  url?: string;
  body?: string;
};

export const fetchQiita: SourceFetcher = async (query) => {
  const params = new URLSearchParams({
    query,
    per_page: String(PER_SOURCE_LIMIT),
  });
  const res = await fetch(`${ITEMS}?${params.toString()}`);
  if (!res.ok) throw new Error(`Qiita 失败（${res.status}）`);

  const items = (await res.json()) as QiitaItem[];

  return items
    .map((it): RawSignal | null => {
      const text = (it.body ?? it.title ?? "").trim();
      if (!text) return null;
      return {
        source: "qiita",
        sourceId: it.id,
        url: it.url,
        title: it.title ?? "Qiita",
        rawText: text.slice(0, 4000),
        query,
      };
    })
    .filter((s): s is RawSignal => s !== null);
};
