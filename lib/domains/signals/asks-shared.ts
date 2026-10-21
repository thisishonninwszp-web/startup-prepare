/**
 * 有多少人在问（程序自动查、不花钱，浏览器端也要用的部分，不碰网络）：
 * - 知恵袋：搜索页 robots.txt 不许程序用，但单个提问页允许 —— 先用 Google 找到几页提问，程序读每页的
 *   发问日期、看过的人数（閲覧数）、「共感した」的人数、回答数，再加上每页底下列的相关提问（标题、日期、回答数），
 *   只留标题里有这个叫法的，按发问年份数。是 Google 挑出来的一批（偏热门），不是全部。
 * - 人们在问什么：Google 搜索联想在叫法后面加一个假名再问一遍（あ、か、さ……），列出人们真在搜的说法。
 * - 国会：国会会議録的官方接口，每年有几次发言提到这个叫法（政策在不在动）。
 * 只数次数，不算比率。
 */

export type ChiebukuroAsk = {
  url: string;
  /** 提问开头（截到 80 字）。 */
  title: string;
  /** 发问日期 YYYY-MM-DD。 */
  date: string;
  answers: number;
  /** 只有程序读过的那几页才有：看过的人数、点了「共感した」的人数。 */
  views?: number;
  sympathy?: number;
};

export type ChiebukuroSample = {
  /** Google 找到几页提问、程序读到了几页。 */
  found: number;
  read: number;
  /** 标题里有这个叫法的（去重，新的在前）。 */
  asks: ChiebukuroAsk[];
};

export type KokkaiYears = { year: number; count: number }[];

/** 信息缺口卡片上「数一数」一次的结果（不存）。 */
export type AsksResult = {
  topic: string;
  chiebukuro: ChiebukuroSample | null;
  asked: string[] | null;
  kokkai: KokkaiYears | null;
  checked_at: string;
};

const ASK_TITLE_MAX = 80;

/** 提问页网址统一成 https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q123（去掉参数、#）；不是提问页返回 null。 */
export function questionUrl(raw: string): string | null {
  const m = raw.match(/^https?:\/\/detail\.chiebukuro\.yahoo\.co\.jp\/qa\/question_detail\/(q\d+)/);
  return m ? `https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/${m[1]}` : null;
}

function clip(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > ASK_TITLE_MAX ? `${one.slice(0, ASK_TITLE_MAX)}…` : one;
}

function int(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/** JSON 字符串里的转义（\n、\"、\uXXXX）还原；还原不了就原样。 */
function unescape(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw;
  }
}

/**
 * 读一页提问：页面里 ld+json 的 QAPage（提问正文、发问时间、回答数），页面数据里的 viewNumber（閲覧数）、
 * reactionCounter（共感した），再加上底下相关提问的列表（标题、日期 2020/3/3 22:36、回答数、网址）。
 */
export function parseChiebukuroPage(html: string, url: string): { main: ChiebukuroAsk | null; related: ChiebukuroAsk[] } {
  const self = questionUrl(url);
  let main: ChiebukuroAsk | null = null;
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const list = Array.isArray(data) ? data : [data];
    const page = list.find((d) => (d as { "@type"?: string })?.["@type"] === "QAPage") as
      | { mainEntity?: { name?: unknown; datePublished?: unknown; answerCount?: unknown } }
      | undefined;
    const q = page?.mainEntity;
    if (self && q && typeof q.name === "string" && typeof q.datePublished === "string") {
      main = {
        url: self,
        title: clip(q.name),
        date: q.datePublished.slice(0, 10),
        answers: typeof q.answerCount === "number" ? q.answerCount : 0,
      };
      const views = int(html.match(/"viewNumber":"([\d,]+)"/)?.[1]);
      const sympathy = int(html.match(/"reactionCounter":\{"count":(\d+),"actionType":"sympathy"\}/)?.[1]);
      if (views !== undefined) main.views = views;
      if (sympathy !== undefined) main.sympathy = sympathy;
      break;
    }
  }

  const related: ChiebukuroAsk[] = [];
  const item =
    /"questionTitle":"((?:[^"\\]|\\.)*)","answerCount":(\d+),"dateString":"(\d{4})\/(\d{1,2})\/(\d{1,2})[^"]*"[^{}]*?"href":"(https:\/\/detail\.chiebukuro\.yahoo\.co\.jp\/qa\/question_detail\/q\d+)"/g;
  for (const m of html.matchAll(item)) {
    const href = questionUrl(m[6]);
    if (!href || href === self) continue;
    related.push({
      url: href,
      title: clip(unescape(m[1])),
      date: `${m[3]}-${m[4].padStart(2, "0")}-${m[5].padStart(2, "0")}`,
      answers: Number(m[2]),
    });
  }
  return { main, related };
}

