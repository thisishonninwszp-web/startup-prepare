import type { SourceFetcher } from "../types.js";
import { fetchHackerNews } from "./hackernews.js";
import { fetchReddit } from "./reddit.js";
import { fetchV2ex } from "./v2ex.js";
import { fetchWeb } from "./web.js";

/** 源注册表：新增源在这里加一行即可被 CLI / pipeline 选用。 */
export const SOURCES: Record<string, SourceFetcher> = {
  hackernews: fetchHackerNews,
  reddit: fetchReddit,
  v2ex: fetchV2ex,
  web: fetchWeb,
};

export type SourceName = keyof typeof SOURCES;
