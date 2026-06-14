import type { RawSignal, SourceFetcher } from "../types.js";
import { PER_SOURCE_LIMIT } from "../config.js";

/**
 * V2EX，走公共 API v1（免登录）。
 * 注意：V2EX 公共 API 没有关键词搜索，只能拉「最热/最新」主题，
 * 因此这里拉热门后在本地按 query 子串过滤——盯中文创业/独立开发圈的真实讨论。
 * 文档：https://www.v2ex.com/help/api
 */
const HOT = "https://www.v2ex.com/api/topics/hot.json";

type V2exTopic = {
  id: number;
  title?: string;
  content?: string;
  url?: string;
};

export const fetchV2ex: SourceFetcher = async (query) => {
  const res = await fetch(HOT, {
    headers: { "User-Agent": "ideaos-crawler/0.1" },
  });
  if (!res.ok) throw new Error(`V2EX 失败（${res.status}）`);

  const topics = (await res.json()) as V2exTopic[];
  const needle = query.trim().toLowerCase();

  return topics
    .filter((t) => {
      if (!needle) return true;
      const hay = `${t.title ?? ""} ${t.content ?? ""}`.toLowerCase();
      return hay.includes(needle);
    })
    .slice(0, PER_SOURCE_LIMIT)
    .map((t): RawSignal | null => {
      const text = (t.content ?? t.title ?? "").trim();
      if (!text) return null;
      return {
        source: "v2ex",
        sourceId: String(t.id),
        url: t.url ?? `https://www.v2ex.com/t/${t.id}`,
        title: t.title ?? "V2EX topic",
        rawText: text,
        query,
      };
    })
    .filter((s): s is RawSignal => s !== null);
};
