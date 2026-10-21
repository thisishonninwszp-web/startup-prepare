import { titleHasTopic } from "./asks-shared";

/**
 * 三个允许程序看搜索页的网站（robots.txt 没禁），浏览器端也要用的部分，不碰网络：
 * - ガルちゃん：日本最大的女性讨论区，每个讨论（トピ）有开的日子和评论数 —— 有多少人在为这件事说话。
 * - CAMPFIRE：众筹，每个项目筹了多少钱、几个人支持 —— 有没有人为还不存在的东西先掏钱。
 * - PR TIMES：新闻稿，最近哪些公司在发这件事 —— 有多少人在做（竞争热度，不是需求）。
 * 都只留标题里有这个叫法每个词的；网站自己的总数照抄（它连正文里提到的也算）。只数次数。
 */

export type GcTopic = { url: string; title: string; date: string; comments: number };
export type GcSample = { total: number | null; topics: GcTopic[] };

export type CfProject = { url: string; title: string; amount: number; backers: number; open: boolean };
export type CfSample = { total: number | null; seen: number; projects: CfProject[] };

export type PrRelease = { url: string; title: string; date: string; company: string };
export type PrSample = { total: number | null; seen: number; releases: PrRelease[] };

const TITLE_MAX = 80;

function decode(t: string): string {
  return t
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(t: string): string {
  return t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX)}…` : t;
}

const num = (raw: string | undefined) => (raw ? Number(raw.replace(/[,，]/g, "")) || 0 : 0);

/** 网站自己说的「N件」（第一处）。 */
function totalOf(html: string, pattern: RegExp): number | null {
  const m = html.match(pattern);
  return m ? num(m[1]) : null;
}

/** ガルちゃん搜索结果一页：<li><a href="/topics/123/">…<span>260コメント</span><span class="datetime">2026/07/02(木) 08:19</span>…<p class="title">…</p></a></li> */
export function parseGirlschannel(html: string): { total: number | null; topics: GcTopic[] } {
  const topics: GcTopic[] = [];
  const item =
    /<a href="\/topics\/(\d+)\/">[\s\S]*?<span>([\d,]+)コメント<\/span><span class="datetime">(\d{4})\/(\d{2})\/(\d{2})[^<]*<\/span>[\s\S]*?<p class="title">([\s\S]*?)<\/p>/g;
  for (const m of html.matchAll(item)) {
    topics.push({
      url: `https://girlschannel.net/topics/${m[1]}/`,
      title: clip(decode(m[6])),
      date: `${m[3]}-${m[4]}-${m[5]}`,
      comments: num(m[2]),
    });
  }
  return { total: totalOf(html, /([\d,]+)\s*件/), topics };
}

/** CAMPFIRE 搜索结果一页：每张卡片的项目号、标题、现在筹了多少、几个人支持、还剩几天（「終了」= 结束了）。 */
export function parseCampfire(html: string): { total: number | null; projects: CfProject[] } {
  const projects: CfProject[] = [];
  for (const card of html.split(/<li class="card-wrapper">/).slice(1)) {
    const id = card.match(/href="\/projects\/(\d+)\/view/)?.[1];
    const title = card.match(/<a [^>]*title="([^"]*)"/)?.[1];
    if (!id || !title) continue;
    const rest = card.match(/<small[^>]*>残り<\/small>\s*(?:<!--[^>]*-->)?\s*([^<]*)/)?.[1]?.trim() ?? "";
    projects.push({
      url: `https://camp-fire.jp/projects/${id}/view`,
      title: clip(decode(title)),
      amount: num(card.match(/<small[^>]*>現在<\/small>\s*([\d,]+)/)?.[1]),
      backers: num(card.match(/<small[^>]*>支援者<\/small>\s*([\d,]+)/)?.[1]),
      open: rest !== "" && rest !== "終了",
    });
  }
  return { total: totalOf(html, /検索した結果([\d,]+)件/), projects };
}

/** PR TIMES 搜索结果一页（新的在前，一页 40 篇）：标题、发布日子、公司。 */
export function parsePrtimes(html: string): { total: number | null; releases: PrRelease[] } {
  const releases: PrRelease[] = [];
  for (const m of html.matchAll(/<article class="[^"]*">([\s\S]*?)<\/article>/g)) {
    const a = m[1];
    const href = a.match(/href="(\/main\/html\/rd\/p\/[^"]+)"/)?.[1];
    const title = a.match(/<h3 class="_title_[^"]*">([\s\S]*?)<\/h3>/)?.[1];
    const date = a.match(/<time>(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (!href || !title || !date) continue;
    releases.push({
      url: `https://prtimes.jp${href}`,
      title: clip(decode(title)),
      date: `${date[1]}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}`,
      company: decode(a.match(/<span class="_companyName_[^"]*">([\s\S]*?)<\/span>/)?.[1] ?? ""),
    });
  }
  return { total: totalOf(html, /<span class="_total_[^"]*">([\d,]+)/), releases };
}

/** 几页合在一起，去重，只留标题里有这个叫法的。 */
export function keepMatching<T extends { url: string; title: string }>(lists: T[][], topic: string): T[] {
  const byUrl = new Map<string, T>();
  for (const list of lists) for (const x of list) if (!byUrl.has(x.url) && titleHasTopic(x.title, topic)) byUrl.set(x.url, x);
  return Array.from(byUrl.values());
}
