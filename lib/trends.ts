/**
 * Google 趋势：这五年在日本有多少人在 Google 上搜某个说法（每周一个数）。
 * 程序不去抓（robots.txt 不许抓 /explore?）—— 用的是 Google 自己给网站嵌图的那个地址（/trends/embed/），
 * 图在他的浏览器里由 Google 直接画；数是 Google 的相对数（这段时间里搜得最多的那一周 = 100），不是次数。
 */

export const TRENDS_MAX_WORDS = 5;
const TIME = "today 5-y";

/** 去空白、去重，最多 5 个（Google 趋势一次最多比 5 个）。 */
export function trendsWords(words: string[]): string[] {
  const out: string[] = [];
  for (const w of words) {
    const t = w.replace(/[\s　]+/g, " ").trim().slice(0, 60);
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, TRENDS_MAX_WORDS);
}

/** 嵌进页面的那张图（iframe 的地址）。 */
export function trendsEmbedUrl(words: string[]): string {
  const list = trendsWords(words);
  const req = { comparisonItem: list.map((keyword) => ({ keyword, geo: "JP", time: TIME })), category: 0, property: "" };
  const eq = `date=${TIME}&geo=JP&q=${list.join(",")}`;
  return `https://trends.google.com/trends/embed/explore/TIMESERIES?req=${encodeURIComponent(JSON.stringify(req))}&tz=-540&hl=zh-CN&eq=${encodeURIComponent(eq)}`;
}

/** 去 Google 趋势自己看（嵌的图没出来时用）。 */
export function trendsExploreUrl(words: string[]): string {
  return `https://trends.google.co.jp/trends/explore?geo=JP&date=${encodeURIComponent(TIME)}&q=${encodeURIComponent(trendsWords(words).join(","))}`;
}
