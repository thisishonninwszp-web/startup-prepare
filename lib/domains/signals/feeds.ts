/**
 * 外部信号的 RSS 源。只放免认证、公开的 RSS；源要换就改这张表。
 *
 * 每个源属于一类（kind），落库时 external_signals.source = 前缀 + key：
 *   news:     世界在发生什么（含中文媒体：中国已经跑通、日本还没有的做法）
 *   voice:    谁在头疼什么（一线干活的人自己在讨论的麻烦、招人难、谁在倒闭）
 *   plan:     已经定了的未来（法规意见征集、写明了施行日期的消息）
 *   money:    谁在掏钱（融资、众筹达成、补助金、事业承继和 M&A）—— 抱怨不花钱，掏钱才是真的
 *   github:   新工具（不走 RSS，见 github.ts）
 *   able:     什么变得可能了（AI 降价、规制缓和、日本首次提供的服务）；和 github 同属"新工具"那一节
 * 前缀把它们和关键词抓取（hackernews / qiita …）的行分开，清理旧条目时只动这几类。
 */

export type SignalKind = "news" | "tools" | "voices" | "calendar" | "money";

export type RssFeed = {
  /** tools 类的 RSS 源是"什么变得可能了"的新闻，落库前缀用 able:（GitHub 仓库不走 RSS）。 */
  kind: SignalKind;
  key: string;
  label: string;
  url: string;
  /** 中文媒体。报告里会多问一句"日本这边有没有"。 */
  china?: true;
};

export const NEWS_SOURCE_PREFIX = "news:";
export const VOICE_SOURCE_PREFIX = "voice:";
export const PLAN_SOURCE_PREFIX = "plan:";
export const MONEY_SOURCE_PREFIX = "money:";
export const GITHUB_SOURCE_PREFIX = "github:";
export const ABLE_SOURCE_PREFIX = "able:";
export const GITHUB_SOURCE = `${GITHUB_SOURCE_PREFIX}new`;

/** 每一类收哪些 source 前缀。"新工具"一节既收 GitHub 仓库，也收"什么变得可能了"的新闻。 */
export const SIGNAL_KIND_PREFIXES: Record<SignalKind, string[]> = {
  news: [NEWS_SOURCE_PREFIX],
  tools: [GITHUB_SOURCE_PREFIX, ABLE_SOURCE_PREFIX],
  voices: [VOICE_SOURCE_PREFIX],
  calendar: [PLAN_SOURCE_PREFIX],
  money: [MONEY_SOURCE_PREFIX],
};

/** 给 supabase 的 .or() 用：source 以这一类任一前缀开头。 */
export function kindSourceFilter(kind: SignalKind): string {
  return SIGNAL_KIND_PREFIXES[kind].map((p) => `source.like.${p}%`).join(",");
}

/** 这一条是不是 GitHub 仓库（读 README，而不是读文章）。 */
export function isGithubSource(source: string): boolean {
  return source.startsWith(GITHUB_SOURCE_PREFIX);
}

