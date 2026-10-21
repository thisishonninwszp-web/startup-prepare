/**
 * 有多少人在关注这件事：不花钱、程序可以自动去拿的几个数（浏览器端也要用的部分，不碰网络）。
 * - 维基百科浏览量（Wikimedia 官方接口）：有多少人在查这件事、是在变多还是变少
 * - Google 搜索联想：人们在这个词后面最常接着搜什么（价格？口碑？哪里有？）
 * - はてなブックマーク（搜索结果的 RSS）：讲这件事的文章被多少人收藏
 * - YouTube（官方接口，要免费的 Key）：讲这件事的视频有多少、播放多少
 * - 楽天市场（官方接口，要免费的 Key）：相关商品有多少件、评价最多的几件 —— 已经有人在花钱的痕迹
 * - 家计调查（总务省，经 e-Stat，要免费的 appId）：日本家庭每月在这一类东西上花多少钱
 * 只数次数，不算比率。只说明有多少人在关注、在找，不说明愿不愿付钱。
 * 知恵袋的搜索页、Google 趋势 robots.txt 不许程序抓，那两个只给链接、他自己看。
 */

import type { ChiebukuroSample, KokkaiYears } from "./asks-shared";

export type AttentionWiki = { title: string; url: string; months: { month: string; views: number }[] };
export type AttentionHatena = { matched: number; bookmarks: number; top: { title: string; url: string; users: number; date: string }[] };
export type AttentionYoutube = { total: number | null; videos: { title: string; url: string; views: number; published: string }[] };

export type Attention = {
  topic: string;
  wiki: AttentionWiki | null;
  /** Google 搜索联想：在 topic 后面加一个空格时给的那几个（去掉了 topic 本身）；null = 这次没取到（和"没有联想"分开）。 */
  suggest: string[] | null;
  hatena: AttentionHatena | null;
  /** "no-key"：没配 YOUTUBE_API_KEY。 */
  youtube: AttentionYoutube | "no-key" | null;
  /** 楽天市场；"no-key"：没配 RAKUTEN_APPLICATION_ID / RAKUTEN_ACCESS_KEY；{ error }：接口返回了错误。早期查过的没有。 */
  rakuten?: AttentionRakuten | "no-key" | { error: string } | null;
  /** 家计调查；"no-key"：没配 ESTAT_APP_ID。早期查过的没有。 */
  kakei?: AttentionKakei | "no-key" | null;
  /** 知恵袋上的提问（Google 找页、程序只读提问页）、联想加假名问出来的说法、国会每年提到几次。早期查过的没有。 */
  chiebukuro?: ChiebukuroSample | null;
  asked?: string[] | null;
  kokkai?: KokkaiYears | null;
  checked_at: string;
};

const squash = (t: string) => t.replace(/[\s　]+/g, "").toLowerCase();

/**
 * 维基百科搜索结果里挑和 topic 对得上的那一条，对不上返回 null —— 不拿不相干的词条充数。
 * 先要包含整个 topic 的（「家事代行」→「家事代行サービス」）；其次才是被 topic 包含、但长度超过一半的
 * （「家事代行」不能退成「家事」—— 那是另一件事的浏览量）。
 */
export function pickWikiTitle(json: unknown, topic: string): string | null {
  const list = ((json as { query?: { search?: { title?: unknown }[] } } | null)?.query?.search ?? [])
    .map((r) => (typeof r.title === "string" ? r.title : ""))
    .filter(Boolean);
  const t = squash(topic);
  if (!t) return null;
  return (
    list.find((title) => squash(title).includes(t)) ??
    list.find((title) => t.includes(squash(title)) && squash(title).length > t.length / 2) ??
    null
  );
}

