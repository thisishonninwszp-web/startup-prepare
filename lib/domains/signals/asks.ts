import { webSearch } from "@/lib/web-search";
import { REDDIT_UA, redditToken } from "@/lib/reddit";
import { parseSuggest } from "./attention-shared";
import {
  collectAsks,
  mergeAsked,
  parseChiebukuroPage,
  parseKokkaiCount,
  parseRedditListing,
  parseYoutubeYear,
  questionUrl,
  REDDIT_SUBS,
  redditTerm,
  SUGGEST_KANA,
  type AsksResult,
  type ChiebukuroSample,
  type KokkaiYears,
  type RedditPost,
  type RedditSample,
  type YoutubeYears,
} from "./asks-shared";

export * from "./asks-shared";

/**
 * 有多少人在问：知恵袋（Google 找页、程序只读提问页）、联想加假名、国会会議录。说明见 asks-shared.ts。
 * 都只在他点的时候各取一次，哪个没取到就空着，不耽误别的。
 */

const TIMEOUT_MS = 8_000;
const UA = "IdeaOS/1.0 (https://github.com/thisishonninwszp-web/startup-prepare)";
/** 知恵袋读几页提问（每页底下还带三五十条相关提问）。 */
const CHIEBUKURO_PAGES = 8;
/** 国会：往回数几年。 */
const KOKKAI_YEARS = 10;
const KOKKAI_PARALLEL = 3;
const KOKKAI_DEADLINE_MS = 20_000;

async function get(url: string, as: "json" | "text", headers: Record<string, string> = {}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": UA, ...headers } });
    if (!res.ok) return null;
    return as === "json" ? await res.json() : await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 知恵袋：Google 找到的提问页（最多 8 页）各读一次，连同每页底下的相关提问，留标题里有这个叫法的。 */
export async function chiebukuroSample(topic: string): Promise<ChiebukuroSample | null> {
  const t = topic.trim();
  if (!t) return null;
  const found = await webSearch(t, CHIEBUKURO_PAGES, { domains: ["detail.chiebukuro.yahoo.co.jp"] }).catch(() => null);
  if (found === null) return null;
  const urls = Array.from(new Set(found.map((r) => questionUrl(r.url)).filter((u): u is string => u !== null))).slice(0, CHIEBUKURO_PAGES);
  const pages = await Promise.all(
    urls.map(async (u) => {
      const html = await get(u, "text");
      return typeof html === "string" ? parseChiebukuroPage(html, u) : null;
    })
  );
  const read = pages.filter((p): p is NonNullable<typeof p> => p !== null);
  return { found: urls.length, read: read.length, asks: collectAsks(read, t) };
}

/**
 * 人们在问什么：联想在叫法后面加一个假名再问一遍。already 是普通联想已经给过的（不再重复）；
 * 不给 already 就连不加假名的那一轮也问。两个两个地问，免得一下子打太多。
 */
export async function askedQuestions(topic: string, already?: string[]): Promise<string[] | null> {
  const t = topic.trim();
  if (!t) return null;
  const kana = already ? SUGGEST_KANA.filter((k) => k) : SUGGEST_KANA;
  const rounds: (string[] | null)[] = [];
  for (let i = 0; i < kana.length; i += 2) {
    const batch = await Promise.all(
      kana.slice(i, i + 2).map(async (k) => {
        const json = await get(
          `https://suggestqueries.google.com/complete/search?client=firefox&hl=ja&gl=jp&q=${encodeURIComponent(`${t} ${k}`)}`,
          "json"
        );
        return Array.isArray(json) ? parseSuggest(json, t) : null;
      })
    );
    rounds.push(...batch);
  }
  return mergeAsked(rounds, already ?? []);
}

/**
 * 国会会議録（官方接口）：最近十年每年有几次发言提到这个叫法。一年问一次，三个三个地问（接口慢，一次一两秒到好几秒）；
 * 超过 20 秒就不再问，没问到的年份不画。
 */
export async function kokkaiYears(topic: string, now = new Date()): Promise<KokkaiYears | null> {
  const t = topic.trim();
  if (!t) return null;
  const started = Date.now();
  const thisYear = now.getUTCFullYear();
  const years = Array.from({ length: KOKKAI_YEARS }, (_, i) => thisYear - KOKKAI_YEARS + 1 + i);
  const out: KokkaiYears = [];
  for (let i = 0; i < years.length; i += KOKKAI_PARALLEL) {
    if (Date.now() - started > KOKKAI_DEADLINE_MS) break;
    const batch = await Promise.all(
      years.slice(i, i + KOKKAI_PARALLEL).map(async (y) => {
        const json = await get(
          `https://kokkai.ndl.go.jp/api/speech?any=${encodeURIComponent(t)}&from=${y}-01-01&until=${y}-12-31&maximumRecords=1&recordPacking=json`,
          "json"
        );
        const count = parseKokkaiCount(json);
        return count === null ? null : { year: y, count };
      })
    );
    for (const b of batch) if (b) out.push(b);
  }
  return out.length > 0 ? out : null;
}

/** YouTube：往回数几年。每年一次 search.list（100 额度），一天免费 1 万额度。 */
const YOUTUBE_YEARS = 5;

/** YouTube（官方接口）：最近五年每年新上传、标题里有这个叫法的视频几条（每年只看一页 50 条，满了标「50 条以上」）。 */
export async function youtubeYears(topic: string, now = new Date()): Promise<YoutubeYears | "no-key" | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return "no-key";
  const t = topic.trim();
  if (!t) return null;
  const thisYear = now.getUTCFullYear();
  const years = Array.from({ length: YOUTUBE_YEARS }, (_, i) => thisYear - YOUTUBE_YEARS + 1 + i);
  const rows = await Promise.all(
    years.map(async (y) => {
      const params = new URLSearchParams({
        part: "snippet",
        type: "video",
        maxResults: "50",
        regionCode: "JP",
        relevanceLanguage: "ja",
        q: t,
        publishedAfter: `${y}-01-01T00:00:00Z`,
        publishedBefore: `${y + 1}-01-01T00:00:00Z`,
        key,
      });
      const parsed = parseYoutubeYear(await get(`https://www.googleapis.com/youtube/v3/search?${params}`, "json"), t);
      return parsed ? { year: y, ...parsed } : null;
    })
  );
  const ok = rows.filter((r): r is NonNullable<typeof r> => r !== null);
  return ok.length > 0 ? ok : null;
}

