import { supabaseAdmin } from "@/lib/supabase";
import { recordApplication } from "./applications";
import { listConfirmedEntries } from "./base";
import { getPosting } from "./postings";
import { getJobProfile, MISSING_MIGRATION } from "./profile";
import { getResume, latestResume, tailorForPosting } from "./resumes";
import { tokyoDate, type JobPosting, type JobProfile, type JobResume } from "./shared";

/**
 * 官网填表助手的数据库这一侧。网页上点「去填表」只是把岗位记成 requested；
 * 真正开浏览器、填表的是他电脑上的 scripts/jobs-helper.ts（service role，按岗位的 user_id 干活）。
 * 填表状态单独读写（不放进岗位的列表查询里）：迁移 079 没跑时，岗位的其他功能照常用。
 */

export type FillStatus = "requested" | "filling" | "waiting" | "done" | "failed";
export type FillState = { status: FillStatus | null; note: string | null; requestedAt: string | null };

export const MISSING_FILL_MIGRATION =
  "还差一步：迁移 079 没跑。在 Supabase 的 SQL Editor 里执行 supabase/migrations/079_jobs_fill.sql（要先跑 078）之后再来。";

function isMissingFillColumns(message: string): boolean {
  return /fill_status|fill_note|fill_requested_at/.test(message);
}

export async function getFillState(userId: string, postingId: string): Promise<FillState | "missing-schema"> {
  const { data, error } = await supabaseAdmin
    .from("job_postings")
    .select("fill_status, fill_note, fill_requested_at")
    .eq("id", postingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingFillColumns(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  return {
    status: (data?.fill_status as FillStatus | null) ?? null,
    note: (data?.fill_note as string | null) ?? null,
    requestedAt: (data?.fill_requested_at as string | null) ?? null,
  };
}

/** 网页上点「去填表」：记成 requested，等他电脑上的填表助手来取。 */
export async function requestFill(userId: string, postingId: string): Promise<void> {
  const posting = await getPosting(userId, postingId);
  if (!posting) throw new Error("找不到这个岗位");
  if (!posting.url) throw new Error("这个岗位没有网址（是贴文字加进来的），没有页面可填。");
  const { error } = await supabaseAdmin
    .from("job_postings")
    .update({ fill_status: "requested", fill_requested_at: new Date().toISOString(), fill_note: null })
    .eq("id", postingId)
    .eq("user_id", userId);
  if (error) throw new Error(isMissingFillColumns(error.message) ? MISSING_FILL_MIGRATION : error.message);
}

// ---- 下面这些只给填表助手用（service role，不经过登录态）---------------------------------

/** 取走所有等着填的岗位，同时改成 filling（只改还是 requested 的，免得两个助手抢同一个）。 */
export async function claimFillRequests(): Promise<{ id: string; userId: string }[]> {
  const { data, error } = await supabaseAdmin
    .from("job_postings")
    .update({ fill_status: "filling" })
    .eq("fill_status", "requested")
    .select("id, user_id");
  if (error) throw new Error(isMissingFillColumns(error.message) ? MISSING_FILL_MIGRATION : error.message);
  return (data ?? []).map((r) => ({ id: r.id as string, userId: r.user_id as string }));
}

export async function setFillStatus(postingId: string, status: FillStatus, note: string | null = null): Promise<void> {
  const { error } = await supabaseAdmin.from("job_postings").update({ fill_status: status, fill_note: note }).eq("id", postingId);
  if (error) throw new Error(error.message);
}

export type FillJob = { posting: JobPosting; profile: JobProfile; resume: JobResume | null; resumeNote: string | null };

/** 填一个岗位要的东西：岗位、条件和个人信息、最新一版简历（还没有、底稿里又有确认过的经历时，先写一版）。 */
export async function loadFillJob(userId: string, postingId: string): Promise<FillJob> {
  const [posting, profile] = await Promise.all([getPosting(userId, postingId), getJobProfile(userId)]);
  if (!posting) throw new Error("找不到这个岗位");
  if (profile === "missing-schema") throw new Error(MISSING_MIGRATION);
  if (!profile) throw new Error("条件页还没填，没有个人信息可填。");
  let resume = await latestResume(userId, postingId);
  let resumeNote: string | null = null;
  if (!resume) {
    const entries = await listConfirmedEntries(userId);
    if (entries.length === 0) {
      resumeNote = "底稿里还没有确认过的经历，志望動機、自己PR 和職務経歴書都填不了";
    } else {
      try {
        resume = await getResume(userId, await tailorForPosting(userId, postingId));
      } catch (e) {
        resumeNote = `没写成这家的简历：${e instanceof Error ? e.message : String(e)}`;
      }
    }
  }
  return { posting, profile, resume, resumeNote };
}

/** 看到提交成功的页面：记一条投递（渠道：公司官网），已经记过就算了。 */
export async function recordSiteApplication(userId: string, postingId: string, resumeId: string | null): Promise<void> {
  try {
    await recordApplication(userId, { postingId, resumeId, channel: "site", appliedOn: tokyoDate() });
  } catch (e) {
    if (!(e instanceof Error && /已经记过投递/.test(e.message))) throw e;
  }
}
