import type { RawSignal, SourceFetcher } from "../types.js";
import { PER_SOURCE_LIMIT } from "../config.js";

/**
 * Reddit，走公共 .json 搜索端点（免登录）。
 * 注意：Reddit 要求带 User-Agent，否则常返回 429。匿名端点有速率限制，
 * watchlist 跑多关键词时 pipeline 已串行 + 限速。
 */
const SEARCH = "https://www.reddit.com/search.json";
const UA = "ideaos-crawler/0.1 (by /u/ideaos)";

type RedditChild = {
  data: {
    name: string; // 形如 t3_xxxxx，全站唯一
    title?: string;
    selftext?: string;
    permalink?: string;
    subreddit?: string;
  };
};

export const fetchReddit: SourceFetcher = async (query) => {
  const params = new URLSearchParams({
    q: query,
    limit: String(PER_SOURCE_LIMIT),
    sort: "relevance",
    t: "year",
  });
  const res = await fetch(`${SEARCH}?${params.toString()}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`Reddit 搜索失败（${res.status}）`);

  const data = (await res.json()) as { data?: { children?: RedditChild[] } };
  const children = data.data?.children ?? [];

  return children
    .map((c): RawSignal | null => {
      const d = c.data;
      const body = (d.selftext ?? "").trim();
      const title = (d.title ?? "").trim();
      // selftext 常为空（链接帖），退回标题；两者都空就丢。
      const text = body || title;
      if (!text) return null;
      return {
        source: "reddit",
        sourceId: d.name,
        url: d.permalink
          ? `https://www.reddit.com${d.permalink}`
          : undefined,
        title: d.subreddit ? `r/${d.subreddit}: ${title}` : title,
        rawText: text,
        query,
      };
    })
    .filter((s): s is RawSignal => s !== null);
};
