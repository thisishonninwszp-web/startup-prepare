/**
 * 外部信号的 RSS 源。只放免认证、公开的 RSS；源要换就改这张表。
 *
 * 每个源属于一类（kind），落库时 external_signals.source = 前缀 + key：
 *   news:     世界在发生什么
 *   voice:    谁在头疼什么（一线干活的人自己在讨论的麻烦、招人难的报道）
 *   plan:     已经定了的未来（法规意见征集、写明了施行日期的消息）
 *   github:   新工具（不走 RSS，见 github.ts）
 * 前缀把它们和关键词抓取（hackernews / qiita …）的行分开，清理旧条目时只动这几类。
 */

export type SignalKind = "news" | "tools" | "voices" | "calendar";
type RssKind = Exclude<SignalKind, "tools">;

export type RssFeed = {
  kind: RssKind;
  key: string;
  label: string;
  url: string;
};

export const NEWS_SOURCE_PREFIX = "news:";
export const VOICE_SOURCE_PREFIX = "voice:";
export const PLAN_SOURCE_PREFIX = "plan:";
export const GITHUB_SOURCE_PREFIX = "github:";
export const GITHUB_SOURCE = `${GITHUB_SOURCE_PREFIX}new`;

/** 每一类各自对应哪个 source 前缀。 */
export const SIGNAL_KIND_PREFIX: Record<SignalKind, string> = {
  news: NEWS_SOURCE_PREFIX,
  tools: GITHUB_SOURCE_PREFIX,
  voices: VOICE_SOURCE_PREFIX,
  calendar: PLAN_SOURCE_PREFIX,
};

const gnews = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q).replace(/%20/g, "+")}&hl=ja&gl=JP&ceid=JP:ja`;

export const RSS_FEEDS: RssFeed[] = [
  // 世界
  { kind: "news", key: "yahoo_top", label: "Yahoo! 主要", url: "https://news.yahoo.co.jp/rss/topics/top-picks.xml" },
  { kind: "news", key: "yahoo_business", label: "Yahoo! 経済", url: "https://news.yahoo.co.jp/rss/topics/business.xml" },
  { kind: "news", key: "yahoo_it", label: "Yahoo! IT", url: "https://news.yahoo.co.jp/rss/topics/it.xml" },
  { kind: "news", key: "yahoo_world", label: "Yahoo! 国際", url: "https://news.yahoo.co.jp/rss/topics/world.xml" },
  { kind: "news", key: "hackernews", label: "Hacker News", url: "https://news.ycombinator.com/rss" },
  { kind: "news", key: "techcrunch", label: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { kind: "news", key: "itmedia", label: "ITmedia", url: "https://rss.itmedia.co.jp/rss/2.0/itmedia_all.xml" },
  { kind: "news", key: "gigazine", label: "GIGAZINE", url: "https://gigazine.net/news/rss_2.0/" },
  { kind: "news", key: "gnews_money", label: "Google News 資金調達・新規事業", url: gnews("資金調達 OR 新規事業") },
  { kind: "news", key: "gnews_rates", label: "Google News 金利・為替", url: gnews("FRB OR 日銀 OR 利上げ OR 為替") },

  // 谁在头疼什么：一线干活的人自己在讨论的麻烦、哪里招不到人
  { kind: "voices", key: "hatena_economics", label: "はてブ 政治と経済", url: "https://b.hatena.ne.jp/hotentry/economics.rss" },
  { kind: "voices", key: "hatena_it", label: "はてブ テクノロジー", url: "https://b.hatena.ne.jp/hotentry/it.rss" },
  { kind: "voices", key: "hatena_life", label: "はてブ 暮らし", url: "https://b.hatena.ne.jp/hotentry/life.rss" },
  { kind: "voices", key: "note_management", label: "note #経営", url: "https://note.com/hashtag/%E7%B5%8C%E5%96%B6/rss" },
  { kind: "voices", key: "gnews_shortage", label: "Google News 人手不足・採用難", url: gnews("人手不足 OR 採用難") },

  // 已经定了的未来：法规修改前都要公开征求意见；写明了施行、义务化日期的消息
  { kind: "calendar", key: "egov_comment", label: "e-Gov 意見募集", url: "https://public-comment.e-gov.go.jp/rss/pcm_list.xml" },
  { kind: "calendar", key: "gnews_enforce", label: "Google News 施行・義務化", url: gnews("施行 OR 義務化 2027年") },
];

export function rssSource(feed: RssFeed): string {
  return SIGNAL_KIND_PREFIX[feed.kind] + feed.key;
}

/** 已经撤掉的源：表里还留着它们抓过的行（两周后清掉），显示时照样给个名字。 */
const RETIRED_LABELS: [string, string][] = [
  ["news:gnews_career", "Google News 転職・副業"],
  ["voice:note_career", "note #転職"],
];

const LABELS = new Map<string, string>([
  ...RSS_FEEDS.map((f) => [rssSource(f), f.label] as const),
  [GITHUB_SOURCE, "GitHub 新仓库"],
  ...RETIRED_LABELS,
]);

/** external_signals.source → 页面上显示的来源名；不认识的原样返回。 */
export function newsSourceLabel(source: string): string {
  return LABELS.get(source) ?? source;
}

/** 一条 source 属于哪一类。 */
export function signalKindOf(source: string): SignalKind {
  const hit = (Object.keys(SIGNAL_KIND_PREFIX) as SignalKind[]).find((k) =>
    source.startsWith(SIGNAL_KIND_PREFIX[k])
  );
  return hit ?? "news";
}
