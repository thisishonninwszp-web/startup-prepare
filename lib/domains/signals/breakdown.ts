import { supabaseAdmin } from "@/lib/supabase";
import { planBreakdown, readBreakdownNow } from "@/lib/ai";
import { webSearch } from "@/lib/web-search";
import { getSignalDetail } from "./analysis";
import { fetchArticleBody } from "./article";
import type { BriefPracticeRow } from "./brief";
import { anchorOf, boardSections, loadForecastBoard } from "./forecast";
import { breakdownQueue, LEANS, questionMaterial, type Breakdown, type Lean } from "./breakdown-shared";

export * from "./breakdown-shared";

/**
 * 拆解卡（「从这几样想起」）：这件事由哪几个因素决定、怎么起作用、现在怎样（上网查、原文核对）、去哪看。
 * 原来要他点「先拆一拆」才生成；经用户同意（2026-10-24：光让他做题、连思路都没有，等于纯猜），改成后台先拆好，
 * 清单页和网站上直接摆在题目下面、AI 的判断前面。每日练习存在那天「今天的世界」那一份的 practice 里（不加表），
 * 预测题存在 forecast_questions.breakdown（迁移 101）。
 */

/** 每个因素搜几篇资料。 */
const RESULTS_PER_FACTOR = 3;

/** 那一天「今天的世界」那一份里的练习题（拆解卡、AI 先判都存在它上面）。 */
export async function loadBriefPractice(userId: string, date: string): Promise<BriefPracticeRow> {
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

/** 改那天练习的某几样：写之前重读最新的再合并（拆解卡和 AI 先判可能前后脚写，免得互相冲掉）。 */
export async function patchBriefPractice(userId: string, date: string, patch: Partial<BriefPracticeRow>): Promise<void> {
  const fresh = await loadBriefPractice(userId, date);
  const { error } = await supabaseAdmin
    .from("signal_briefs")
    .update({ practice: { ...fresh, ...patch } })
    .eq("user_id", userId)
    .eq("brief_date", date)
    .eq("kind", "news");
  if (error) throw new Error(error.message);
}

/** 拆一道题：列因素 → 每个因素各搜一次 → 写现在怎样（原文核对）。二三十秒。 */
async function buildBreakdown(question: string, material: string[], today: string): Promise<Breakdown> {
  const plan = await planBreakdown({ material, question, today });
  const sources = await Promise.all(plan.map((f) => webSearch(f.query, RESULTS_PER_FACTOR).catch(() => [])));
  const readings = await readBreakdownNow(
    plan.map((item, i) => ({ item, sources: sources[i] })),
    today
  ).catch((e) => {
    console.error("breakdown reading failed", e);
    return plan.map(() => ({ now: "没查到现在的情况。", basis: [] }));
  });
  return {
    factors: plan.map((f, i) => ({ factor: f.factor, mechanism: f.mechanism, indicator: f.indicator, ...readings[i] })),
    generated_at: new Date().toISOString(),
  };
}

/** 拆过就直接返回；没拆就现在拆（二三十秒）。 */
export async function ensurePracticeBreakdown(userId: string, date: string): Promise<Breakdown> {
  const practice = await loadBriefPractice(userId, date);
  if (practice.breakdown) return practice.breakdown;

  const detail = await getSignalDetail(practice.signal_id);
  if (detail === "missing-schema") throw new Error("迁移 054 还没跑");
  if (!detail) throw new Error("这条新闻已经不在了");
  const body = detail.excerpt ?? (await fetchArticleBody(detail.url).catch(() => ""));

  const breakdown = await buildBreakdown(
    practice.question,
    [`新闻标题：${detail.title}`, `新闻简介：${detail.summary || "（没有）"}`, `正文节选：${body ? body.slice(0, 1500) : "（拿不到正文）"}`],
    date
  );
  await patchBriefPractice(userId, date, { breakdown });
  return breakdown;
}

// ── 预测题 ───────────────────────────────────────────────────────────────

const noColumn = (message: string) => /breakdown|does not exist|schema cache/.test(message);

/** 这几道预测题拆过的（迁移 101 没跑就是空的，页面照旧只摆题目）。 */
export async function loadQuestionBreakdowns(ids: string[]): Promise<Map<string, Breakdown>> {
  const out = new Map<string, Breakdown>();
  if (ids.length === 0) return out;
  const { data, error } = await supabaseAdmin.from("forecast_questions").select("id, breakdown").in("id", ids).not("breakdown", "is", null);
  if (error) {
    if (!noColumn(error.message)) console.error("question breakdowns", error.message);
    return out;
  }
  for (const r of (data ?? []) as { id: string; breakdown: Breakdown }[]) if (r.breakdown?.factors?.length) out.set(r.id, r.breakdown);
  return out;
}

/** 清单一天放 3 道预测题，后台多拆几道备着。 */
const QUESTION_BREAKDOWN_AHEAD = 6;

/**
 * 后台（jobs 的 factors 一步）：给等他判断的预测题先拆好，顺序和一分钟清单一样（先判题在前）；按时间预算做，
 * 开始下一道前看用了多久，过了 startBeforeMs 就不开始。题库是主账号那一池的，朋友读同一份。
 */
export async function breakdownWaitingQuestions(userId: string, today: string, startBeforeMs: number): Promise<{ did: number; remaining: number; note?: string }> {
  const started = Date.now();
  // 迁移 101 没跑就先停，免得拆完了存不进去、白花 AI 的钱
  const probe = await supabaseAdmin.from("forecast_questions").select("breakdown").limit(1);
  if (probe.error) return { did: 0, remaining: 0, note: noColumn(probe.error.message) ? "迁移 101 还没跑" : probe.error.message };
  const board = await loadForecastBoard(userId);
  if (board === "missing-schema") return { did: 0, remaining: 0 };
  const s = boardSections(board, today);
  const waiting = s.toForecast;
  const done = new Set((await loadQuestionBreakdowns(waiting.map((q) => q.id))).keys());
  const queue = breakdownQueue(waiting, s.blind, (q) => anchorOf(q, board.forecasts) !== null, done, QUESTION_BREAKDOWN_AHEAD);
  let did = 0;
  const notes: string[] = [];
  for (const q of queue) {
    if (Date.now() - started > startBeforeMs) break;
    try {
      const breakdown = await buildBreakdown(q.title, questionMaterial(q), today);
      const { error } = await supabaseAdmin.from("forecast_questions").update({ breakdown }).eq("id", q.id);
      if (error) {
        if (noColumn(error.message)) return { did, remaining: 0, note: "迁移 101 还没跑" };
        throw new Error(error.message);
      }
      did += 1;
    } catch (e) {
      // 一道拆不出来不拦着下一道（因素太少、写了方向都会被校验打回）
      notes.push(e instanceof Error ? e.message.slice(0, 60) : String(e));
    }
  }
  return { did, remaining: queue.length - did - notes.length, note: notes.join("；") || undefined };
}

/** 记下他对每个因素点的偏向（和 factors 一一对应）。 */
export async function saveBreakdownLeans(userId: string, date: string, leans: (Lean | null)[]): Promise<void> {
  const practice = await loadBriefPractice(userId, date);
  if (!practice.breakdown) throw new Error("还没拆过");
  const clean = practice.breakdown.factors.map((_, i) => {
    const l = leans[i];
    return l && l in LEANS ? l : null;
  });
  await patchBriefPractice(userId, date, { breakdown: { ...practice.breakdown, leans: clean } });
}
