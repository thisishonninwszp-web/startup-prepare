import { supabaseAdmin } from "@/lib/supabase";
import { planBreakdown, readBreakdownNow } from "@/lib/ai";
import { webSearch } from "@/lib/web-search";
import { getSignalDetail } from "./analysis";
import { fetchArticleBody } from "./article";
import type { BriefPracticeRow } from "./brief";
import { LEANS, type Breakdown, type Lean } from "./breakdown-shared";

export * from "./breakdown-shared";

/**
 * 每日练习的拆解卡：这件事由哪几个因素决定、怎么起作用、现在怎样（上网查、原文核对）、去哪看。
 * 他点了"先拆一拆"才生成，存在那天"今天的世界"那一份的 practice 里（不加表），再打开就直接用。
 */

/** 每个因素搜几篇资料。 */
const RESULTS_PER_FACTOR = 3;

async function loadPractice(userId: string, date: string): Promise<BriefPracticeRow> {
  const { data, error } = await supabaseAdmin
    .from("signal_briefs")
    .select("practice")
    .eq("user_id", userId)
    .eq("brief_date", date)
    .eq("kind", "news")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const practice = (data?.practice as BriefPracticeRow | null) ?? null;
  if (!practice) throw new Error("这一天没有练习题");
  return practice;
}

async function savePractice(userId: string, date: string, practice: BriefPracticeRow): Promise<void> {
  const { error } = await supabaseAdmin
    .from("signal_briefs")
    .update({ practice })
    .eq("user_id", userId)
    .eq("brief_date", date)
    .eq("kind", "news");
  if (error) throw new Error(error.message);
}

/** 拆过就直接返回；没拆就现在拆（二三十秒）。 */
export async function ensurePracticeBreakdown(userId: string, date: string): Promise<Breakdown> {
  const practice = await loadPractice(userId, date);
  if (practice.breakdown) return practice.breakdown;

  const detail = await getSignalDetail(practice.signal_id);
  if (detail === "missing-schema") throw new Error("迁移 054 还没跑");
  if (!detail) throw new Error("这条新闻已经不在了");
  const body = detail.excerpt ?? (await fetchArticleBody(detail.url).catch(() => ""));

  const plan = await planBreakdown({ newsTitle: detail.title, newsSummary: detail.summary, body, question: practice.question, today: date });
  const sources = await Promise.all(plan.map((f) => webSearch(f.query, RESULTS_PER_FACTOR).catch(() => [])));
  const readings = await readBreakdownNow(
    plan.map((item, i) => ({ item, sources: sources[i] })),
    date
  ).catch((e) => {
    console.error("breakdown reading failed", e);
    return plan.map(() => ({ now: "没查到现在的情况。", basis: [] }));
  });

  const breakdown: Breakdown = {
    factors: plan.map((f, i) => ({ factor: f.factor, mechanism: f.mechanism, indicator: f.indicator, ...readings[i] })),
    generated_at: new Date().toISOString(),
  };
  await savePractice(userId, date, { ...practice, breakdown });
  return breakdown;
}

/** 记下他对每个因素点的偏向（和 factors 一一对应）。 */
export async function saveBreakdownLeans(userId: string, date: string, leans: (Lean | null)[]): Promise<void> {
  const practice = await loadPractice(userId, date);
  if (!practice.breakdown) throw new Error("还没拆过");
  const clean = practice.breakdown.factors.map((_, i) => {
    const l = leans[i];
    return l && l in LEANS ? l : null;
  });
  await savePractice(userId, date, { ...practice, breakdown: { ...practice.breakdown, leans: clean } });
}
