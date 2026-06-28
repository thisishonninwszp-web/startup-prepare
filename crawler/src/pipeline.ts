import { SOURCES } from "./sources/index.js";
import { upsertSignals } from "./db.js";
import {
  finishCustomerTopic,
  listDueCustomerTopics,
  upsertCustomerSignals,
  type DueCustomerTopic,
} from "./db.js";
import { ENABLED_SOURCES, WATCHLIST } from "./config.js";
import type { RawSignal } from "./types.js";

/** 源之间稍微歇一下，避免对匿名端点打太密（reddit 尤其敏感）。 */
const GAP_MS = 1200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 跑一组 (source, query)。每个源独立 try/catch——单源失败（限速/反爬/网络）
 * 只打日志，不拖垮整轮。抓到的条目去重写入 external_signals。
 */
export async function runJobs(
  jobs: { source: string; query: string }[]
): Promise<{ fetched: number; inserted: number }> {
  let fetched = 0;
  let inserted = 0;

  for (const [i, job] of jobs.entries()) {
    const fetcher = SOURCES[job.source];
    if (!fetcher) {
      console.warn(`⚠ 未知源 "${job.source}"，跳过。`);
      continue;
    }

    let signals: RawSignal[] = [];
    try {
      signals = await fetcher(job.query);
    } catch (e) {
      console.warn(
        `⚠ [${job.source}] "${job.query}" 抓取失败：${
          e instanceof Error ? e.message : e
        }`
      );
      continue;
    }

    fetched += signals.length;
    try {
      const n = await upsertSignals(signals);
      inserted += n;
      console.log(
        `✓ [${job.source}] "${job.query}"：抓到 ${signals.length}，新增 ${n}`
      );
    } catch (e) {
      console.warn(
        `⚠ [${job.source}] 写库失败：${e instanceof Error ? e.message : e}`
      );
    }

    if (i < jobs.length - 1) await sleep(GAP_MS);
  }

  return { fetched, inserted };
}

/** 全量 watchlist：启用的源 × 配置的关键词。 */
export function watchlistJobs(): { source: string; query: string }[] {
  const jobs: { source: string; query: string }[] = [];
  for (const source of ENABLED_SOURCES) {
    for (const query of WATCHLIST) {
      jobs.push({ source, query });
    }
  }
  return jobs;
}

const CUSTOMER_SOURCES: Record<"cn" | "jp" | "en", string[]> = {
  cn: ["v2ex", "zhihu", "xiaohongshu"],
  jp: ["qiita", "chiebukuro", "rakuten", "amazon_jp"],
  en: ["hackernews", "reddit", "devto", "lobsters", "producthunt", "indiehackers"],
};

async function runCustomerTopic(topic: DueCustomerTopic) {
  let fetched = 0;
  let inserted = 0;
  const errors: string[] = [];
  for (const market of topic.markets) {
    const language = market === "cn" ? "zh" : market === "jp" ? "ja" : "en";
    const query = topic.translatedQueries[language] || topic.query;
    for (const source of CUSTOMER_SOURCES[market]) {
      const fetcher = SOURCES[source];
      if (!fetcher) continue;
      try {
        const signals = await fetcher(query);
        fetched += signals.length;
        inserted += await upsertCustomerSignals(topic, signals, market);
      } catch (error) {
        const message = `${source}: ${
          error instanceof Error ? error.message : String(error)
        }`;
        errors.push(message);
        console.warn(`⚠ [顾客主题 ${topic.id}] ${message}`);
      }
      await sleep(GAP_MS);
    }
  }
  await finishCustomerTopic(topic, errors.length ? errors.join("; ") : null);
  return { fetched, inserted, errors };
}

export async function runDueCustomerTopics(onlyId?: string) {
  const topics = await listDueCustomerTopics(onlyId);
  let fetched = 0;
  let inserted = 0;
  for (const topic of topics) {
    const result = await runCustomerTopic(topic);
    fetched += result.fetched;
    inserted += result.inserted;
  }
  return { topics: topics.length, fetched, inserted };
}
