import { parseManifoldMarket, parsePolymarketMarket, type MarketCandidate, type MarketRef } from "./forecast-shared";

/**
 * 预测市场（免费公开接口，不用 Key）：Manifold（api.manifold.markets）和 Polymarket（gamma-api.polymarket.com）。
 * 搜跟日本、中国有关的二选一题；到期后按平台自己的结算结果对账。
 */

const TIMEOUT_MS = 10_000;

/** 搜哪些词（英文，两个平台的题几乎都是英文）。 */
export const MARKET_TERMS = ["Japan", "Japanese", "yen", "Bank of Japan", "Nikkei", "Tokyo", "Takaichi", "China", "Chinese"];

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json", "User-Agent": "IdeaOS/1.0" } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function searchManifold(term: string): Promise<MarketCandidate[]> {
  const json = await getJson(
    `https://api.manifold.markets/v0/search-markets?term=${encodeURIComponent(term)}&limit=30&filter=open&contractType=BINARY&sort=liquidity`
  );
  return (Array.isArray(json) ? json : []).map((m) => parseManifoldMarket(m)).filter((m): m is NonNullable<typeof m> => m !== null);
}

async function searchPolymarket(term: string): Promise<MarketCandidate[]> {
  const json = (await getJson(
    `https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(term)}&limit_per_type=20&events_status=active`
  )) as { events?: { slug?: string; closed?: boolean; markets?: unknown[] }[] } | null;
  return (json?.events ?? [])
    .filter((e) => !e.closed)
    .flatMap((e) => (e.markets ?? []).map((m) => parsePolymarketMarket(m, e.slug)))
    .filter((m): m is NonNullable<typeof m> => m !== null && m.resolved === null);
}

/** 两个平台、每个词各搜一次，合在一起（同一道题只留一次）。 */
export async function searchMarkets(terms: string[] = MARKET_TERMS): Promise<MarketCandidate[]> {
  const lists = await Promise.all(terms.flatMap((t) => [searchManifold(t), searchPolymarket(t)]));
  return Array.from(new Map(lists.flat().map((m) => [`${m.platform}:${m.id}`, m])).values());
}

/** 一道市场题现在怎样（结没结算、现在的概率、结算说明）；取不到返回 null。 */
export async function getMarket(ref: MarketRef): Promise<(MarketCandidate & { resolved: "yes" | "no" | "void" | null }) | null> {
  if (ref.platform === "manifold") {
    return parseManifoldMarket(await getJson(`https://api.manifold.markets/v0/market/${encodeURIComponent(ref.id)}`));
  }
  const m = parsePolymarketMarket(await getJson(`https://gamma-api.polymarket.com/markets/${encodeURIComponent(ref.id)}`));
  return m ? { ...m, url: ref.url } : null;
}
