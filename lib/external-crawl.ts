import { supabaseAdmin } from "@/lib/supabase";
import { translateQuery, type QueryTranslations } from "@/lib/ai";

/**
 * 应用内多国抓取：把关键词翻成中/英/日，分别喂给各语言的社区源，结果带地区。
 * 三个源本质就是 fetch()，可直接在 server action 里跑，让收件箱「抓取」按钮即时入库。
 *
 * 与独立 crawler/ 子项目并行：重活（Playwright 的 web 源）与定时全量仍走那边。
 * "哪个国家"是源的固定属性（见 SOURCES.lang）——无需检测、无需改表，展示时按 source 映射。
 */

export type SourceLang = "en" | "zh" | "ja";

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

const REDDIT_UA = "web:ideaos:0.1 (signal crawler)";

/**
 * Reddit 走应用级 OAuth（client_credentials）——免认证端点已被硬封 403。
 * 需配 REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET（reddit.com/prefs/apps 注册 script app）。
 * 未配置则静默跳过（返回空），不报错、不刷屏。
 */
async function redditToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": REDDIT_UA,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Reddit 鉴权失败 ${res.status}`);
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

async function fetchReddit(query: string): Promise<StagingRow[]> {
  const token = await redditToken();
  if (!token) return []; // 未配置 OAuth → 跳过
  const params = new URLSearchParams({
    q: query,
    limit: String(PER_SOURCE_LIMIT),
    sort: "relevance",
    t: "year",
  });
  const res = await fetch(
    `https://oauth.reddit.com/search?${params.toString()}`,
    { headers: { Authorization: `bearer ${token}`, "User-Agent": REDDIT_UA } }
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

async function fetchQiita(query: string): Promise<StagingRow[]> {
  const params = new URLSearchParams({
    query,
    per_page: String(PER_SOURCE_LIMIT),
  });
  const res = await fetch(`https://qiita.com/api/v2/items?${params.toString()}`);
  if (!res.ok) throw new Error(`Qiita ${res.status}`);
  const items = (await res.json()) as {
    id: string;
    title?: string;
    url?: string;
    body?: string;
  }[];
  return items
    .map((it): StagingRow | null => {
      const text = (it.body ?? it.title ?? "").trim();
      if (!text) return null;
      return {
        source: "qiita",
        source_id: it.id,
        url: it.url ?? null,
        title: it.title ?? "Qiita",
        raw_text: text.slice(0, 4000),
        query,
      };
    })
    .filter((r): r is StagingRow => r !== null);
}

async function fetchDevTo(query: string): Promise<StagingRow[]> {
  // Dev.to 按 tag 检索；多词关键词去空格后作为 tag（e.g. "founderburout"效果有限，单词效果最好）
  const tag = query.trim().toLowerCase().replace(/\s+/g, "");
  const params = new URLSearchParams({ tag, per_page: String(PER_SOURCE_LIMIT) });
  const res = await fetch(`https://dev.to/api/articles?${params.toString()}`, {
    headers: { "User-Agent": "ideaos-crawler/0.1" },
  });
  if (!res.ok) throw new Error(`Dev.to ${res.status}`);
  const items = (await res.json()) as {
    id: number;
    title?: string;
    description?: string;
    url?: string;
    slug?: string;
    username?: string;
  }[];
  return items
    .map((it): StagingRow | null => {
      const text = (it.description ?? it.title ?? "").trim();
      if (!text) return null;
      return {
        source: "devto",
        source_id: String(it.id),
        url: it.url ?? null,
        title: it.title ?? "Dev.to article",
        raw_text: text,
        query,
      };
    })
    .filter((r): r is StagingRow => r !== null);
}

async function fetchLobsters(query: string): Promise<StagingRow[]> {
  const params = new URLSearchParams({ q: query, what: "stories", order: "newest" });
  const res = await fetch(`https://lobste.rs/search.json?${params.toString()}`, {
    headers: { "User-Agent": "ideaos-crawler/0.1" },
  });
  if (!res.ok) throw new Error(`Lobste.rs ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  const hits = (
    Array.isArray(data.results)
      ? data.results
      : Array.isArray(data.hits)
        ? data.hits
        : []
  ) as {
    short_id?: string;
    title?: string;
    url?: string;
    description?: string;
    comments_url?: string;
  }[];
  return hits
    .slice(0, PER_SOURCE_LIMIT)
    .map((h): StagingRow | null => {
      const text = (h.description ?? h.title ?? "").trim();
      if (!text) return null;
      return {
        source: "lobsters",
        source_id: h.short_id ?? h.url ?? String(Date.now() + Math.random()),
        url: h.comments_url ?? h.url ?? null,
        title: h.title ?? "Lobste.rs",
        raw_text: text,
        query,
      };
    })
    .filter((r): r is StagingRow => r !== null);
}

/**
 * Yahoo! 知恵袋：日本最大 Q&A，消费者真实提问，免费 App ID。
 * 注册：https://e.developer.yahoo.co.jp/register → 拿 Client ID 填 YAHOO_JAPAN_APP_ID。
 * 未配置则静默跳过。
 */
async function fetchChiebukuro(query: string): Promise<StagingRow[]> {
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
        | {
            Id?: string;
            Subject?: string;
            DetailUrl?: string;
            Content?: string;
            BestAnswer?: { Content?: string };
          }[]
        | {
            Id?: string;
            Subject?: string;
            DetailUrl?: string;
            Content?: string;
            BestAnswer?: { Content?: string };
          };
    };
  };
  const results = data.ResultSet?.Result;
  const items = Array.isArray(results) ? results : results ? [results] : [];
  return items
    .map((it): StagingRow | null => {
      const text = (it.BestAnswer?.Content ?? it.Content ?? it.Subject ?? "").trim();
      if (!it.Id || !text) return null;
      return {
        source: "chiebukuro",
        source_id: it.Id,
        url: it.DetailUrl ?? null,
        title: it.Subject ?? "知恵袋",
        raw_text: stripHtml(text),
        query,
      };
    })
    .filter((r): r is StagingRow => r !== null);
}

/**
 * 知乎：中文最大知识 Q&A，消费/商业话题覆盖广。使用非官方搜索接口。
 * 无需 key，但可能被限速——失败时自动跳过。
 */
async function fetchZhihu(query: string): Promise<StagingRow[]> {
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
        Referer: "https://www.zhihu.com/search?type=content&q=" + encodeURIComponent(query),
      },
    }
  );
  if (!res.ok) throw new Error(`知乎 ${res.status}`);
  const data = (await res.json()) as {
    data?: {
      type?: string;
      object?: {
        type?: string;
        id?: string | number;
        title?: string;
        question?: { title?: string; id?: number };
        excerpt?: string;
        url?: string;
      };
    }[];
  };
  return (data.data ?? [])
    .map((item): StagingRow | null => {
      const obj = item.object;
      if (!obj) return null;
      const title =
        obj.title ?? obj.question?.title ?? "";
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
        source_id: id,
        url,
        title: title || "知乎",
        raw_text: stripHtml(text),
        query,
      };
    })
    .filter((r): r is StagingRow => r !== null);
}

/**
 * 楽天市場：日本电商商品描述 + 标题——反映消费者在意的功能与痛点。
 * 注册：https://webservice.rakuten.co.jp → 拿 applicationId 填 RAKUTEN_APP_ID。
 * 未配置则静默跳过。
 */
async function fetchRakuten(query: string): Promise<StagingRow[]> {
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
    Items?: ({ Item?: { itemName?: string; itemCaption?: string; itemUrl?: string; itemCode?: string } } | { itemName?: string; itemCaption?: string; itemUrl?: string; itemCode?: string })[];
  };
  return (data.Items ?? [])
    .map((raw): StagingRow | null => {
      const it = ("Item" in raw && raw.Item) ? raw.Item : (raw as { itemName?: string; itemCaption?: string; itemUrl?: string; itemCode?: string });
      const text = (it.itemCaption ?? it.itemName ?? "").trim();
      if (!it.itemCode || !text) return null;
      return {
        source: "rakuten",
        source_id: it.itemCode,
        url: it.itemUrl ?? null,
        title: it.itemName ?? "楽天商品",
        raw_text: stripHtml(text).slice(0, 2000),
        query,
      };
    })
    .filter((r): r is StagingRow => r !== null);
}

/** 源 → 语言：抓取时喂给它该语言的译词。地区展示由前端按 source 映射。 */
const SOURCES: {
  lang: SourceLang;
  fetch: (q: string) => Promise<StagingRow[]>;
}[] = [
  { lang: "en", fetch: fetchHackerNews },
  { lang: "en", fetch: fetchReddit },
  { lang: "en", fetch: fetchDevTo },
  { lang: "en", fetch: fetchLobsters },
  { lang: "zh", fetch: fetchV2ex },
  { lang: "zh", fetch: fetchZhihu },
  { lang: "ja", fetch: fetchQiita },
  { lang: "ja", fetch: fetchChiebukuro },
  { lang: "ja", fetch: fetchRakuten },
];

/**
 * Playwright 重型源 → 用哪种语言的译词喂它。这些源跑不了 Vercel（无浏览器），
 * 由云端 worker 执行；这里只负责把按语言分好的任务推过去。
 */
const HEAVY_SOURCE_LANG: Record<string, SourceLang> = {
  amazon_jp: "ja",
  xiaohongshu: "zh",
  producthunt: "en",
  indiehackers: "en",
};

/**
 * 触发云端 worker 跑 Playwright 重型源（异步，worker 立刻 202、后台慢慢抓）。
 * 未配置 CRAWLER_WORKER_URL/SECRET 则跳过，返回 false。失败只告警、不抛。
 * 用已算好的译词，避免重复翻译。
 */
async function triggerWorker(t: QueryTranslations): Promise<boolean> {
  const url = process.env.CRAWLER_WORKER_URL;
  const secret = process.env.CRAWLER_SECRET;
  if (!url || !secret) return false;

  const jobs = Object.entries(HEAVY_SOURCE_LANG).map(([source, lang]) => ({
    source,
    query: t[lang],
  }));

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${url.replace(/\/$/, "")}/crawl`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ jobs }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`云端 worker 触发失败 ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("云端 worker 不可达：", e instanceof Error ? e.message : e);
    return false;
  }
}

export type CrawlOutcome = {
  /** 本次 API 源新增入库条数。 */
  inserted: number;
  /** 是否成功把 Playwright 重型源任务推给了云端 worker（后台异步抓取中）。 */
  workerTriggered: boolean;
};

/**
 * 多国一键抓取：关键词翻成中/英/日 → 每个 API 源用其语言的译词抓 → 去重写入 external_signals。
 * 同时把 Playwright 重型源（亚马逊/小红书/PH/IH）任务推给云端 worker 后台跑（若已配置）。
 * 每源独立隔离（allSettled）：单源失败不拖垮其余。
 */
export async function crawlToStaging(query: string): Promise<CrawlOutcome> {
  const q = query.trim();
  if (!q) return { inserted: 0, workerTriggered: false };

  // 翻译失败会降级为三语都用原词（见 translateQuery），不阻断抓取。
  const t = await translateQuery(q);

  // 并行：① 本地直接能跑的 API 源；② 触发云端 worker 跑重型源。
  const [settled, workerTriggered] = await Promise.all([
    Promise.allSettled(SOURCES.map((s) => s.fetch(t[s.lang]))),
    triggerWorker(t),
  ]);

  const rows: StagingRow[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") rows.push(...s.value);
    else console.warn("抓取某源失败：", s.reason);
  }
  if (rows.length === 0) return { inserted: 0, workerTriggered };

  const { data, error } = await supabaseAdmin
    .from("external_signals")
    .upsert(rows, { onConflict: "source,source_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);
  return { inserted: data?.length ?? 0, workerTriggered };
}
