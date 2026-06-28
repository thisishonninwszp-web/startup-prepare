/**
 * 监控配置（用途③：定期盯一组关键词/竞品）。
 * `npm run watchlist` 会对每个 source × 每个关键词跑一轮。
 * 改这里就能调整盯什么、用哪些源——不碰代码。
 */

/** 默认启用的源（对应 src/sources/ 下的文件名）。reddit 需配 OAuth，否则自动跳过。 */
export const ENABLED_SOURCES = [
  "hackernews",
  "reddit",
  "devto",
  "lobsters",
  "v2ex",
  "zhihu",
  "qiita",
  "chiebukuro",
  "rakuten",
] as const;

/**
 * Playwright 重型源：需真实浏览器，跑不了 Vercel，只在云端 worker / 本地跑。
 * 不进 ENABLED_SOURCES（CLI 的 --source all 不含它们），但云端 worker 的定时任务会带上。
 */
export const HEAVY_SOURCES = [
  "xiaohongshu",
  "amazon_jp",
  "producthunt",
  "indiehackers",
] as const;

/** 盯的关键词/主题。换成你自己的痛点方向或竞品名。 */
export const WATCHLIST: string[] = [
  "founder burnout",
  "no-code tools",
  "indie hacker churn",
];

/** 每个源单次最多取多少条（控制量级与限速）。 */
export const PER_SOURCE_LIMIT = 10;

/** 重型源 × watchlist 的全部任务（云端 worker 定时跑用，本地无浏览器时会逐个失败跳过）。 */
export function allHeavyJobs(): { source: string; query: string }[] {
  const jobs: { source: string; query: string }[] = [];
  for (const source of HEAVY_SOURCES) {
    for (const query of WATCHLIST) jobs.push({ source, query });
  }
  return jobs;
}
