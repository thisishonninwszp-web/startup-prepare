import { supabaseAdmin } from "@/lib/supabase";

/**
 * 应用内轻量抓取：HN/Reddit/V2EX 三个源本质就是 fetch()，可直接在 server action 里跑，
 * 让"外部待审"收件箱上的「抓取」按钮即时入库，无需独立进程/终端。
 *
 * 与独立 crawler/ 子项目并行：重活（Playwright 的 web 源）与定时全量仍走那边。
 * 这里只覆盖纯 API 的常用路径，写入同一张 external_signals staging 表。
 */

type StagingRow = {
  source: string;
  source_id: string;
  url: string | null;
  title: string | null;
  raw_text: string;
  query: string;
};

const PER_SOURCE_LIMIT = 10;

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

async function fetchHackerNews(query: string): Promise<StagingRow[]> {
  const params = new URLSearchParams({
    query,
    tags: "comment",
    hitsPerPage: String(PER_SOURCE_LIMIT),
  });
  const res = await fetch(
    `https://hn.algolia.com/api/v1/search?${params.toString()}`
  );
  if (!res.ok) throw new Error(`HN ${res.status}`);
  const data = (await res.json()) as {
    hits?: {
      objectID: string;
      story_title?: string | null;
      title?: string | null;
      comment_text?: string | null;
      story_text?: string | null;
    }[];
  };
  return (data.hits ?? [])
    .map((h): StagingRow | null => {
      const text = (h.comment_text ?? h.story_text ?? "").trim();
      if (!text) return null;
      return {
        source: "hackernews",
        source_id: h.objectID,
        url: `https://news.ycombinator.com/item?id=${h.objectID}`,
        title: h.story_title ?? h.title ?? "HN comment",
        raw_text: stripHtml(text),
        query,
      };
    })
    .filter((r): r is StagingRow => r !== null);
}

async function fetchReddit(query: string): Promise<StagingRow[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(PER_SOURCE_LIMIT),
    sort: "relevance",
    t: "year",
  });
  const res = await fetch(
    `https://www.reddit.com/search.json?${params.toString()}`,
    { headers: { "User-Agent": "ideaos-crawler/0.1 (by /u/ideaos)" } }
  );
  if (!res.ok) throw new Error(`Reddit ${res.status}`);
  const data = (await res.json()) as {
    data?: {
      children?: {
        data: {
          name: string;
          title?: string;
          selftext?: string;
          permalink?: string;
          subreddit?: string;
        };
      }[];
    };
  };
  return (data.data?.children ?? [])
    .map((c): StagingRow | null => {
      const d = c.data;
      const title = (d.title ?? "").trim();
      const text = (d.selftext ?? "").trim() || title;
      if (!text) return null;
      return {
        source: "reddit",
        source_id: d.name,
        url: d.permalink ? `https://www.reddit.com${d.permalink}` : null,
        title: d.subreddit ? `r/${d.subreddit}: ${title}` : title,
        raw_text: text,
        query,
      };
    })
    .filter((r): r is StagingRow => r !== null);
}

async function fetchV2ex(query: string): Promise<StagingRow[]> {
  const res = await fetch("https://www.v2ex.com/api/topics/hot.json", {
    headers: { "User-Agent": "ideaos-crawler/0.1" },
  });
  if (!res.ok) throw new Error(`V2EX ${res.status}`);
  const topics = (await res.json()) as {
    id: number;
    title?: string;
    content?: string;
    url?: string;
  }[];
  const needle = query.trim().toLowerCase();
  return topics
    .filter((t) => {
      if (!needle) return true;
      return `${t.title ?? ""} ${t.content ?? ""}`
        .toLowerCase()
        .includes(needle);
    })
    .slice(0, PER_SOURCE_LIMIT)
    .map((t): StagingRow | null => {
      const text = (t.content ?? t.title ?? "").trim();
      if (!text) return null;
      return {
        source: "v2ex",
        source_id: String(t.id),
        url: t.url ?? `https://www.v2ex.com/t/${t.id}`,
        title: t.title ?? "V2EX topic",
        raw_text: text,
        query,
      };
    })
    .filter((r): r is StagingRow => r !== null);
}

const API_SOURCES = [fetchHackerNews, fetchReddit, fetchV2ex];

/**
 * 跑所有 API 源抓 query，去重写入 external_signals。
 * 每源独立 try/catch：单源失败（限速/网络）不拖垮其余。返回新增条数。
 */
export async function crawlToStaging(query: string): Promise<number> {
  const q = query.trim();
  if (!q) return 0;

  const settled = await Promise.allSettled(API_SOURCES.map((f) => f(q)));
  const rows: StagingRow[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") rows.push(...s.value);
    else console.warn("抓取某源失败：", s.reason);
  }
  if (rows.length === 0) return 0;

  const { data, error } = await supabaseAdmin
    .from("external_signals")
    .upsert(rows, { onConflict: "source,source_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}
