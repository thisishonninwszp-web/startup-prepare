import { supabaseAdmin } from "@/lib/supabase";
import { askFollowups, draftCaseQuestion, reviewCase } from "@/lib/ai";
import { getPosting } from "./postings";
import {
  isStuckStep,
  MIN_ANSWER_CHARS,
  type CaseDrill,
  type CaseDrillSummary,
  type CaseFollowup,
  type CaseQuestion,
  type CaseReview,
  type CaseStatus,
} from "./case-shared";
import type { JobPosting } from "./shared";

/**
 * 「这家可能会问的 case」：一道题一行，出题 → 交结构（生成追问）→ 答追问（生成复盘）→ 他点卡在哪一步。
 * 每一步只调一次 AI，各在一个请求里（Vercel 60 秒）。
 */

export const MISSING_CASE_MIGRATION =
  "还差一步：迁移 081 没跑。在 Supabase 的 SQL Editor 里执行 supabase/migrations/081_job_case_drills.sql 之后再来。";

function isMissingCaseTable(message: string): boolean {
  return /job_case_drills/.test(message);
}

function toDrill(row: Record<string, unknown>): CaseDrill {
  return {
    id: row.id as string,
    posting_id: row.posting_id as string,
    status: row.status as CaseStatus,
    question: row.question as CaseQuestion,
    answer: (row.answer as string | null) ?? null,
    answered_at: (row.answered_at as string | null) ?? null,
    followups: (row.followups as CaseFollowup[] | null) ?? null,
    review: (row.review as CaseReview | null) ?? null,
    stuck_step: isStuckStep(row.stuck_step) ? row.stuck_step : null,
    started_at: row.started_at as string,
    reviewed_at: (row.reviewed_at as string | null) ?? null,
    created_at: row.created_at as string,
  };
}

async function loadDrill(userId: string, id: string): Promise<CaseDrill> {
  const { data, error } = await supabaseAdmin.from("job_case_drills").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) throw new Error(isMissingCaseTable(error.message) ? MISSING_CASE_MIGRATION : error.message);
  if (!data) throw new Error("这道题找不到了");
  return toDrill(data);
}

async function update(userId: string, id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin.from("job_case_drills").update(patch).eq("user_id", userId).eq("id", id);
  if (error) throw new Error(error.message);
}

/** 按这个岗位出一道（这个岗位出过的不重复），存好，返回 id。计时从这一刻开始（started_at）。 */
export async function createCaseDrill(userId: string, postingId: string): Promise<string> {
  const posting = await getPosting(userId, postingId);
  if (!posting) throw new Error("这个岗位找不到了");
  const { data: prev, error: prevError } = await supabaseAdmin
    .from("job_case_drills")
    .select("question")
    .eq("user_id", userId)
    .eq("posting_id", postingId);
  if (prevError) throw new Error(isMissingCaseTable(prevError.message) ? MISSING_CASE_MIGRATION : prevError.message);
  const previous = (prev ?? []).map((r) => (r.question as CaseQuestion).prompt_ja);
  const question = await draftCaseQuestion(userId, posting, previous);
  const { data, error } = await supabaseAdmin
    .from("job_case_drills")
    .insert({ user_id: userId, posting_id: postingId, question })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function getCaseDrill(
  userId: string,
  id: string
): Promise<{ drill: CaseDrill; posting: JobPosting | null } | null | "missing-schema"> {
  const { data, error } = await supabaseAdmin.from("job_case_drills").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) {
    if (isMissingCaseTable(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  if (!data) return null;
  const drill = toDrill(data);
  return { drill, posting: await getPosting(userId, drill.posting_id) };
}

/** 交结构：生成追问。 */
export async function submitCaseAnswer(userId: string, id: string, input: string): Promise<void> {
  const drill = await loadDrill(userId, id);
  if (drill.status !== "asked") throw new Error("这道已经交过了");
  const answer = input.trim().slice(0, 4000);
  if (answer.length < MIN_ANSWER_CHARS) throw new Error(`至少写 ${MIN_ANSWER_CHARS} 个字的结构，面试官才有东西可问。`);
  const followups = await askFollowups(userId, drill.question, answer);
  await update(userId, id, {
    answer,
    answered_at: new Date().toISOString(),
    followups: followups.map((f) => ({ ...f, a: "" })),
    status: "answered",
  });
}

/** 回答追问：生成复盘。没答的那个留空，复盘里照样写。 */
export async function submitFollowupAnswers(userId: string, id: string, answers: string[]): Promise<void> {
  const drill = await loadDrill(userId, id);
  if (drill.status !== "answered" || !drill.followups || !drill.answer) throw new Error("现在不是回答追问的时候");
  const followups = drill.followups.map((f, i) => ({ ...f, a: (answers[i] ?? "").trim().slice(0, 2000) }));
  if (followups.every((f) => !f.a)) throw new Error("至少回答一个追问。");
  const review = await reviewCase(userId, drill.question, drill.answer, followups);
  await update(userId, id, { followups, review, reviewed_at: new Date().toISOString(), status: "reviewed" });
}

/** 他点的"卡在哪一步"（AI 只提名）。 */
export async function setCaseStuckStep(userId: string, id: string, step: string): Promise<void> {
  if (!isStuckStep(step)) throw new Error("没有这一类");
  const drill = await loadDrill(userId, id);
  if (drill.status !== "reviewed") throw new Error("复盘好了才能点");
  await update(userId, id, { stuck_step: step });
}

/** 练过的题（新的在前）。给 postingId 就只要这个岗位的。表还没建时返回 "missing-schema"。 */
export async function listCaseDrills(userId: string, postingId?: string): Promise<CaseDrillSummary[] | "missing-schema"> {
  let query = supabaseAdmin
    .from("job_case_drills")
    .select("id, posting_id, status, stuck_step, created_at, question")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (postingId) query = query.eq("posting_id", postingId);
  const { data, error } = await query;
  if (error) {
    if (isMissingCaseTable(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    posting_id: r.posting_id as string,
    status: r.status as CaseStatus,
    stuck_step: isStuckStep(r.stuck_step) ? r.stuck_step : null,
    created_at: r.created_at as string,
    prompt_ja: (r.question as CaseQuestion).prompt_ja,
  }));
}
