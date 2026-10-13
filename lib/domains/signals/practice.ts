import { supabaseAdmin } from "@/lib/supabase";
import { critiqueJudgment, extractStepEvidence, planOutcomeQueries, type JudgmentFeedback } from "@/lib/ai";
import { webSearch } from "@/lib/web-search";
import { fetchArticleBody } from "./article";
import { mergeSources } from "./sources";
import { getSignalDetail } from "./analysis";
import { getQuestion } from "./questions";
import {
  CONFIDENCE_LEVELS,
  GENERIC_QUESTION,
  displayQuestion,
  HORIZONS,
  LONG_HORIZONS,
  milestoneQuestion,
  NODE_BET_PREFIX,
  normalizeTags,
  type MissReason,
  type ConfidenceKey,
  type HorizonKey,
  type JudgmentRow,
  type OutcomeEvidence,
  deadlineDays,
  deadlineLabel,
  LONG_JUDGMENT_DAYS,
} from "./practice-shared";

export * from "./practice-shared";

/**
 * 读新闻练判断：先写自己的判断 → 再看 AI 的分析和挑刺 → 到期对账。
 * 判断本身进 predictions（source_type='signal'），和想法、复盘、自我的预测同表同尺；
 * 新闻上下文和 AI 挑刺进 signal_judgments。
 * 数字只有"对了几次 / 错了几次 / 还在等几次"，不算比率、不聚合成分（原则 1）。
 */

type PredictionJoin = {
  due_at: string;
  outcome: "pending" | "hit" | "miss";
  confidence: number | null;
  resolved_at: string | null;
  note: string | null;
};

const SELECT_BASE =
  "id, signal_id, question_id, tags, miss_reason, prediction_id, news_title, news_url, question, judgment, feedback, created_at, predictions!inner(due_at, outcome, confidence, resolved_at, note)";
const SELECT = `outcome_evidence, ${SELECT_BASE}`;
/** 迁移 059 还没跑时退回的列（没有 tags / question_id）。 */
const SELECT_LEGACY =
  "id, signal_id, prediction_id, news_title, news_url, question, judgment, feedback, created_at, predictions!inner(due_at, outcome, confidence, resolved_at, note)";

/** 哪个迁移没跑时会报这些列不存在。 */
const MISSING_COLUMN = /tags|question_id|miss_reason|outcome_evidence/;

/** 先按新列查；064、059 没跑（报列不存在）就一级级退回老列，账本照常能看。 */
async function selectJudgments<T>(
  build: (select: string) => PromiseLike<{ data: T | null; error: { message: string } | null }>
): Promise<T | null> {
  let lastError = "";
  for (const select of [SELECT, SELECT_BASE, SELECT_LEGACY]) {
    const result = await build(select);
    if (!result.error) return result.data;
    lastError = result.error.message;
    if (!MISSING_COLUMN.test(lastError)) break;
  }
  throw new Error(lastError);
}

function flatten(row: Record<string, unknown>): JudgmentRow {
  const p = (Array.isArray(row.predictions) ? row.predictions[0] : row.predictions) as PredictionJoin;
  return {
    id: row.id as string,
    signal_id: (row.signal_id as string | null) ?? null,
    prediction_id: row.prediction_id as string,
    news_title: row.news_title as string,
    news_url: (row.news_url as string | null) ?? null,
    question: row.question as string,
    judgment: row.judgment as string,
    feedback: (row.feedback as JudgmentFeedback | null) ?? null,
    created_at: row.created_at as string,
    due_at: p.due_at,
    outcome: p.outcome,
    confidence: p.confidence,
    resolved_at: p.resolved_at,
    note: p.note,
    tags: (row.tags as string[] | null) ?? [],
    question_id: (row.question_id as string | null) ?? null,
    miss_reason: (row.miss_reason as JudgmentRow["miss_reason"]) ?? null,
    // 064 没跑时这一列不在结果里：undefined（页面就不自动去查，免得查完存不进去），跑过还没查是 null
    outcome_evidence: "outcome_evidence" in row ? ((row.outcome_evidence as OutcomeEvidence | null) ?? null) : undefined,
  };
}