/** Wikimedia 浏览量接口：items[].timestamp（YYYYMMDDHH）+ views → 每月几次。 */
export function parsePageviews(json: unknown): { month: string; views: number }[] {
  const items = (json as { items?: { timestamp?: unknown; views?: unknown }[] } | null)?.items ?? [];
  return items
    .filter((i) => typeof i.timestamp === "string" && typeof i.views === "number")
    .map((i) => ({ month: `${(i.timestamp as string).slice(0, 4)}-${(i.timestamp as string).slice(4, 6)}`, views: i.views as number }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** 最近 12 个月、再往前 12 个月各几次（只数次数，不算涨了百分之几）。 */
export function wikiYears(months: { month: string; views: number }[]): { last: number; prev: number | null } {
  const last = months.slice(-12).reduce((n, m) => n + m.views, 0);
  const before = months.slice(-24, -12);
  return { last, prev: before.length === 12 ? before.reduce((n, m) => n + m.views, 0) : null };
}

/** 都道府县和几个大城市：搜索联想会按 Google 猜的所在地带上地名，这些不是"人们在意什么"。 */
const PLACES = new Set(
  (
    "北海道 青森 岩手 宮城 秋田 山形 福島 茨城 栃木 群馬 埼玉 千葉 東京 神奈川 新潟 富山 石川 福井 山梨 長野 岐阜 静岡 愛知 三重 滋賀 京都 大阪 兵庫 奈良 和歌山 鳥取 島根 岡山 広島 山口 徳島 香川 愛媛 高知 福岡 佐賀 長崎 熊本 大分 宮崎 鹿児島 沖縄 " +
    "札幌 仙台 横浜 川崎 名古屋 神戸 浜松 北九州 相模原 堺 新宿 渋谷 池袋 品川 梅田 博多 天神"
  ).split(" ")
);

/** 一个联想是不是只是地名（「浜松」「静岡市」「世田谷区」「浜松 求人」这类）。 */
export function isPlaceSuggestion(rest: string): boolean {
  const head = rest.split(/[\s　]+/)[0];
  return PLACES.has(head) || PLACES.has(head.replace(/[都道府県市区町村]$/, "")) || /^[^\s　]{1,4}[市区町村]$/.test(head);
}

/** Google 搜索联想（client=firefox）：["词 ", ["词 料金", …]] → 去掉词本身、去掉地名，去重，最多 8 个。 */
export function parseSuggest(json: unknown, topic: string): string[] {
  const list = Array.isArray(json) && Array.isArray(json[1]) ? (json[1] as unknown[]) : [];
  const t = topic.trim();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    if (typeof s !== "string") continue;
    const rest = s.startsWith(t) ? s.slice(t.length).trim() : s.trim();
    if (!rest || seen.has(rest) || isPlaceSuggestion(rest)) continue;
    seen.add(rest);
    out.push(rest);
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * はてなブックマーク搜索的 RSS：只留标题里有 topic 的（关键词搜出来的常常是只沾一个词的文章），
 * 数有几篇、一共多少人收藏，列收藏最多的三篇。
 */
export function parseHatenaRss(xml: string, topic: string): AttentionHatena | null {
  const t = squash(topic);
  if (!t) return null;
  const decode = (s: string) =>
    s
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"');
  const field = (item: string, tag: string) => decode(item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? "").trim();
  const items = (xml.match(/<item [\s\S]*?<\/item>/g) ?? [])
    .map((it) => ({
      title: field(it, "title"),
      url: field(it, "link"),
      users: Number(field(it, "hatena:bookmarkcount")) || 0,
      date: field(it, "dc:date").slice(0, 10),
    }))
    .filter((i) => i.title && i.url && squash(i.title).includes(t));
  if (items.length === 0) return { matched: 0, bookmarks: 0, top: [] };
  return {
    matched: items.length,
    bookmarks: items.reduce((n, i) => n + i.users, 0),
    top: [...items].sort((a, b) => b.users - a.users).slice(0, 3),
  };
}

/** YouTube：search.list 给估算的总数和几条视频的 id，videos.list 给播放数。 */
export function parseYoutube(search: unknown, videos: unknown): AttentionYoutube | null {
  const s = search as { pageInfo?: { totalResults?: unknown }; items?: { id?: { videoId?: unknown } }[] } | null;
  if (!s) return null;
  const v = (videos as { items?: { id?: unknown; snippet?: { title?: unknown; publishedAt?: unknown }; statistics?: { viewCount?: unknown } }[] } | null)?.items ?? [];
  return {
    total: typeof s.pageInfo?.totalResults === "number" ? s.pageInfo.totalResults : null,
    videos: v
      .filter((x) => typeof x.id === "string")
      .map((x) => ({
        title: typeof x.snippet?.title === "string" ? x.snippet.title : "",
        url: `https://www.youtube.com/watch?v=${x.id as string}`,
        views: Number(x.statistics?.viewCount) || 0,
        published: typeof x.snippet?.publishedAt === "string" ? x.snippet.publishedAt.slice(0, 10) : "",
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 3),
  };
}

// ── 楽天市場：有多少相关商品、多少人评价过（已经有人在花钱的痕迹） ─────────────

export type AttentionRakuten = {
  /** 楽天市场上搜这个词有多少件商品。 */
  count: number | null;
  /** 评价最多的几件（评价数 ≈ 有多少人买过）。 */
  top: { name: string; url: string; price: number; reviews: number; shop: string }[];
  /** 搜到的前 30 件一共多少条评价、价格的中位数。 */
  reviews: number;
  medianPrice: number | null;
};

/** 楽天市场商品搜索的返回（formatVersion=2 时 Items 是扁平的，1 时套一层 Item）。 */
export function parseRakuten(json: unknown): AttentionRakuten | null {
  const j = json as { count?: unknown; Items?: unknown[] } | null;
  if (!j || !Array.isArray(j.Items)) return null;
  const items = j.Items.map((raw) => {
    const r = ((raw as { Item?: unknown })?.Item ?? raw) as Record<string, unknown>;
    return {
      name: typeof r.itemName === "string" ? r.itemName : "",
      url: typeof r.itemUrl === "string" ? r.itemUrl : "",
      price: Number(r.itemPrice) || 0,
      reviews: Number(r.reviewCount) || 0,
      shop: typeof r.shopName === "string" ? r.shopName : "",
    };
  }).filter((i) => i.name && i.url);
  const prices = items.map((i) => i.price).filter((p) => p > 0).sort((a, b) => a - b);
  return {
    count: typeof j.count === "number" ? j.count : null,
    top: [...items].sort((a, b) => b.reviews - a.reviews).slice(0, 3),
    reviews: items.reduce((n, i) => n + i.reviews, 0),
    medianPrice: prices.length > 0 ? prices[Math.floor(prices.length / 2)] : null,
  };
}

// ── 家计调查：日本家庭每月在这一类东西上花多少钱（总务省，最硬的"已经在花钱"） ───────

/**
 * 家計調査 家計収支編 二人以上の世帯 月次 [品目分類]（2020年改定）（総数：金額）。
 * 品目分类原则上五年改一次，改了就换一张新表（旧表不再更新）：先用 getStatsList 找改定年份最新的那张，找不到才用这张。
 */
export const KAKEI_STATS_ID = "0003343671";

/** 家计调查的品目表：哪张、哪一年改定的。 */
export type KakeiTable = { id: string; revision: number };

/**
 * e-Stat getStatsList 的返回里，挑出"家計収支編 二人以上の世帯、月次、[品目分類]…（総数：金額）"的几张，
 * 按改定年份从新到旧排（「（2025年改定）」「（平成27年改定）」都认）。
 */
export function pickKakeiTables(json: unknown): KakeiTable[] {
  const raw = (json as { GET_STATS_LIST?: { DATALIST_INF?: { TABLE_INF?: unknown } } } | null)?.GET_STATS_LIST?.DATALIST_INF?.TABLE_INF;
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Record<string, unknown>[];
  const text = (v: unknown): string =>
    typeof v === "string" ? v : v && typeof v === "object" ? String((v as Record<string, unknown>)["$"] ?? "") : "";
  const out: KakeiTable[] = [];
  for (const t of list) {
    const title = text(t.TITLE);
    const stat = text(t.STATISTICS_NAME);
    const cycle = text(t.CYCLE);
    if (!stat.includes("二人以上の世帯") || !stat.includes("家計収支編") || (cycle && cycle !== "月次")) continue;
    if (!title.includes("品目分類") || !title.includes("金額") || !title.includes("総数")) continue;
    const y = title.match(/（(\d{4})年改定）/);
    const h = title.match(/（平成(\d+)年改定）/);
    const revision = y ? Number(y[1]) : h ? 1988 + Number(h[1]) : 0;
    const id = String(t["@id"] ?? "");
    if (id && revision) out.push({ id, revision });
  }
  return out.sort((a, b) => b.revision - a.revision);
}

/** 新表的月份接在旧表后面（同一个月两边都有就用新表的），从旧到新。 */
export function mergeMonths(older: { month: string; value: number }[], newer: { month: string; value: number }[]) {
  const have = new Set(newer.map((m) => m.month));
  return [...older.filter((m) => !have.has(m.month)), ...newer].sort((a, b) => a.month.localeCompare(b.month));
}

export type AttentionKakei = {
  items: { name: string; months: { month: string; value: number }[] }[];
  /** 用的是哪一年改定的分类；前面的月份用上一次改定里同名那一项补的话，写在 joined 里。 */
  revision?: number;
  joined?: number;
};

export type EstatClass = { id: string; codes: { code: string; name: string; level: string }[] };

/** e-Stat getMetaInfo 的分类：每个分类（tab、cat01、area……）有哪些代码和名字。 */
export function parseEstatMeta(json: unknown): EstatClass[] {
  const raw = (json as { GET_META_INFO?: { METADATA_INF?: { CLASS_INF?: { CLASS_OBJ?: unknown } } } } | null)?.GET_META_INFO?.METADATA_INF?.CLASS_INF
    ?.CLASS_OBJ;
  const objs = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Record<string, unknown>[];
  return objs.map((o) => {
    const cls = o.CLASS;
    const list = (Array.isArray(cls) ? cls : cls ? [cls] : []) as Record<string, unknown>[];
    return {
      id: String(o["@id"] ?? ""),
      codes: list.map((c) => ({ code: String(c["@code"] ?? ""), name: String(c["@name"] ?? ""), level: String(c["@level"] ?? "") })),
    };
  });
}

/** 品目以外的几个分类各取哪一个：全国、二人以上的世帯、金额；都没有就取第一个。时间不筛。 */
export function kakeiFilters(classes: EstatClass[]): Record<string, string> {
  const prefer = ["全国", "二人以上の世帯", "金額"];
  const params: Record<string, string> = {};
  for (const c of classes) {
    if (c.id === "cat01" || c.id === "time" || c.codes.length === 0) continue;
    const hit = c.codes.find((x) => prefer.some((p) => x.name.includes(p))) ?? c.codes[0];
    const key = `cd${c.id.charAt(0).toUpperCase()}${c.id.slice(1)}`;
    params[key] = hit.code;
  }
  return params;
}

/** 品目的名字（给 AI 挑用；去掉编号前缀和重复）。 */
export function kakeiItemNames(classes: EstatClass[]): { code: string; name: string }[] {
  const cat = classes.find((c) => c.id === "cat01");
  const seen = new Set<string>();
  return (cat?.codes ?? []).flatMap((c) => {
    const name = c.name.replace(/^[\d.]+\s*/, "").trim();
    if (!name || seen.has(name)) return [];
    seen.add(name);
    return [{ code: c.code, name }];
  });
}
