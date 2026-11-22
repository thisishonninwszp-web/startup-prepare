import { webSearch } from "@/lib/web-search";
import {
  customerVoiceSearch,
  mentionsTopic,
  MIN_VOICE_RESULTS,
  type CustomerMarket,
  type CustomerSearchPlan,
} from "./types";

// 顾客视点「搜索公开材料」在一个市场里找候选。不是 server action，只给 actions.ts 用。

type SearchHit = Awaited<ReturnType<typeof webSearch>>[number];

/** 一个市场一次最多放进收件箱几页（三个搜索词各搜 8 页，不能一下塞 24 页给人看）。 */
export const MAX_CANDIDATES_PER_MARKET = 10;

const usable = (rows: SearchHit[]) =>
  rows.filter((row) => row.url && row.content.trim());

/** 几个搜索词的结果轮流取，免得第一个词的结果占满名额。 */
function interleave(batches: SearchHit[][]): SearchHit[] {
  const merged: SearchHit[] = [];
  const longest = Math.max(0, ...batches.map((rows) => rows.length));
  for (let i = 0; i < longest; i++) {
    for (const rows of batches) if (rows[i]) merged.push(rows[i]);
  }
  return merged;
}

/**
 * 先用普通人的搜索词去人们讲自己经历的地方找，只留标题或开头里有核心词的页面；
 * 没有搜索计划时（AI 没写出来）照旧用翻译过去的那句。找到的太少，再普通搜一次补上。
 */
export async function findMarketCandidates(
  market: CustomerMarket,
  plan: CustomerSearchPlan[CustomerMarket] | undefined,
  fallbackQuery: string
): Promise<SearchHit[]> {
  const seen = new Set<string>();
  const picked: SearchHit[] = [];
  const add = (rows: SearchHit[]) => {
    for (const row of rows) {
      if (seen.has(row.url) || picked.length >= MAX_CANDIDATES_PER_MARKET) continue;
      seen.add(row.url);
      picked.push(row);
    }
  };

  const queries = plan?.queries ?? [fallbackQuery];
  const settled = await Promise.allSettled(
    queries.map((query) => {
      const voice = customerVoiceSearch(market, query);
      return webSearch(voice.query, 8, voice.domains ? { domains: voice.domains } : {});
    })
  );
  const batches = settled.flatMap((result) =>
    result.status === "fulfilled" ? [usable(result.value)] : []
  );
  if (batches.length === 0) {
    throw (settled[0] as PromiseRejectedResult).reason;
  }
  add(
    interleave(batches).filter(
      (row) =>
        !plan || mentionsTopic(plan.topic, row.title, row.content.slice(0, 300))
    )
  );

  // 讲经历的地方找到的太少，再普通搜一次补上（多半是商家和中介的页面，免得收件箱空着）。
  if (picked.length < MIN_VOICE_RESULTS) {
    add(usable(await webSearch(queries[0], 8)));
  }
  return picked;
}