const squash = (t: string) => t.replace(/[\s　]+/g, "").toLowerCase();

/** 叫法里的每个词都在标题里出现（「家事代行 中国語」两个词都要有）。 */
export function titleHasTopic(title: string, topic: string): boolean {
  const words = topic.split(/[\s　]+/).map(squash).filter(Boolean);
  const t = squash(title);
  return words.length > 0 && words.every((w) => t.includes(w));
}

/** 读过的几页 + 它们底下的相关提问 → 标题里有这个叫法的（同一个网址只留一条，读过的那条优先），新的在前。 */
export function collectAsks(pages: { main: ChiebukuroAsk | null; related: ChiebukuroAsk[] }[], topic: string): ChiebukuroAsk[] {
  const byUrl = new Map<string, ChiebukuroAsk>();
  for (const p of pages) if (p.main && titleHasTopic(p.main.title, topic)) byUrl.set(p.main.url, p.main);
  for (const p of pages) for (const r of p.related) if (!byUrl.has(r.url) && titleHasTopic(r.title, topic)) byUrl.set(r.url, r);
  return Array.from(byUrl.values()).sort((a, b) => b.date.localeCompare(a.date));
}

/** 按发问年份数，从最早那年数到今年，中间没有的年份记 0。 */
export function asksByYear(asks: Pick<ChiebukuroAsk, "date">[], thisYear: number): { year: number; count: number }[] {
  const years = asks.map((a) => Number(a.date.slice(0, 4))).filter((y) => y >= 2004 && y <= thisYear);
  if (years.length === 0) return [];
  const out: { year: number; count: number }[] = [];
  for (let y = Math.min(...years); y <= thisYear; y += 1) out.push({ year: y, count: years.filter((x) => x === y).length });
  return out;
}

/** 读过的那几页一共被看了多少次、多少人点了共感（只加读过的，相关提问没有这两个数）。 */
export function readTotals(asks: ChiebukuroAsk[]): { pages: number; views: number; sympathy: number } {
  const read = asks.filter((a) => a.views !== undefined);
  return {
    pages: read.length,
    views: read.reduce((n, a) => n + (a.views ?? 0), 0),
    sympathy: read.reduce((n, a) => n + (a.sympathy ?? 0), 0),
  };
}

/** 联想加假名问一遍时用的行（第一行是不加假名）。 */
export const SUGGEST_KANA = ["", "あ", "か", "さ", "た", "な", "は", "ま", "や", "ら", "わ"];

/** 几轮联想合在一起：去重、去掉已经在普通联想里的，最多 60 个。 */
export function mergeAsked(rounds: (string[] | null)[], already: string[] = []): string[] | null {
  if (rounds.every((r) => r === null)) return null;
  const seen = new Set(already);
  const out: string[] = [];
  for (const r of rounds) {
    for (const s of r ?? []) {
      if (seen.has(s)) continue;
      seen.add(s);
      out.push(s);
      if (out.length >= 60) return out;
    }
  }
  return out;
}

/** 国会会議録接口（speech）的 numberOfRecords；取不到返回 null。 */
export function parseKokkaiCount(json: unknown): number | null {
  const n = (json as { numberOfRecords?: unknown } | null)?.numberOfRecords;
  const v = typeof n === "number" ? n : typeof n === "string" ? Number(n) : NaN;
  return Number.isFinite(v) ? v : null;
}
