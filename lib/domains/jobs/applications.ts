import { supabaseAdmin } from "@/lib/supabase";
import { getPosting, pickPosting } from "./postings";
import { isMissingJobTables, MISSING_MIGRATION } from "./profile";
import {
  isApplicationStatus,
  type ApplicationEvent,
  type ApplicationStatus,
  type Channel,
  type JobApplication,
  type MarketApp,
  type PostingCategory,
} from "./shared";

function toEvents(value: unknown): ApplicationEvent[] {
  return (Array.isArray(value) ? value : []).flatMap((e) => {
    const x = (e ?? {}) as Record<string, unknown>;
    return isApplicationStatus(x.status) && typeof x.on === "string" ? [{ status: x.status, on: x.on }] : [];
  });
}

export async function getApplicationForPosting(userId: string, postingId: string): Promise<JobApplication | null> {
  const { data, error } = await supabaseAdmin
    .from("job_applications")
    .select("id, posting_id, resume_id, channel, status, events, offered_salary, applied_on")
    .eq("posting_id", postingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingJobTables(error.message)) return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  return {
    id: data.id as string,
    posting_id: data.posting_id as string,
    resume_id: (data.resume_id as string | null) ?? null,
    channel: data.channel as Channel,
    status: data.status as ApplicationStatus,
    events: toEvents(data.events),
    offered_salary: (data.offered_salary as number | null) ?? null,
    applied_on: data.applied_on as string,
  };
}

/** 记一次投递（一个岗位只记一次）。还没点"要这个"的候选，顺手变成要了的。 */
export async function recordApplication(
  userId: string,
  input: { postingId: string; resumeId: string | null; channel: Channel; appliedOn: string }
): Promise<void> {
  const posting = await getPosting(userId, input.postingId);
  if (!posting) throw new Error("找不到这个岗位");
  if (!posting.picked_at) await pickPosting(userId, posting.id);
  const { error } = await supabaseAdmin.from("job_applications").insert({
    user_id: userId,
    posting_id: input.postingId,
    resume_id: input.resumeId,
    channel: input.channel,
    status: "applied",
    events: [],
    applied_on: input.appliedOn,
  });
  if (error) {
    if (error.code === "23505") throw new Error("这个岗位已经记过投递了。");
    throw new Error(isMissingJobTables(error.message) ? MISSING_MIGRATION : error.message);
  }
}

/** 改状态：每次变化记下日期（"没回音"由代码按最后一次变化的日期算）。 */
export async function setApplicationStatus(
  userId: string,
  input: { id: string; status: ApplicationStatus; offeredSalary: number | null; today: string }
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("job_applications")
    .select("status, events, offered_salary")
    .eq("id", input.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("找不到这条投递");
  const events = toEvents(data.events);
  const next = data.status === input.status ? events : [...events, { status: input.status, on: input.today }];
  const { error: updateError } = await supabaseAdmin
    .from("job_applications")
    .update({
      status: input.status,
      events: next,
      offered_salary: input.offeredSalary ?? (data.offered_salary as number | null) ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("user_id", userId);
  if (updateError) throw new Error(updateError.message);
}

/** "市场怎么看我"要用的：每条投递连同岗位的公司、职位、类别。 */
export async function listMarketApps(userId: string): Promise<MarketApp[]> {
  const { data, error } = await supabaseAdmin
    .from("job_applications")
    .select("posting_id, status, events, applied_on, offered_salary, job_postings(company_name, title, category)")
    .eq("user_id", userId);
  if (error) {
    if (isMissingJobTables(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => {
    const joined = r.job_postings as unknown;
    const p = (Array.isArray(joined) ? joined[0] : joined) as { company_name?: string; title?: string; category?: PostingCategory } | null;
    return {
      posting_id: r.posting_id as string,
      company_name: p?.company_name ?? "",
      title: p?.title ?? "",
      category: p?.category ?? "none",
      status: r.status as ApplicationStatus,
      events: toEvents(r.events),
      applied_on: r.applied_on as string,
      offered_salary: (r.offered_salary as number | null) ?? null,
    };
  });
}

/** 从"市场怎么看我"押一条进判断账本（source_type=self），到期他对着次数对账。 */
export async function createMarketBet(userId: string, input: { text: string; dueOn: string; confidence: number }): Promise<void> {
  const text = input.text.trim();
  if (text.length < 6) throw new Error("写清楚押的是什么，比如「数据分析类再投 5 家，至少 1 家约面试」。");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueOn)) throw new Error("到期日格式不对");
  const confidence = Math.round(input.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) throw new Error("把握度要在 0–100 之间");
  const { error } = await supabaseAdmin.from("predictions").insert({
    user_id: userId,
    source_type: "self",
    idea_id: null,
    period_id: null,
    hypothesis_id: null,
    text: `【求职】${text}`,
    due_at: `${input.dueOn}T23:59:59+09:00`,
    confidence,
  });
  if (error) throw new Error(error.message);
}
