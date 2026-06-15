import type { RawSignal, SourceFetcher } from "../types.js";
import { PER_SOURCE_LIMIT } from "../config.js";

/**
 * Reddit，走应用级 OAuth（client_credentials）。
 * 免认证的 .json 端点已被硬封 403，必须 OAuth：到 reddit.com/prefs/apps 注册一个
 * "script" 应用，把 REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET 填进 .env。
 * 未配置则静默跳过（返回空），不报错——英语圈仍有 hackernews 兜底。
 */
const UA = "web:ideaos:0.1 (signal crawler)";

type RedditChild = {
  data: {
    name: string; // 形如 t3_xxxxx，全站唯一
    title?: string;
    selftext?: string;
    permalink?: string;
    subreddit?: string;
  };
};

async function getToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Reddit 鉴权失败（${res.status}）`);
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

export const fetchReddit: SourceFetcher = async (query) => {
  const token = await getToken();
  if (!token) return []; // 未配置 OAuth → 跳过

  const params = new URLSearchParams({
    q: query,
    limit: String(PER_SOURCE_LIMIT),
    sort: "relevance",
    t: "year",
  });
  const res = await fetch(
    `https://oauth.reddit.com/search?${params.toString()}`,
    { headers: { Authorization: `bearer ${token}`, "User-Agent": UA } }
  );
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
        url: d.permalink ? `https://www.reddit.com${d.permalink}` : undefined,
        title: d.subreddit ? `r/${d.subreddit}: ${title}` : title,
        rawText: text,
        query,
      };
    })
    .filter((s): s is RawSignal => s !== null);
};
