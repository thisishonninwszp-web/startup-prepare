import { supabaseAdmin } from "@/lib/supabase";
import { critiqueJudgment, type JudgmentFeedback } from "@/lib/ai";
import { fetchArticleBody } from "./article";
import { getSignalDetail } from "./analysis";
import {
  CONFIDENCE_LEVELS,
  GENERIC_QUESTION,
  HORIZONS,
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
  "id, signal_id, prediction_id, news_title, news_url, question, judgment, feedback, created_at, predictions!inner(due_at, outcome, confidence, resolved_at, note)";

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
  };
}

export async function submitJudgment(input: {
  userId: string;
  signalId: string;
  question: string;
  judgment: string;
  horizon: HorizonKey;
  confidence: ConfidenceKey | null;
}): Promise<JudgmentRow> {
  const judgment = input.judgment.trim();
  if (judgment.length < 4) throw new Error("写一句完整的判断，哪怕很粗糙");
  const detail = await getSignalDetail(input.signalId);
  if (detail === "missing-schema") throw new Error("迁移 054 还没跑");
  if (!detail) throw new Error("这条已经不在了");

  const existing = await getJudgmentForSignal(input.userId, input.signalId);
  if (existing) return existing;

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

  const { data: row, error } = await supabaseAdmin
    .from("signal_judgments")
    .insert({
      user_id: input.userId,
      signal_id: input.signalId,
      prediction_id: prediction.id,
      news_title: detail.title,
      news_url: detail.url,
      question: input.question.trim() || GENERIC_QUESTION,
      judgment,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // 挑刺失败不影响判断本身已经记下；页面上可以重试。
  try {
    const body = detail.excerpt ?? (await fetchArticleBody(detail.url));
    const feedback = await critiqueJudgment({
      newsTitle: detail.title,
      newsSummary: detail.summary,
      body,
      question: input.question.trim() || GENERIC_QUESTION,
      judgment,
      horizon: horizon.label,
    });
    await supabaseAdmin.from("signal_judgments").update({ feedback }).eq("id", row.id);
  } catch (e) {
    console.error("judgment critique failed", e);
  }

  const saved = await getJudgmentForSignal(input.userId, input.signalId);
  if (!saved) throw new Error("判断没存上");
  return saved;
}

export async function getJudgmentForSignal(userId: string, signalId: string): Promise<JudgmentRow | null> {
  const { data, error } = await supabaseAdmin
    .from("signal_judgments")
    .select(SELECT)
    .eq("user_id", userId)
    .eq("signal_id", signalId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? flatten(data as Record<string, unknown>) : null;
}

export async function listJudgments(userId: string): Promise<JudgmentRow[]> {
  const { data, error } = await supabaseAdmin
    .from("signal_judgments")
    .select(SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => flatten(r as Record<string, unknown>));
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
