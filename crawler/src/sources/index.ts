import type { SourceFetcher } from "../types.js";
import { fetchHackerNews } from "./hackernews.js";
import { fetchReddit } from "./reddit.js";
import { fetchV2ex } from "./v2ex.js";
import { fetchQiita } from "./qiita.js";
import { fetchWeb } from "./web.js";

/** 源注册表：新增源在这里加一行即可被 CLI / pipeline 选用。 */
export const SOURCES: Record<string, SourceFetcher> = {
  hackernews: fetchHackerNews, // 🇺🇸 英语圈
  reddit: fetchReddit, // 🇺🇸 英语圈（需 OAuth）
  v2ex: fetchV2ex, // 🇨🇳 中文圈
  qiita: fetchQiita, // 🇯🇵 日本
  web: fetchWeb, // 🌐 任意网页（Playwright）
};

export type SourceName = keyof typeof SOURCES;
