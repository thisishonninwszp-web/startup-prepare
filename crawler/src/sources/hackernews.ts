import type { RawSignal, SourceFetcher } from "../types.js";
import { PER_SOURCE_LIMIT } from "../config.js";

/**
 * Hacker News，走 Algolia 公共搜索 API（免登录、免反爬、稳定）。
 * 搜评论（comment）而非帖子——真实抱怨/痛点通常藏在评论里。
 * 文档：https://hn.algolia.com/api
 */
const ALGOLIA = "https://hn.algolia.com/api/v1/search";

type AlgoliaHit = {
  objectID: string;
  title?: string | null;
  story_title?: string | null;
  comment_text?: string | null;
  story_text?: string | null;
  url?: string | null;
  story_url?: string | null;
};

export const fetchHackerNews: SourceFetcher = async (query) => {
  const params = new URLSearchParams({
    query,
    tags: "comment",
    hitsPerPage: String(PER_SOURCE_LIMIT),
  });
  const res = await fetch(`${ALGOLIA}?${params.toString()}`);
  if (!res.ok) throw new Error(`HN Algolia 失败（${res.status}）`);

  const data = (await res.json()) as { hits?: AlgoliaHit[] };
  const hits = data.hits ?? [];

  return hits
    .map((h): RawSignal | null => {
      const text = (h.comment_text ?? h.story_text ?? "").trim();
      if (!text) return null;
      return {
        source: "hackernews",
        sourceId: h.objectID,
        url: `https://news.ycombinator.com/item?id=${h.objectID}`,
        title: h.story_title ?? h.title ?? "HN comment",
        // comment_text 是 HTML，去掉标签留纯文本给人读/喂 AI。
        rawText: stripHtml(text),
        query,
      };
    })
    .filter((s): s is RawSignal => s !== null);
};

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/\s+/g, " ")
    .trim();
}
