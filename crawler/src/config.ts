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
  "qiita",
] as const;

/** 盯的关键词/主题。换成你自己的痛点方向或竞品名。 */
export const WATCHLIST: string[] = [
  "founder burnout",
  "no-code tools",
  "indie hacker churn",
];

/** 每个源单次最多取多少条（控制量级与限速）。 */
export const PER_SOURCE_LIMIT = 10;