/** 判断是对着什么下的：一条新闻，或者他自己在追的一个问题。挑刺时要用到它的上下文。 */
type JudgmentSubject = {
  signalId: string | null;
  questionId: string | null;
  title: string;
  url: string | null;
  summary: string;
  loadBody: () => Promise<string>;
};

async function loadSubject(userId: string, signalId?: string, questionId?: string): Promise<JudgmentSubject> {
  if (signalId) {
    const detail = await getSignalDetail(signalId);
    if (detail === "missing-schema") throw new Error("迁移 054 还没跑");
    if (!detail) throw new Error("这条已经不在了");
    return {
      signalId,
      questionId: null,
      title: detail.title,
      url: detail.url,
      summary: detail.summary,
      loadBody: async () => detail.excerpt ?? (await fetchArticleBody(detail.url)),
    };
  }
  if (questionId) {
    const q = await getQuestion(userId, questionId);
    if (q === "missing-schema") throw new Error("迁移 059 还没跑");
    if (!q) throw new Error("找不到这个问题");
    const view = q.views[0];
    return {
      signalId: null,
      questionId,
      title: q.question,
      url: null,
      summary: [q.criterion && `怎么才算：${q.criterion}`, view && `他现在的看法：${view.view}`].filter(Boolean).join("；"),
      loadBody: async () => "",
    };
  }
  throw new Error("不知道这个判断是对着哪条新闻或哪个问题下的");
}

export async function submitJudgment(input: {
  userId: string;
  /** 对着一条新闻下的判断（每日练习、详情页、押推论）。 */
  signalId?: string;
  /** 对着自己在追的问题下的判断（问题驱动）。 */
  questionId?: string;
  question: string;
  judgment: string;
  horizon: HorizonKey;
  confidence: ConfidenceKey | null;
  tags?: string[];
  /** 一年以上的判断：半年内就能看到的苗头，填了就自动多押一条半年后对账的。 */
  milestone?: string;
  /** 按题目里写的日子对账（YYYY-MM-DD，"到明年底"就是那年的 12-31）；给了就不按 horizon 算。 */
  dueDate?: string;
}): Promise<JudgmentRow> {
  const judgment = input.judgment.trim();
  if (judgment.length < 4) throw new Error("写一句完整的判断，哪怕很粗糙");
  const subject = await loadSubject(input.userId, input.signalId, input.questionId);

  // 同一个问题只记一次（重复点提交不会押两次）；不同问题可以各押一次
  const question = input.question.trim() || GENERIC_QUESTION;
  const existing = await findJudgment(input.userId, subject, question);
  if (existing) return existing;
  const tags = normalizeTags(input.tags ?? []);

  const byDate = input.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ? deadlineDays(input.dueDate) : null;
  if (byDate !== null && (byDate < 2 || byDate > 5 * 365)) throw new Error("题目里的日子不对，换一个期限");
  const days = byDate ?? HORIZONS[input.horizon].days;
  const horizon = { label: byDate !== null ? `到${deadlineLabel(input.dueDate!)}` : HORIZONS[input.horizon].label, days };
  const dueAt = new Date(Date.now() + days * 86_400_000).toISOString();

  const { data: prediction, error: predictionError } = await supabaseAdmin
    .from("predictions")
    .insert({
      user_id: input.userId,
      source_type: "signal",
      text: judgment,
      due_at: dueAt,
      confidence: input.confidence ? CONFIDENCE_LEVELS[input.confidence].value : null,
    })
    .select("id")
    .single();
  if (predictionError) throw new Error(predictionError.message);

  const base: Record<string, unknown> = {
    user_id: input.userId,
    signal_id: subject.signalId,
    prediction_id: prediction.id,
    news_title: subject.title,
    news_url: subject.url,
    question,
    judgment,
  };
  // 有标签或连着问题才需要 059 的新列；不需要时照老样子插，059 没跑也能记判断
  const needsNewColumns = tags.length > 0 || subject.questionId !== null;
  const { data: row, error } = await supabaseAdmin
    .from("signal_judgments")
    .insert(needsNewColumns ? { ...base, tags, question_id: subject.questionId } : base)
    .select("id")
    .single();
  if (error) {
    if (/tags|question_id/.test(error.message)) throw new Error("迁移 059 还没跑，标签和问题还存不了");
    throw new Error(error.message);
  }

  // 挑刺失败不影响判断本身已经记下；页面上可以重试。
  try {
    const body = await subject.loadBody();
    const feedback = await critiqueJudgment({
      newsTitle: subject.title,
      newsSummary: subject.summary,
      body,
      question: displayQuestion(question),
      judgment,
      horizon: horizon.label,
    });
    await supabaseAdmin.from("signal_judgments").update({ feedback }).eq("id", row.id);
  } catch (e) {
    console.error("judgment critique failed", e);
  }

  const saved = await findJudgment(input.userId, subject, question);
  if (!saved) throw new Error("判断没存上");

  // 长期判断：另押一条半年内能看到的苗头，长期判断中途也有反馈
  const milestone = input.milestone?.trim();
  const isLong = byDate !== null ? byDate > LONG_JUDGMENT_DAYS : LONG_HORIZONS.includes(input.horizon);
  if (milestone && milestone.length >= 4 && isLong) {
    try {
      await submitJudgment({
        userId: input.userId,
        signalId: input.signalId,
        questionId: input.questionId,
        question: milestoneQuestion(question),
        judgment: milestone,
        horizon: "6m",
        confidence: null,
        tags: input.tags,
      });
    } catch (e) {
      console.error("milestone bet failed", e);
    }
  }
  return saved;
}

