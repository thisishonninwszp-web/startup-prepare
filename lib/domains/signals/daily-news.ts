import { supabaseAdmin } from "@/lib/supabase";
import { RSS_FEEDS, rssSource, type RssFeed } from "./feeds";
import { fetchHtml } from "./article";
import { extractPageDescription, parseFeed } from "./rss";
import { usableSummary, worthFetchingPage } from "./summary";

/**
 * 每日抓取：抓 RSS_FEEDS 里的 RSS（世界、谁在头疼什么、日程三类），去重写进 external_signals（status=pending）。
 * 每天由 /api/cron/daily-news 调一次，/signals 页上也能手动刷新。
 *
 * 新闻只是外部信号，不直接进材料箱 —— 在 /signals 上被人挑中的那条，才收进材料箱。
 */

const PER_FEED = 20;
/** 补简介时同时敲几个网站、每个等多久。整轮要在 cron 的 60 秒内跑完。 */
const PAGE_CONCURRENCY = 8;
const PAGE_TIMEOUT_MS = 5_000;

export type DailyNewsOutcome = {
  inserted: number;
  failed: string[];
};

async function fetchFeed(feed: RssFeed) {
  const res = await fetch(feed.url, {
    headers: { "User-Agent": "ideaos-news/1.0" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${feed.label} ${res.status}`);
  const items = parseFeed(await res.text()).slice(0, PER_FEED);
  return items.map((it) => ({
    source: rssSource(feed),
    source_id: it.link,
    url: it.link,
    title: it.title.slice(0, 300),
    raw_text: (it.summary || it.title).slice(0, 2000),
    published_at: it.publishedAt?.toISOString() ?? null,
  }));
}

type InsertedRow = { id: string; title: string | null; url: string | null; raw_text: string };

async function fetchPageDescription(url: string): Promise<string> {
  // 拿不到简介就只显示标题，不算失败
  const html = await fetchHtml(url, PAGE_TIMEOUT_MS);
  return html ? extractPageDescription(html) : "";
}

async function fillMissingSummaries(rows: InsertedRow[]): Promise<void> {
  const todo = rows.filter(
    (r) => r.url && worthFetchingPage(r.url) && !usableSummary(r.title, r.raw_text)
  );
  for (let i = 0; i < todo.length; i += PAGE_CONCURRENCY) {
    await Promise.all(
      todo.slice(i, i + PAGE_CONCURRENCY).map(async (row) => {
        const description = await fetchPageDescription(row.url as string);
        if (!usableSummary(row.title, description)) return;
        await supabaseAdmin
          .from("external_signals")
          .update({ raw_text: description.slice(0, 2000) })
          .eq("id", row.id);
      })
    );
  }
}

export async function fetchDailyNews(): Promise<DailyNewsOutcome> {
  const settled = await Promise.allSettled(RSS_FEEDS.map(fetchFeed));

  const rows: Awaited<ReturnType<typeof fetchFeed>> = [];
  const failed: string[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") rows.push(...s.value);
    else failed.push(`${RSS_FEEDS[i].label}：${s.reason instanceof Error ? s.reason.message : String(s.reason)}`);
  });

  // 同一篇文章会同时挂在几个分类下（Yahoo 的主要 / 経済），按链接只留第一次出现的那条。
  const seen = new Set<string>();
  const unique = rows.filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)));
  rows.length = 0;
  rows.push(...unique);

  let inserted = 0;
  if (rows.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("external_signals")
      .upsert(rows, { onConflict: "source,source_id", ignoreDuplicates: true })
      .select("id, title, url, raw_text");
    if (error) throw new Error(error.message);
    inserted = data?.length ?? 0;
    // 只给这次新进来、RSS 里又没带摘要的补简介；老条目不重复去敲别人的网站。
    await fillMissingSummaries((data ?? []) as InsertedRow[]);
  }

  // 没人动过的不再删：存档一条不删（记忆层，迁移 091），收件箱只列最近两周的（见 queries.ts INBOX_DAYS）
  return { inserted, failed };
}
