import type { Attention } from "./attention-shared";

/**
 * 差距清单 · 这边有人在为这个头疼吗：浏览器端也要用的部分。不碰数据库、不碰 AI。
 *
 * 差距清单只问过"这边有没有这个东西"（供给方）；这里问"这边的人有没有这个麻烦"（需求方）。
 * 原话分三种，只数次数。网上抱怨的人不等于会掏钱的人 —— 这些只算"有痛"的弱证据，不算"愿付钱"。
 */

export const VOICE_KINDS = {
  complain: "在抱怨",
  seek: "在找办法",
  workaround: "已经在花钱、花力气绕路",
} as const;
export type VoiceKind = keyof typeof VOICE_KINDS;

export type VoiceQuote = {
  kind: VoiceKind;
  /** 原文（代码核对过逐字在那一页 / 那条评论里）。 */
  excerpt: string;
  url: string;
  title: string;
  /** App Store 评论还是网页。 */
  from: "review" | "web";
  /** 评论的日子（YYYY-MM-DD）和星数；网页没有。 */
  date?: string;
  rating?: number;
};

export type GapVoices = {
  /** 它要解决的那件麻烦（从用的人那边说，AI 写的）。 */
  pain: string;
  /** 这边的人为这件麻烦自己会搜的说法（周刊 note 版的标题用它，有痛的人一搜就能搜到）。早期查过的没有。 */
  queries?: string[];
  quotes: VoiceQuote[];
  /** 翻了几篇网页、几条差评（一句都没找到时，分得清是没搜到还是搜到了没人说）。 */
  searched: { pages: number; reviews: number };
  /** 这些原话请 Jev 看过没有（没调通时照收 AI 分的类、页面上标出来）。 */
  judged: boolean;
  /**
   * 这边的人现在拿来对付这件事的 App，各有多少人评过分（App Store 给的数）：
   * 不用跟任何人说话就能看到的"已经有多少人在用"的痕迹。早期查过的没有。
   */
  apps?: { name: string; ratings: number; url: string }[];
  /** 有多少人在关注（维基浏览量、搜索联想、はてな、YouTube）。只有日本这边；早期查过的没有。 */
  attention?: Attention;
  /** 以前量过的几次（旧的在前，不含这一次）：每次重新听、再量一次，上一次的几个总数挪进来，攒成随时间的线。 */
  history?: AttentionPoint[];
  created_at: string;
};

/** 量过的一次：只留几个总数（这几样没有现成的历史，只能自己隔一阵量一次攒起来）。 */
export type AttentionPoint = {
  at: string;
  /** 维基上一个完整月的浏览量。 */
  wiki?: number;
  /** はてな标题里有这个词的文章几篇。 */
  hatena?: number;
  /** YouTube 上这个叫法的视频几条（YouTube 给的估计数）。 */
  youtube?: number;
  /** 楽天市场相关商品几件、前 30 件一共多少条评价。 */
  rakutenItems?: number;
  rakutenReviews?: number;
  /** 这边的人在用的那几个 App 一共多少人评过分。 */
  appRatings?: number;
};

/**
 * label 是全称，short 是表头。grows：只会越攒越多的总数（评价、评分人数）——
 * 总数的线几乎是平的，看的是每次比上一次多了几条，所以画"多了几条"。
 */
export const POINT_LABELS: { key: Exclude<keyof AttentionPoint, "at">; label: string; short: string; unit: string; grows: boolean }[] = [
  { key: "appRatings", label: "那几个 App 评过分的人", short: "App 评分人数", unit: "人", grows: true },
  { key: "rakutenReviews", label: "楽天前 30 件的评价", short: "楽天评价", unit: "条", grows: true },
  { key: "rakutenItems", label: "楽天相关商品", short: "楽天商品", unit: "件", grows: false },
  { key: "youtube", label: "YouTube 视频", short: "YouTube", unit: "条", grows: false },
  { key: "hatena", label: "はてな标题里有这个词的文章", short: "はてな", unit: "篇", grows: false },
  { key: "wiki", label: "维基上个月浏览", short: "维基上月", unit: "次", grows: false },
];

/** 隔几天以上再量一次才多一个有用的点。 */
export const REMEASURE_DAYS = 28;
/** 最多留几次（三年的月度）。 */
export const HISTORY_MAX = 36;