const gnews = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q).replace(/%20/g, "+")}&hl=ja&gl=JP&ceid=JP:ja`;
/** Google News 中文版。36氪 的官方 RSS 会被防爬页拦住，从这里搜它的文章。 */
const gnewsZh = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q).replace(/%20/g, "+")}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;

export const RSS_FEEDS: RssFeed[] = [
  // 世界
  // 不用 Yahoo「主要」：它混着体育和娱乐（棒球速报、驿传、动漫）。「国内」是政治、社会、政策
  { kind: "news", key: "yahoo_domestic", label: "Yahoo! 国内", url: "https://news.yahoo.co.jp/rss/topics/domestic.xml" },
  { kind: "news", key: "yahoo_business", label: "Yahoo! 経済", url: "https://news.yahoo.co.jp/rss/topics/business.xml" },
  { kind: "news", key: "yahoo_it", label: "Yahoo! IT", url: "https://news.yahoo.co.jp/rss/topics/it.xml" },
  { kind: "news", key: "yahoo_world", label: "Yahoo! 国際", url: "https://news.yahoo.co.jp/rss/topics/world.xml" },
  { kind: "news", key: "hackernews", label: "Hacker News", url: "https://news.ycombinator.com/rss" },
  { kind: "news", key: "techcrunch", label: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { kind: "news", key: "itmedia", label: "ITmedia", url: "https://rss.itmedia.co.jp/rss/2.0/itmedia_all.xml" },
  { kind: "news", key: "gigazine", label: "GIGAZINE", url: "https://gigazine.net/news/rss_2.0/" },
  { kind: "news", key: "gnews_rates", label: "Google News 金利・為替", url: gnews("FRB OR 日銀 OR 利上げ OR 為替") },
  // 中国：已经跑通、日本还没有的做法
  { kind: "news", key: "tmtpost", label: "钛媒体", url: "https://www.tmtpost.com/rss.xml", china: true },
  { kind: "news", key: "woshipm", label: "人人都是产品经理", url: "https://www.woshipm.com/feed", china: true },
  { kind: "news", key: "gnews_36kr", label: "36氪", url: gnewsZh("36氪"), china: true },

  // 谁在头疼什么：一线干活的人自己在讨论的麻烦、哪里招不到人
  { kind: "voices", key: "hatena_economics", label: "はてブ 政治と経済", url: "https://b.hatena.ne.jp/hotentry/economics.rss" },
  { kind: "voices", key: "hatena_it", label: "はてブ テクノロジー", url: "https://b.hatena.ne.jp/hotentry/it.rss" },
  { kind: "voices", key: "hatena_life", label: "はてブ 暮らし", url: "https://b.hatena.ne.jp/hotentry/life.rss" },
  { kind: "voices", key: "note_management", label: "note #経営", url: "https://note.com/hashtag/%E7%B5%8C%E5%96%B6/rss" },
  { kind: "voices", key: "gnews_shortage", label: "Google News 人手不足・採用難", url: gnews("人手不足 OR 採用難") },
  // 谁在倒闭、为什么：人手不足倒产、物价高倒产、后继者不在（東京商工リサーチ 自己的 RSS 只有产品发布，月度统计从这里搜）
  { kind: "voices", key: "gnews_bankruptcy", label: "Google News 倒産", url: gnews("倒産 OR 破産手続き OR 事業停止") },

  // 谁在掏钱：投资人为什么掏钱（融资）、消费者为什么掏钱（众筹达成，Makuake、CAMPFIRE 没有公开 RSS）、
  // 政府为什么掏钱（补助金公募）、谁在买下别人的生意（事业承继、M&A）
  { kind: "money", key: "gnews_funding", label: "Google News 资金调动", url: gnews("資金調達 シリーズA OR シードラウンド OR 資金調達を実施") },
  { kind: "money", key: "gnews_crowdfunding", label: "Google News 众筹达成", url: gnews("(Makuake OR CAMPFIRE OR クラウドファンディング) 達成") },
  { kind: "money", key: "gnews_subsidy", label: "Google News 补助金公募", url: gnews("補助金 公募 開始") },
  { kind: "money", key: "gnews_succession", label: "Google News 事业承继・M&A", url: gnews("事業承継 M&A") },

  // 什么变得可能了：AI 降价、规制缓和、日本首次提供（"解禁"会搜到一堆艺人新闻，不用）
  { kind: "tools", key: "gnews_ai_price", label: "Google News AI 降价", url: gnews("API 値下げ OR 料金引き下げ 生成AI") },
  { kind: "tools", key: "gnews_dereg", label: "Google News 规制缓和", url: gnews("規制緩和 OR 規制改革") },
  { kind: "tools", key: "gnews_first_jp", label: "Google News 日本首次提供", url: gnews("日本初 サービス開始") },

  // 已经定了的未来：法规修改前都要公开征求意见；写明了施行、义务化日期的消息
  { kind: "calendar", key: "egov_comment", label: "e-Gov 意見募集", url: "https://public-comment.e-gov.go.jp/rss/pcm_list.xml" },
  { kind: "calendar", key: "gnews_enforce", label: "Google News 施行・義務化", url: gnews("施行 OR 義務化 2027年") },
];

export function rssSource(feed: RssFeed): string {
  return (feed.kind === "tools" ? ABLE_SOURCE_PREFIX : SIGNAL_KIND_PREFIXES[feed.kind][0]) + feed.key;
}

/** 已经撤掉的源：表里还留着它们抓过的行（两周后清掉），显示时照样给个名字。 */
const RETIRED_LABELS: [string, string][] = [
  ["news:gnews_money", "Google News 資金調達・新規事業"],
  ["news:gnews_crowdfunding", "Google News 众筹达成"],
  ["news:yahoo_top", "Yahoo! 主要"],
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

const CHINA_SOURCES = new Set(RSS_FEEDS.filter((f) => f.china).map(rssSource));

/** 这条是不是来自中文媒体。 */
export function isChinaSource(source: string): boolean {
  return CHINA_SOURCES.has(source);
}

/**
 * 每个源轮流取一条（各自从新到旧），直到取满 max。
 * 源多了以后，发稿勤的（Yahoo、Google News）会把发稿少的（中文媒体）挤出候选；轮流取就不会。
 * rows 要先按时间从新到旧排好。
 */
export function balanceBySource<T extends { source: string }>(rows: T[], max: number): T[] {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const g = groups.get(r.source);
    if (g) g.push(r);
    else groups.set(r.source, [r]);
  }
  const out: T[] = [];
  for (let round = 0; out.length < max; round++) {
    let added = false;
    for (const g of Array.from(groups.values())) {
      if (round < g.length && out.length < max) {
        out.push(g[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}

/** 一条 source 属于哪一类。 */
export function signalKindOf(source: string): SignalKind {
  const hit = (Object.keys(SIGNAL_KIND_PREFIXES) as SignalKind[]).find((k) =>
    SIGNAL_KIND_PREFIXES[k].some((p) => source.startsWith(p))
  );
  return hit ?? "news";
}
