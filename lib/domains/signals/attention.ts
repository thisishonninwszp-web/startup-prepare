import { parseHatenaRss, parsePageviews, parseSuggest, parseYoutube, pickWikiTitle, type Attention } from "./attention-shared";

export * from "./attention-shared";

/**
 * 有多少人在关注这件事（日本这边）：维基百科浏览量、Google 搜索联想、はてな收藏、YouTube（配了 Key 才有）。
 * 都是官方接口或 robots.txt 没禁止的地址，只在他点「听一听」时各取一次。哪个没取到就空着，不耽误别的。
 */

const TIMEOUT_MS = 8_000;
// Wikimedia 要求写明是谁在调用
const UA = "IdeaOS/1.0 (https://github.com/thisishonninwszp-web/startup-prepare)";

async function get(url: string, as: "json" | "text"): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    return as === "json" ? await res.json() : await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

async function wiki(topic: string, now: Date): Promise<Attention["wiki"]> {
  const search = await get(
    `https://ja.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&srlimit=5`,
    "json"
  );
  const title = pickWikiTitle(search, topic);
  if (!title) return null;
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)); // 上个月最后一天
  const start = new Date(Date.UTC(end.getUTCFullYear() - 2, end.getUTCMonth() + 1, 1));
  const page = encodeURIComponent(title.replace(/ /g, "_"));
  const views = await get(
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/ja.wikipedia/all-access/user/${page}/monthly/${yyyymmdd(start)}00/${yyyymmdd(end)}00`,
    "json"
  );
  const months = parsePageviews(views);
  return months.length > 0 ? { title, url: `https://ja.wikipedia.org/wiki/${page}`, months } : null;
}

async function suggest(topic: string): Promise<string[]> {
  const json = await get(
    `https://suggestqueries.google.com/complete/search?client=firefox&hl=ja&gl=jp&q=${encodeURIComponent(`${topic} `)}`,
    "json"
  );
  return parseSuggest(json, topic);
}

async function hatena(topic: string): Promise<Attention["hatena"]> {
  const xml = await get(`https://b.hatena.ne.jp/q/${encodeURIComponent(topic)}?mode=rss&sort=popular&target=all`, "text");
  return typeof xml === "string" ? parseHatenaRss(xml, topic) : null;
}

async function youtube(topic: string): Promise<Attention["youtube"]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return "no-key";
  const search = (await get(
    `https://www.googleapis.com/youtube/v3/search?part=id&type=video&maxResults=10&regionCode=JP&relevanceLanguage=ja&q=${encodeURIComponent(topic)}&key=${key}`,
    "json"
  )) as { items?: { id?: { videoId?: string } }[] } | null;
  if (!search) return null;
  const ids = (search.items ?? []).map((i) => i.id?.videoId).filter(Boolean).join(",");
  const videos = ids ? await get(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids}&key=${key}`, "json") : null;
  return parseYoutube(search, videos);
}

export async function fetchAttention(topic: string, now = new Date()): Promise<Attention | null> {
  const t = topic.trim();
  if (!t) return null;
  const [w, s, h, y] = await Promise.all([wiki(t, now), suggest(t), hatena(t), youtube(t)]);
  return { topic: t, wiki: w, suggest: s, hatena: h, youtube: y, checked_at: now.toISOString() };
}