/** 这一次量到的几个总数；一样都没有返回 null。 */
export function attentionPoint(v: Pick<GapVoices, "attention" | "apps" | "created_at">): AttentionPoint | null {
  const a = v.attention;
  const p: AttentionPoint = { at: a?.checked_at ?? v.created_at };
  const lastWiki = a?.wiki?.months[a.wiki.months.length - 1];
  if (lastWiki) p.wiki = lastWiki.views;
  if (a?.hatena) p.hatena = a.hatena.matched;
  if (a?.youtube && a.youtube !== "no-key" && typeof a.youtube.total === "number") p.youtube = a.youtube.total;
  if (a?.rakuten && a.rakuten !== "no-key" && !("error" in a.rakuten)) {
    if (typeof a.rakuten.count === "number") p.rakutenItems = a.rakuten.count;
    p.rakutenReviews = a.rakuten.reviews;
  }
  if (v.apps && v.apps.length > 0) p.appRatings = v.apps.reduce((n, x) => n + x.ratings, 0);
  return Object.keys(p).length > 1 ? p : null;
}

/** 重新量之前：把上一次的几个总数挪进历史（旧的在前，最多 HISTORY_MAX 次）。 */
export function carryHistory(prev: GapVoices | null): AttentionPoint[] {
  if (!prev) return [];
  const point = attentionPoint(prev);
  return [...(prev.history ?? []), ...(point ? [point] : [])].slice(-HISTORY_MAX);
}

/** 连同这一次，量过的每一次（旧的在前）。 */
export function attentionSeries(v: GapVoices): AttentionPoint[] {
  const now = attentionPoint(v);
  return [...(v.history ?? []), ...(now ? [now] : [])];
}

/** 某一样每个月一个数（同一个月量了几次取最后一次），画线用。 */
export function monthlyPoints(series: AttentionPoint[], key: Exclude<keyof AttentionPoint, "at">): { month: string; value: number }[] {
  const byMonth = new Map<string, number>();
  for (const p of series) {
    const v = p[key];
    if (typeof v === "number") byMonth.set(p.at.slice(0, 7), v);
  }
  return Array.from(byMonth, ([month, value]) => ({ month, value })).sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * 每个月比上一次量多了几条（第一次没有"上一次"，不算）。变少的（楽天前 30 件换了几件）记成 0，
 * 由调用方在页面上写明。
 */
export function monthlyGrowth(points: { month: string; value: number }[]): { month: string; value: number }[] {
  return points.slice(1).map((p, i) => ({ month: p.month, value: Math.max(0, p.value - points[i].value) }));
}

/** 每种几句（只数次数）。 */
export function voiceCounts(quotes: Pick<VoiceQuote, "kind">[]): Record<VoiceKind, number> {
  const out = { complain: 0, seek: 0, workaround: 0 };
  for (const q of quotes) out[q.kind] += 1;
  return out;
}

// ── App Store 评论 ─────────────────────────────────────────────────────────

/** 每个 App 取几条三星以下的最新评论。 */
export const REVIEWS_PER_APP = 10;

/** 一条评论当一篇资料用（和网页一样有 title / url / content），另带日子和星数。 */
export type ReviewSource = { title: string; url: string; content: string; date: string; rating: number };

/** iTunes 评论 RSS 的一条 → 评论来源；不是评论（没有星数）或太短的丢掉。 */
export function parseReviewEntries(feed: unknown, app: { name: string; url: string }, max: number): ReviewSource[] {
  const raw = (feed as { feed?: { entry?: unknown } } | null)?.feed?.entry;
  const entries = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const label = (e: Record<string, unknown>, k: string) => ((e[k] as { label?: unknown } | undefined)?.label as string | undefined) ?? "";
  const out: ReviewSource[] = [];
  for (const e of entries) {
    if (!e || typeof e !== "object") continue;
    const r = e as Record<string, unknown>;
    const rating = Number(label(r, "im:rating"));
    const text = [label(r, "title"), label(r, "content")].filter(Boolean).join("。").trim();
    if (!Number.isInteger(rating) || rating < 1 || rating > 3 || text.length < 15) continue;
    const date = label(r, "updated").slice(0, 10);
    out.push({
      title: `App Store 评论 · ${app.name} · ★${rating}${date ? ` · ${date}` : ""}`,
      url: app.url,
      content: text.slice(0, 600),
      date,
      rating,
    });
    if (out.length >= max) break;
  }
  return out;
}
