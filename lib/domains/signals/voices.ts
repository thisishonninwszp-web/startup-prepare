import { supabaseAdmin } from "@/lib/supabase";
import { extractVoices, judgeVoices, planVoiceSearch, type SearchSource } from "@/lib/ai";
import { webSearch } from "@/lib/web-search";
import { findJapanGap } from "./gaps";
import { gapPlaces, transferKey, type GapSide } from "./gaps-shared";
import { mergeSources } from "./sources";
import { fetchAttention } from "./attention";
import { parseReviewEntries, REVIEWS_PER_APP, type GapVoices, type ReviewSource, type VoiceQuote } from "./voices-shared";

export * from "./voices-shared";

/**
 * 差距清单里的一条，这边有没有人在为它要解决的那件麻烦头疼：点了才查。
 * 去问答网站的提问、吐槽、App Store 差评里找真人原话（原文由代码核对），再请 Jev 判是不是真人在说这件事、
 * 属于抱怨 / 找办法 / 花钱绕路哪一种。不打分、不下"有需求"的结论，只数次数。
 */

const MISSING_MIGRATION = "迁移 075 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/075_signal_gap_voices.sql。";

const RESULTS_PER_QUERY = 3;
/** App Store：搜到前几个 App，每个取几条三星以下的最新评论。 */
const APPS = 2;
const APP_STORE_TIMEOUT_MS = 8_000;

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), APP_STORE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    return res.ok ? await res.json() : null;
  } finally {
    clearTimeout(timer);
  }
}

/** 这边的人现在拿来对付这件事的 App，最新的差评（三星以下）。拿不到就是空的，不耽误网页那一路。 */
async function appStoreReviews(
  term: string,
  country: "jp" | "cn"
): Promise<{ reviews: ReviewSource[]; apps: NonNullable<GapVoices["apps"]> }> {
  if (!term) return { reviews: [], apps: [] };
  try {
    const search = (await fetchJson(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${country}&entity=software&limit=${APPS}`
    )) as { results?: { trackId?: number; trackName?: string; trackViewUrl?: string; userRatingCount?: number }[] } | null;
    const apps = (search?.results ?? []).filter((a) => a.trackId && a.trackName).slice(0, APPS);
    const appUrl = (a: (typeof apps)[number]) => a.trackViewUrl ?? `https://apps.apple.com/${country}/app/id${a.trackId}`;
    const feeds = await Promise.all(
      apps.map((a) =>
        fetchJson(`https://itunes.apple.com/${country}/rss/customerreviews/page=1/id=${a.trackId}/sortby=mostrecent/json`).catch(() => null)
      )
    );
    return {
      reviews: feeds.flatMap((feed, i) => parseReviewEntries(feed, { name: apps[i].trackName as string, url: appUrl(apps[i]) }, REVIEWS_PER_APP)),
      apps: apps
        .filter((a) => typeof a.userRatingCount === "number")
        .map((a) => ({ name: a.trackName as string, ratings: a.userRatingCount as number, url: appUrl(a) })),
    };
  } catch (e) {
    console.error("app store reviews failed", term, e);
    return { reviews: [], apps: [] };
  }
}

export async function analyzeGapVoices(userId: string, signalId: string, side: GapSide): Promise<GapVoices> {
  const gap = await findJapanGap(userId, signalId, side);
  if (!gap) throw new Error("清单里找不到这一条了");
  const { there, here } = gapPlaces(side);
  const plan = await planVoiceSearch({ headline: gap.headline, background: gap.background, hereNow: gap.japan, there, here });
  const [found, store, attention] = await Promise.all([
    Promise.all(plan.queries.map((q) => webSearch(q, RESULTS_PER_QUERY).catch(() => []))),
    appStoreReviews(plan.appTerm, side === "china" ? "cn" : "jp"),
    // 有多少人在关注：日本这边才查（中国大陆不用 Google、YouTube，维基也不是那边的人在看）
    side === "china" ? Promise.resolve(null) : fetchAttention(plan.topic || plan.appTerm, plan.pain).catch(() => null),
  ]);
  const { reviews, apps } = store;
  const pages = mergeSources(found, RESULTS_PER_QUERY * plan.queries.length);
  // 评论不按网址去重（同一个 App 的评论网址一样）
  const sources: (SearchSource & Partial<Pick<ReviewSource, "date" | "rating">>)[] = [...pages, ...reviews];
  const raw = await extractVoices(plan.pain, sources);

  const quoteOf = (r: (typeof raw)[number], kind: VoiceQuote["kind"]): VoiceQuote => {
    const src = sources[r.source - 1];
    const isReview = r.source > pages.length;
    return {
      kind,
      excerpt: r.excerpt,
      url: src.url,
      title: src.title,
      from: isReview ? "review" : "web",
      ...(isReview && src.date ? { date: src.date } : {}),
      ...(isReview && src.rating ? { rating: src.rating } : {}),
    };
  };
  const judged = await judgeVoices(
    plan.pain,
    raw.map((r) => ({ excerpt: r.excerpt, label: r.source > pages.length ? "App Store 评论" : `网页：${sources[r.source - 1].title}` }))
  );
  // 裁判判的类别为准（判"不算"的丢掉）；裁判没调通就照收 AI 分的类、标出来
  const quotes = judged.ok
    ? raw.flatMap((r, i) => (judged.kinds[i] ? [quoteOf(r, judged.kinds[i] as VoiceQuote["kind"])] : []))
    : raw.map((r) => quoteOf(r, r.kind));

  const analysis: GapVoices = {
    pain: plan.pain,
    queries: plan.queries,
    quotes,
    searched: { pages: pages.length, reviews: reviews.length },
    judged: judged.ok,
    ...(apps.length > 0 ? { apps } : {}),
    ...(attention ? { attention } : {}),
    created_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from("signal_gap_voices")
    .upsert({ user_id: userId, signal_id: signalId, side, analysis }, { onConflict: "user_id,signal_id,side" });
  if (error) {
    if (/signal_gap_voices/.test(error.message)) throw new Error(MISSING_MIGRATION);
    throw new Error(error.message);
  }
  return analysis;
}

/** 查过的那几条（键见 transferKey）。表还没建时返回空。 */
export async function loadGapVoices(userId: string): Promise<Map<string, GapVoices>> {
  const { data, error } = await supabaseAdmin.from("signal_gap_voices").select("signal_id, side, analysis").eq("user_id", userId);
  if (error) {
    if (/signal_gap_voices/.test(error.message)) return new Map();
    throw new Error(error.message);
  }
  return new Map((data ?? []).map((r) => [transferKey(r.side as GapSide, r.signal_id as string), r.analysis as GapVoices]));
}
