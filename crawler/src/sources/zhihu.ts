import type { RawSignal } from "../types.js";
import { PER_SOURCE_LIMIT } from "../config.js";

/** 知乎：中文最大知识 Q&A，消费/商业话题覆盖广。使用非官方搜索接口，可能限速。 */
export async function fetchZhihu(query: string): Promise<RawSignal[]> {
  const params = new URLSearchParams({
    t: "content",
    q: query,
    correction: "1",
    offset: "0",
    limit: String(PER_SOURCE_LIMIT),
    search_source: "Normal",
  });
  const res = await fetch(
    `https://www.zhihu.com/api/v4/search_v3?${params.toString()}`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer:
          "https://www.zhihu.com/search?type=content&q=" +
          encodeURIComponent(query),
      },
    }
  );
  if (!res.ok) throw new Error(`知乎 ${res.status}`);
  const data = (await res.json()) as {
    data?: {
      object?: {
        id?: string | number;
        title?: string;
        question?: { title?: string; id?: number };
        excerpt?: string;
        url?: string;
      };
    }[];
  };
  return (data.data ?? [])
    .map((item): RawSignal | null => {
      const obj = item.object;
      if (!obj) return null;
      const title = obj.title ?? obj.question?.title ?? "";
      const text = (obj.excerpt ?? title).trim();
      if (!text) return null;
      const id = String(obj.id ?? obj.question?.id ?? Math.random());
      const url =
        obj.url ??
        (obj.question?.id
          ? `https://www.zhihu.com/question/${obj.question.id}`
          : null);
      return {
        source: "zhihu",
        sourceId: id,
        url,
        title: title || "知乎",
        rawText: text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
        query,
      };
    })
    .filter((r): r is RawSignal => r !== null);
}
