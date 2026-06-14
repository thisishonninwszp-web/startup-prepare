import { SOURCES } from "./sources/index.js";
import { upsertSignals } from "./db.js";
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
