import { pickKakeiItems } from "@/lib/ai";
import {
  KAKEI_STATS_ID,
  kakeiFilters,
  mergeMonths,
  pickKakeiTables,
  type KakeiTable,
  kakeiItemNames,
  parseEstatMeta,
  parseHatenaRss,
  parsePageviews,
  parseRakuten,
  parseSuggest,
  parseYoutube,
  pickWikiTitle,
  type Attention,
} from "./attention-shared";
import { parseEstat } from "./slow";

export * from "./attention-shared";

/**
 * 有多少人在关注这件事（日本这边）：维基百科浏览量、Google 搜索联想、はてな收藏、YouTube（配了 Key 才有）。
 * 都是官方接口或 robots.txt 没禁止的地址，只在他点「听一听」时各取一次。哪个没取到就空着，不耽误别的。
 */

const TIMEOUT_MS = 8_000;
// Wikimedia 要求写明是谁在调用
const UA = "IdeaOS/1.0 (https://github.com/thisishonninwszp-web/startup-prepare)";

async function get(url: string, as: "json" | "text", headers: Record<string, string> = {}, revalidate?: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": UA, ...headers },
      ...(revalidate ? { next: { revalidate } } : {}),
    });
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

async function suggest(topic: string): Promise<string[] | null> {
  const json = await get(
    `https://suggestqueries.google.com/complete/search?client=firefox&hl=ja&gl=jp&q=${encodeURIComponent(`${topic} `)}`,
    "json"
  );
  // 取不到（被拦、超时）是 null；取到了但没有联想是空数组 —— 页面上要分开说
  return Array.isArray(json) ? parseSuggest(json, topic) : null;
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

/**
 * 楽天市场商品搜索（官方文档 webservice.rakuten.co.jp/documentation/ichiba-item-search，版本 2026-07-01）：
 * openapi.rakuten.co.jp，applicationId + accessKey（旧的 app.rakuten.co.jp 2026-05 停了，旧应用 ID 不能用）。
 * 另外带上 Referer（有开发者实测不带会被拒），要和楽天那边登记的网址一致：读 RAKUTEN_REFERER，没填用 APP_URL，再没有用线上地址。
 */
async function rakuten(topic: string): Promise<Attention["rakuten"]> {
  const id = process.env.RAKUTEN_APPLICATION_ID;
  const key = process.env.RAKUTEN_ACCESS_KEY;
  if (!id || !key) return "no-key";
  const referer = process.env.RAKUTEN_REFERER || process.env.APP_URL || "https://startup-prepare.vercel.app/";
  const params = new URLSearchParams({
    applicationId: id,
    accessKey: key,
    keyword: topic,
    format: "json",
    formatVersion: "2",
    hits: "30",
    sort: "-reviewCount",
  });
  const json = await get(`https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?${params}`, "json", { Referer: referer });
  return parseRakuten(json);
}

const WEEK = 7 * 86_400;

/**
 * 家计调查（总务省，经 e-Stat）：先取这张表的品目清单（缓存一周），AI 从清单里挑一两项（照抄、代码核对），
 * 再取这几项最近两年每月每户花多少钱（二人以上的家庭、全国）。
 */
const ESTAT = "https://api.e-stat.go.jp/rest/3.0/app/json";

/** 家计调查的品目表，改定年份新的在前（找不到就退回已知的 2020 年改定那张）。缓存一周。 */
async function kakeiTables(appId: string): Promise<KakeiTable[]> {
  const params = new URLSearchParams({ appId, lang: "J", statsCode: "00200561", searchWord: "品目分類", limit: "200" });
  const found = pickKakeiTables(await get(`${ESTAT}/getStatsList?${params}`, "json", {}, WEEK));
  return found.length > 0 ? found : [{ id: KAKEI_STATS_ID, revision: 2020 }];
}

/** 一张表里某一项（按名字）每月花多少。名字在这张表的清单里对不上就是空的。 */
async function kakeiSeries(appId: string, tableId: string, name: string): Promise<{ month: string; value: number }[]> {
  const meta = parseEstatMeta(await get(`${ESTAT}/getMetaInfo?appId=${appId}&statsDataId=${tableId}`, "json", {}, WEEK));
  const code = kakeiItemNames(meta).find((i) => i.name === name)?.code;
  if (!code) return [];
  const params = new URLSearchParams({ appId, statsDataId: tableId, cdCat01: code, metaGetFlg: "N", cntGetFlg: "N", ...kakeiFilters(meta) });
  return parseEstat(await get(`${ESTAT}/getStatsData?${params}`, "json", {}, WEEK)).map((p) => ({ month: p.date, value: p.value }));
}

/**
 * 家计调查（总务省，经 e-Stat）：找改定年份最新的品目表，取它的品目清单，AI 从清单里挑一两项（照抄、代码核对），
 * 再取这几项每月每户花多少（二人以上的家庭、全国）。新表的月份不到两年，前面用上一次改定里同名的那一项补上。
 */
async function kakei(topic: string, pain: string): Promise<Attention["kakei"]> {
  const appId = process.env.ESTAT_APP_ID;
  if (!appId) return "no-key";
  const tables = await kakeiTables(appId);
  const [latest, previous] = tables;
  const meta = parseEstatMeta(await get(`${ESTAT}/getMetaInfo?appId=${appId}&statsDataId=${latest.id}`, "json", {}, WEEK));
  const items = kakeiItemNames(meta);
  if (items.length === 0) return null;
  const picked = await pickKakeiItems({ topic, pain, names: items.map((i) => i.name) }).catch(() => []);
  if (picked.length === 0) return { items: [], revision: latest.revision };
  let joined = false;
  const series = await Promise.all(
    picked.map(async (name) => {
      let months = await kakeiSeries(appId, latest.id, name);
      if (months.length < 24 && previous) {
        const older = await kakeiSeries(appId, previous.id, name);
        if (older.length > 0) {
          months = mergeMonths(older, months);
          joined = true;
        }
      }
      return months.length > 0 ? { name, months: months.slice(-24) } : null;
    })
  );
  return {
    items: series.filter((x): x is NonNullable<typeof x> => x !== null),
    revision: latest.revision,
    ...(joined && previous ? { joined: previous.revision } : {}),
  };
}

export async function fetchAttention(topic: string, pain = "", now = new Date()): Promise<Attention | null> {
  const t = topic.trim();
  if (!t) return null;
  const [w, s, h, y, r, k] = await Promise.all([
    wiki(t, now),
    suggest(t),
    hatena(t),
    youtube(t),
    rakuten(t),
    kakei(t, pain).catch(() => null),
  ]);
  return { topic: t, wiki: w, suggest: s, hatena: h, youtube: y, rakuten: r, kakei: k, checked_at: now.toISOString() };
}
