import { supabaseAdmin } from "@/lib/supabase";
import {
  analyzeKeyFactors,
  expandUserAnalog,
  extractQuestionEvidence,
  planQuestionResearch,
  type KeyFactor,
  type QuestionInput,
  type StepEvidence,
} from "@/lib/ai";
import { webSearch } from "@/lib/web-search";
import { researchHistory, verifyAnalog } from "./history";
import type { BriefItem } from "./brief";
import {
  markFresh,
  MAX_USER_ANALOGS,
  relatedReportItems,
  type QuestionResearch,
  type RelatedReportItem,
  type QuestionView,
  type SignalQuestion,
  type SubQuestionResult,
} from "./questions-shared";

export * from "./questions-shared";

/**
 * 问题驱动：现在是报告问你，这里是你问报告。
 * 他手上常驻几个自己的问题，AI 围绕这几个问题查证据；他隔几天看一次，更新自己的看法。
 */

const MAX_QUESTION_LENGTH = 200;
const MAX_TEXT_LENGTH = 500;
/** 每个小问题正反两个方向各搜几条。 */
const SEARCH_RESULTS_PER_SIDE = 3;

const QUESTION_COLUMNS = "id, question, criterion, research, researched_at, created_at";

/** 迁移 059 没跑时返回 "missing-schema"。 */
export async function listQuestions(userId: string): Promise<SignalQuestion[] | "missing-schema"> {
  const { data, error } = await supabaseAdmin
    .from("signal_questions")
    .select(QUESTION_COLUMNS)
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    if (/signal_questions/.test(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  const ids = (data ?? []).map((q) => q.id as string);
  const views = ids.length > 0 ? await loadViews(ids) : new Map<string, QuestionView[]>();
  return (data ?? []).map((q) => toQuestion(q, views.get(q.id as string) ?? []));
}

export async function getQuestion(userId: string, id: string): Promise<SignalQuestion | null | "missing-schema"> {
  const { data, error } = await supabaseAdmin
    .from("signal_questions")
    .select(QUESTION_COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) {
    if (/signal_questions/.test(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  if (!data) return null;
  const views = await loadViews([id]);
  return toQuestion(data, views.get(id) ?? []);
}

async function loadViews(questionIds: string[]): Promise<Map<string, QuestionView[]>> {
  const { data, error } = await supabaseAdmin
    .from("signal_question_views")
    .select("id, question_id, view, reason, created_at")
    .in("question_id", questionIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const map = new Map<string, QuestionView[]>();
  for (const r of data ?? []) {
    const list = map.get(r.question_id as string) ?? [];
    list.push({ id: r.id as string, view: r.view as string, reason: r.reason as string, created_at: r.created_at as string });
    map.set(r.question_id as string, list);
  }
  return map;
}

function toQuestion(row: Record<string, unknown>, views: QuestionView[]): SignalQuestion {
  return {
    id: row.id as string,
    question: row.question as string,
    criterion: (row.criterion as string) ?? "",
    research: (row.research as QuestionResearch | null) ?? null,
    researched_at: (row.researched_at as string | null) ?? null,
    created_at: row.created_at as string,
    views,
  };
}

export async function createQuestion(userId: string, question: string, criterion: string): Promise<string> {
  const q = question.trim().slice(0, MAX_QUESTION_LENGTH);
  if (q.length < 4) throw new Error("写一个完整的问题");
  const { data, error } = await supabaseAdmin
    .from("signal_questions")
    .insert({ user_id: userId, question: q, criterion: criterion.trim().slice(0, MAX_TEXT_LENGTH) })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function updateCriterion(userId: string, id: string, criterion: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("signal_questions")
    .update({ criterion: criterion.trim().slice(0, MAX_TEXT_LENGTH) })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** 写下或更新看法：只增不改，旧的看法留着。 */
export async function addView(userId: string, questionId: string, view: string, reason: string): Promise<void> {
  const v = view.trim().slice(0, MAX_TEXT_LENGTH);
  if (v.length < 2) throw new Error("写一句你的看法");
  const question = await getQuestion(userId, questionId);
  if (!question || question === "missing-schema") throw new Error("找不到这个问题");
  if (question.views[0]?.view === v) throw new Error("和现在的看法一样，没有改");
  const { error } = await supabaseAdmin.from("signal_question_views").insert({
    question_id: questionId,
    user_id: userId,
    view: v,
    reason: reason.trim().slice(0, MAX_TEXT_LENGTH),
  });
  if (error) throw new Error(error.message);
}

/** 不追了：收起来，不删（押进账本的判断还连着它）。 */
export async function archiveQuestion(userId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("signal_questions")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

async function searchSide(query: string) {
  if (!query) return [];
  try {
    return (await webSearch(query, SEARCH_RESULTS_PER_SIDE)).filter((r) => r.url && r.content);
  } catch {
    return [];
  }
}

/** 一个小问题：正反两个方向各搜一次 → 抽事实（来源和摘录由代码核对）。失败就是空证据，不拖垮整轮。 */
async function researchSubQuestion(
  plan: { question: string; query: string; counterQuery: string },
  view: string
): Promise<SubQuestionResult> {
  try {
    const [pro, con] = await Promise.all([searchSide(plan.query), searchSide(plan.counterQuery)]);
    const seen = new Set<string>();
    const sources = [...pro, ...con].filter((r) => !seen.has(r.url) && seen.add(r.url));
    return { question: plan.question, evidence: await extractQuestionEvidence(plan.question, view, sources) };
  } catch (e) {
    console.error("sub-question research failed", e);
    return { question: plan.question, evidence: [] };
  }
}

/**
 * 查一轮：拆小问题 → 每个小问题正反各搜、抽事实 → 根据事实列关键因素；历史参照同时跑。
 * 整轮覆盖上一轮。查的时候照着他现在的看法分支持/反对。
 */
export async function researchQuestion(userId: string, id: string): Promise<QuestionResearch> {
  const question = await getQuestion(userId, id);
  if (question === "missing-schema") throw new Error("迁移 059 还没跑");
  if (!question) throw new Error("找不到这个问题");
  const view = question.views[0]?.view ?? "";
  const input: QuestionInput = { question: question.question, criterion: question.criterion, view };

  const [subQuestions, history] = await Promise.all([
    (async () => {
      const plan = await planQuestionResearch(input);
      return Promise.all(plan.map((p) => researchSubQuestion(p, view)));
    })(),
    researchHistory({
      title: question.question,
      summary: [question.criterion && `怎么才算：${question.criterion}`, view && `他现在的看法：${view}`]
        .filter(Boolean)
        .join("；"),
      body: "",
      subject: "question",
    }).catch((e) => {
      console.error("question history failed", e);
      return null;
    }),
  ]);

  const facts = subQuestions.flatMap((s) => s.evidence).map((e: StepEvidence) => e.fact);
  let keyFactors: KeyFactor[] = [];
  let whyNow = "";
  try {
    ({ keyFactors, whyNow } = await analyzeKeyFactors({ ...input, facts }));
  } catch (e) {
    console.error("key factors failed", e);
  }

  // 他自己想到的类比不是这一轮查出来的，原样带过去；上一轮没有的证据标成新的
  const fresh = markFresh(subQuestions, question.research);
  const research: QuestionResearch = {
    subQuestions: fresh.subQuestions,
    keyFactors,
    history,
    basedOnView: view,
    userAnalogs: question.research?.userAnalogs,
    freshCount: fresh.freshCount,
    ...(whyNow ? { whyNow } : {}),
  };
  const { error } = await supabaseAdmin
    .from("signal_questions")
    .update({ research, researched_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return research;
}

/**
 * 他自己想到的类比：AI 展开成一条完整的参照（只展开他说的那件事），再走同一套上网核实。
 * 要先查过一轮（类比挂在这一轮的结果上）。
 */
export async function addUserAnalog(userId: string, id: string, userText: string): Promise<void> {
  const text = userText.trim().slice(0, 200);
  if (text.length < 2) throw new Error("写一下是哪一次的事");
  const question = await getQuestion(userId, id);
  if (question === "missing-schema") throw new Error("迁移 059 还没跑");
  if (!question) throw new Error("找不到这个问题");
  if (!question.research) throw new Error("先让 AI 查一轮，再加自己的类比");
  const existing = question.research.userAnalogs ?? [];
  if (existing.length >= MAX_USER_ANALOGS) throw new Error(`最多放 ${MAX_USER_ANALOGS} 条自己的类比`);

  const analog = await verifyAnalog(await expandUserAnalog({ question: question.question, userText: text }));
  const research: QuestionResearch = { ...question.research, userAnalogs: [...existing, analog] };
  const { error } = await supabaseAdmin
    .from("signal_questions")
    .update({ research })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** 删掉一条自己想到的类比。 */
export async function removeUserAnalog(userId: string, id: string, index: number): Promise<void> {
  const question = await getQuestion(userId, id);
  if (!question || question === "missing-schema" || !question.research) throw new Error("找不到这个问题");
  const userAnalogs = (question.research.userAnalogs ?? []).filter((_, i) => i !== index);
  const { error } = await supabaseAdmin
    .from("signal_questions")
    .update({ research: { ...question.research, userAnalogs } })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** 往回翻多少天的报告，找"跟这个问题有关"的条目。 */
const RELATED_LOOKBACK_DAYS = 60;

/** 最近的每日报告里，标过跟这个问题有关的那几条。 */
export async function listRelatedReports(userId: string, questionId: string): Promise<RelatedReportItem[]> {
  const since = new Date(Date.now() - RELATED_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from("signal_briefs")
    .select("brief_date, items")
    .eq("user_id", userId)
    .gte("brief_date", since);
  if (error) throw new Error(error.message);
  return relatedReportItems(
    // 周报、月报那几行的 items 不是报告条目；不是数组的一律当空
    (data ?? []).map((r) => ({ brief_date: r.brief_date as string, items: Array.isArray(r.items) ? (r.items as BriefItem[]) : [] })),
    questionId
  );
}

/** 每天自动查：上次查过不到这么久的跳过。 */
const DAILY_MIN_GAP_HOURS = 20;
/** cron 只有 60 秒，一次查一轮要二三十秒：同时查几个，留出余量。 */
const DAILY_CONCURRENCY = 2;

/**
 * 每天早上给所有在追的问题各查一轮（最久没查的先查）。查不完的明天接着查。
 * 失败的只记下来，不影响别的问题。
 */
export async function runDailyQuestionResearch(): Promise<{ researched: number; failed: string[] }> {
  const cutoff = new Date(Date.now() - DAILY_MIN_GAP_HOURS * 3_600_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("signal_questions")
    .select("id, user_id, researched_at")
    .is("archived_at", null)
    .or(`researched_at.is.null,researched_at.lt.${cutoff}`)
    .order("researched_at", { ascending: true, nullsFirst: true })
    .limit(DAILY_CONCURRENCY);
  // 059 没跑就当没有问题
  if (error) return { researched: 0, failed: /signal_questions/.test(error.message) ? [] : [error.message] };
  const failed: string[] = [];
  let researched = 0;
  await Promise.all(
    (data ?? []).map(async (q) => {
      try {
        await researchQuestion(q.user_id as string, q.id as string);
        researched += 1;
      } catch (e) {
        failed.push(`${q.id}：${e instanceof Error ? e.message : String(e)}`);
      }
    })
  );
  return { researched, failed };
}