/** Reddit 搜几页（每页 100 条）。 */
const REDDIT_PAGES = 3;
const REDDIT_KEEP = 200;

/**
 * Reddit（官方接口）：在日外国人的几个版块里搜这个英文说法，按新到旧翻最多三页，
 * 留标题或正文里有这个说法每个词的帖子。没配 Key 返回 "no-key"。
 */
export async function redditSample(term: string): Promise<RedditSample | "no-key" | null> {
  const t = redditTerm(term.trim());
  if (!t) return null;
  const token = await redditToken().catch(() => undefined);
  if (token === null) return "no-key";
  if (!token) return null;
  const posts: RedditPost[] = [];
  let searched = 0;
  let after: string | null = null;
  for (let page = 0; page < REDDIT_PAGES; page += 1) {
    const params = new URLSearchParams({ q: t, restrict_sr: "1", sort: "new", t: "all", limit: "100", raw_json: "1", ...(after ? { after } : {}) });
    const json = await get(`https://oauth.reddit.com/r/${REDDIT_SUBS.join("+")}/search?${params}`, "json", {
      Authorization: `bearer ${token}`,
      "User-Agent": REDDIT_UA,
    });
    if (json === null) break;
    const parsed = parseRedditListing(json, t);
    searched += parsed.seen;
    posts.push(...parsed.posts);
    after = parsed.after;
    if (!after) break;
  }
  if (searched === 0 && posts.length === 0) return null;
  const unique = Array.from(new Map(posts.map((p) => [p.url, p])).values()).sort((a, b) => b.date.localeCompare(a.date));
  return { term: t, subs: REDDIT_SUBS, searched, posts: unique.slice(0, REDDIT_KEEP) };
}

/**
 * 信息缺口卡片上「数一数」：知恵袋、联想、国会、YouTube 每年几条一起查；给了英文说法再查 Reddit。
 * 「听一听」里由 fetchAttention 分别调。
 */
export async function fetchAsks(topic: string, now = new Date(), en = ""): Promise<AsksResult> {
  const [chiebukuro, asked, kokkai, yt, reddit] = await Promise.all([
    chiebukuroSample(topic).catch(() => null),
    askedQuestions(topic).catch(() => null),
    kokkaiYears(topic, now).catch(() => null),
    youtubeYears(topic, now).catch(() => null),
    en.trim() ? redditSample(en).catch(() => null) : Promise.resolve(undefined),
  ]);
  return {
    topic: topic.trim(),
    chiebukuro,
    asked,
    kokkai,
    youtubeYears: yt,
    ...(reddit !== undefined ? { reddit } : {}),
    checked_at: now.toISOString(),
  };
}
