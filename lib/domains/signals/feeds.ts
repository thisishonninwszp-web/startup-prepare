/**
 * 每日新闻的 RSS 源。只放免认证、公开的 RSS；源要换就改这张表。
 *
 * key 落库时加 "news:" 前缀写进 external_signals.source，
 * 和关键词抓取（hackernews / qiita …）的行区分开，清理旧新闻时只动这一类。
 */

export type NewsFeed = {
  key: string;
  label: string;
  url: string;
};

export const NEWS_SOURCE_PREFIX = "news:";

export const NEWS_FEEDS: NewsFeed[] = [
  { key: "yahoo_top", label: "Yahoo! 主要", url: "https://news.yahoo.co.jp/rss/topics/top-picks.xml" },
  { key: "yahoo_business", label: "Yahoo! 経済", url: "https://news.yahoo.co.jp/rss/topics/business.xml" },
  { key: "yahoo_it", label: "Yahoo! IT", url: "https://news.yahoo.co.jp/rss/topics/it.xml" },
  { key: "yahoo_world", label: "Yahoo! 国際", url: "https://news.yahoo.co.jp/rss/topics/world.xml" },
  { key: "hackernews", label: "Hacker News", url: "https://news.ycombinator.com/rss" },
  { key: "techcrunch", label: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { key: "itmedia", label: "ITmedia", url: "https://rss.itmedia.co.jp/rss/2.0/itmedia_all.xml" },
  { key: "gigazine", label: "GIGAZINE", url: "https://gigazine.net/news/rss_2.0/" },
  {
    key: "gnews_career",
    label: "Google News 転職・副業",
    url: "https://news.google.com/rss/search?q=%E8%BB%A2%E8%81%B7+OR+%E5%89%AF%E6%A5%AD&hl=ja&gl=JP&ceid=JP:ja",
  },
  {
    key: "gnews_rates",
    label: "Google News 金利・為替",
    url: "https://news.google.com/rss/search?q=FRB+OR+%E6%97%A5%E9%8A%80+OR+%E5%88%A9%E4%B8%8A%E3%81%92+OR+%E7%82%BA%E6%9B%BF&hl=ja&gl=JP&ceid=JP:ja",
  },
];

/** GitHub 新工具：最近 7 天新建、星数涨得快的仓库。 */
export const GITHUB_SOURCE_PREFIX = "github:";
export const GITHUB_SOURCE = `${GITHUB_SOURCE_PREFIX}new`;

/** 页面上的两个页签各自对应哪一类 source。 */
export type SignalKind = "news" | "tools";
export const SIGNAL_KIND_PREFIX: Record<SignalKind, string> = {
  news: NEWS_SOURCE_PREFIX,
  tools: GITHUB_SOURCE_PREFIX,
};

const LABELS = new Map([
  ...NEWS_FEEDS.map((f) => [NEWS_SOURCE_PREFIX + f.key, f.label] as const),
  [GITHUB_SOURCE, "GitHub 新仓库"] as const,
]);

/** external_signals.source → 页面上显示的来源名；不认识的原样返回。 */
export function newsSourceLabel(source: string): string {
  return LABELS.get(source) ?? source;
}
