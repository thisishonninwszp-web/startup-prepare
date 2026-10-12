import { supabaseAdmin } from "@/lib/supabase";
import { critiqueJudgment, type JudgmentFeedback } from "@/lib/ai";
import { fetchArticleBody } from "./article";
import { getSignalDetail } from "./analysis";
import { getQuestion } from "./questions";
import {
  CONFIDENCE_LEVELS,
  GENERIC_QUESTION,
  displayQuestion,
  HORIZONS,
  NODE_BET_PREFIX,
  normalizeTags,
  type ConfidenceKey,
  type HorizonKey,
  type JudgmentRow,
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

const SELECT =
  "id, signal_id, question_id, tags, prediction_id, news_title, news_url, question, judgment, feedback, created_at, predictions!inner(due_at, outcome, confidence, resolved_at, note)";
/** 迁移 059 还没跑时退回的列（没有 tags / question_id）。 */
const SELECT_LEGACY =
  "id, signal_id, prediction_id, news_title, news_url, question, judgment, feedback, created_at, predictions!inner(due_at, outcome, confidence, resolved_at, note)";

/** 先按新列查；059 没跑（报 tags / question_id 不存在）就退回老列，账本照常能看。 */
async function selectJudgments<T>(
  build: (select: string) => PromiseLike<{ data: T | null; error: { message: string } | null }>
): Promise<T | null> {
  const first = await build(SELECT);
  if (!first.error) return first.data;
  if (!/tags|question_id/.test(first.error.message)) throw new Error(first.error.message);
  const legacy = await build(SELECT_LEGACY);
  if (legacy.error) throw new Error(legacy.error.message);
  return legacy.data;
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
}): Promise<JudgmentRow> {
  const judgment = input.judgment.trim();
  if (judgment.length < 4) throw new Error("写一句完整的判断，哪怕很粗糙");
  const subject = await loadSubject(input.userId, input.signalId, input.questionId);

  // 同一个问题只记一次（重复点提交不会押两次）；不同问题可以各押一次
  const question = input.question.trim() || GENERIC_QUESTION;
  const existing = await findJudgment(input.userId, subject, question);
  if (existing) return existing;
  const tags = normalizeTags(input.tags ?? []);

  const horizon = HORIZONS[input.horizon];
  const dueAt = new Date(Date.now() + horizon.days * 86_400_000).toISOString();

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
  const { data, error } = await supabaseAdmin
    .from("signal_judgments")
    .select(SELECT)
    .eq("user_id", userId)
    .eq("question_id", questionId)
    .order("created_at", { ascending: false });
  if (error) {
    if (/tags|question_id/.test(error.message)) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(flatten);
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
  note: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("predictions")
    .update({ outcome, note: note.trim() || null, resolved_at: new Date().toISOString() })
    .eq("id", predictionId)
    .eq("user_id", userId)
    .eq("source_type", "signal")
    .eq("outcome", "pending");
  if (error) throw new Error(error.message);
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
