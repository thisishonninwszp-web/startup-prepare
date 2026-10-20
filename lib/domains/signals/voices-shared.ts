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
  created_at: string;
};

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