/** 这条新闻本身的判断（每日练习、详情页那道门）。押推论的那几条不算。 */
export async function getJudgmentForSignal(userId: string, signalId: string): Promise<JudgmentRow | null> {
  const data = await selectJudgments((select) =>
    supabaseAdmin
      .from("signal_judgments")
      .select(select)
      .eq("user_id", userId)
      .eq("signal_id", signalId)
      .not("question", "like", `${NODE_BET_PREFIX}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  );
  return data ? flatten(data as unknown as Record<string, unknown>) : null;
}

async function findJudgment(
  userId: string,
  subject: Pick<JudgmentSubject, "signalId" | "questionId">,
  question: string
): Promise<JudgmentRow | null> {
  // 对着问题下的判断只有 059 之后才有，直接查新列
  const data = await selectJudgments((select) => {
    const q = supabaseAdmin.from("signal_judgments").select(select).eq("user_id", userId).eq("question", question);
    return (subject.questionId ? q.eq("question_id", subject.questionId) : q.eq("signal_id", subject.signalId ?? ""))
      .limit(1)
      .maybeSingle();
  });
  return data ? flatten(data as unknown as Record<string, unknown>) : null;
}

/** 在这条新闻的往下推上押过的那几步。 */
export async function listNodeBets(userId: string, signalId: string): Promise<JudgmentRow[]> {
  const data = await selectJudgments((select) =>
    supabaseAdmin
      .from("signal_judgments")
      .select(select)
      .eq("user_id", userId)
      .eq("signal_id", signalId)
      .like("question", `${NODE_BET_PREFIX}%`)
  );
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(flatten);
}

/** 从这个问题押进账本的判断。 */
export async function listQuestionBets(userId: string, questionId: string): Promise<JudgmentRow[]> {
  for (const select of [SELECT, SELECT_BASE]) {
    const { data, error } = await supabaseAdmin
      .from("signal_judgments")
      .select(select)
      .eq("user_id", userId)
      .eq("question_id", questionId)
      .order("created_at", { ascending: false });
    if (!error) return ((data ?? []) as unknown as Record<string, unknown>[]).map(flatten);
    // 064 没跑就不带证据再查一次；059 没跑就是还没有问题，返回空
    if (/outcome_evidence/.test(error.message)) continue;
    if (/tags|question_id/.test(error.message)) return [];
    throw new Error(error.message);
  }
  return [];
}

export async function listJudgments(userId: string): Promise<JudgmentRow[]> {
  const data = await selectJudgments((select) =>
    supabaseAdmin
      .from("signal_judgments")
      .select(select)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200)
  );
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(flatten);
}

export async function resolveJudgment(
  userId: string,
  predictionId: string,
  outcome: "hit" | "miss",
  note: string,
  missReason?: MissReason
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("predictions")
    .update({ outcome, note: note.trim() || null, resolved_at: new Date().toISOString() })
    .eq("id", predictionId)
    .eq("user_id", userId)
    .eq("source_type", "signal")
    .eq("outcome", "pending");
  if (error) throw new Error(error.message);
  // 看错的原因记在判断那一行；062 没跑就跳过，对账本身已经记下了
  if (outcome === "miss" && missReason) {
    await supabaseAdmin
      .from("signal_judgments")
      .update({ miss_reason: missReason })
      .eq("prediction_id", predictionId)
      .eq("user_id", userId);
  }
}

/** 挑刺当时失败了，补一次。 */
export async function retryJudgmentFeedback(userId: string, judgmentId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("signal_judgments")
    .select("id, signal_id, news_title, question, judgment, created_at, predictions!inner(due_at)")
    .eq("id", judgmentId)
    .eq("user_id", userId)
    .single();
  if (error) throw new Error(error.message);
  const detail = data.signal_id ? await getSignalDetail(data.signal_id as string) : null;
  const usable = detail && detail !== "missing-schema" ? detail : null;
  const p = (Array.isArray(data.predictions) ? data.predictions[0] : data.predictions) as { due_at: string };
  const days = Math.round((new Date(p.due_at).getTime() - new Date(data.created_at as string).getTime()) / 86_400_000);
  const feedback = await critiqueJudgment({
    newsTitle: data.news_title as string,
    newsSummary: usable?.summary ?? "",
    body: usable?.excerpt ?? (usable ? await fetchArticleBody(usable.url) : ""),
    question: data.question as string,
    judgment: data.judgment as string,
    horizon: `${days} 天后`,
  });
  const { error: updateError } = await supabaseAdmin.from("signal_judgments").update({ feedback }).eq("id", judgmentId);
  if (updateError) throw new Error(updateError.message);
}

/** 每个方向搜几篇。 */
const OUTCOME_RESULTS_PER_SIDE = 3;

/**
 * 到期对账之前先上网查"现在实际怎样了"：找"后来怎样了"和"反过来的结果"两个方向，
 * 抽出支持 / 反对他那句判断的事实（原文由代码逐字核对），存在判断那一行。
 * 对错还是他自己点 —— 证据只摆出来，不替他判，也不给"建议判对 / 判错"，免得被它带着走。
 */
export async function checkOutcomeEvidence(userId: string, judgmentId: string): Promise<OutcomeEvidence> {
  const { data, error } = await supabaseAdmin
    .from("signal_judgments")
    .select("id, news_title, question, judgment, created_at, predictions!inner(due_at)")
    .eq("id", judgmentId)
    .eq("user_id", userId)
    .single();
  if (error) throw new Error(error.message);
  const p = (Array.isArray(data.predictions) ? data.predictions[0] : data.predictions) as { due_at: string };
  const madeOn = (data.created_at as string).slice(0, 10);
  const dueOn = p.due_at.slice(0, 10);
  const question = displayQuestion(data.question as string);
  const judgment = data.judgment as string;

  const queries = await planOutcomeQueries({ newsTitle: data.news_title as string, question, judgment, madeOn, dueOn });
  const [found, against] = await Promise.all([
    webSearch(queries.query, OUTCOME_RESULTS_PER_SIDE).catch(() => []),
    queries.counterQuery ? webSearch(queries.counterQuery, OUTCOME_RESULTS_PER_SIDE).catch(() => []) : Promise.resolve([]),
  ]);
  const sources = mergeSources([found, against], OUTCOME_RESULTS_PER_SIDE * 2);
  const claim = `${madeOn} 写下的判断（${dueOn} 到期）：${judgment}\n问题：${question}\n只有 ${madeOn} 以后发生的事才算支持或反对；更早的事只能当背景。`;
  const evidence = await extractStepEvidence(claim, sources);

  const result: OutcomeEvidence = { checked_at: new Date().toISOString(), evidence };
  const { error: saveError } = await supabaseAdmin
    .from("signal_judgments")
    .update({ outcome_evidence: result })
    .eq("id", judgmentId)
    .eq("user_id", userId);
  if (saveError) {
    if (/outcome_evidence/.test(saveError.message)) {
      throw new Error("迁移 064 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/064_judgment_outcome_evidence.sql。");
    }
    throw new Error(saveError.message);
  }
  return result;
}
