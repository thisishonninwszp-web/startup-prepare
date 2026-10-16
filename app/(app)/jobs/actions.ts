"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AiGatewayError, humanAiErrorMessage } from "@/lib/ai-gateway";
import { createMarketBet, recordApplication, setApplicationStatus } from "@/lib/domains/jobs/applications";
import { confirmEntry, deleteEntry, draftEntry } from "@/lib/domains/jobs/base";
import { createPosting, createPostingFromMaterial, dropCandidate, pickPosting, readJobPage, refreshMatch } from "@/lib/domains/jobs/postings";
import { saveJobProfile } from "@/lib/domains/jobs/profile";
import { saveResumeEdit, tailorForPosting } from "@/lib/domains/jobs/resumes";
import { runDailyJobSearch } from "@/lib/domains/jobs/search";
import {
  isApplicationStatus,
  isCareerTopic,
  isChannel,
  normalizeUrl,
  parseProfileForm,
  RESUME_SECTION_KEYS,
  tokyoDate,
  type DroppedSentence,
  type ResumeSectionKey,
} from "@/lib/domains/jobs/shared";

type Fail = { ok: false; message: string };
type Result<T extends object = object> = ({ ok: true } & T) | Fail;

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof AiGatewayError) return humanAiErrorMessage(error.code);
  return error instanceof Error ? error.message : fallback;
}

const UUID = /^[0-9a-f-]{36}$/i;

export async function saveJobProfileAction(formData: FormData): Promise<Result> {
  const userId = await requireUserId();
  const parsed = parseProfileForm(formData);
  if (typeof parsed === "string") return { ok: false, message: parsed };
  try {
    await saveJobProfile(userId, parsed);
    revalidatePath("/jobs");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没存上") };
  }
}

export async function runJobSearchAction(): Promise<Result<{ kept: number; skipped: string[] }>> {
  const userId = await requireUserId();
  try {
    const result = await runDailyJobSearch(userId);
    revalidatePath("/jobs");
    return { ok: true, kept: result.kept, skipped: result.skipped };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "今天没搜成") };
  }
}

/** 手动加：贴网址，或者贴招聘页上的字。 */
export async function addPostingAction(input: { url: string; text: string }): Promise<Result<{ id: string }>> {
  const userId = await requireUserId();
  try {
    const url = input.url.trim();
    const text = input.text.trim();
    if (url) {
      if (!/^https?:\/\//i.test(url)) return { ok: false, message: "网址要以 http:// 或 https:// 开头。" };
      const page = await readJobPage(url);
      if (!page.ok) {
        if (text.length >= 200) {
          const r = await createPosting(userId, { body: text, url: normalizeUrl(url), source: "manual" });
          revalidatePath("/jobs");
          return r.ok ? { ok: true, id: r.id } : { ok: false, message: r.reason };
        }
        return { ok: false, message: `没读到这一页的正文（${page.reason}）。把页面上的字复制下来，贴进下面的框里再加一次。` };
      }
      const r = await createPosting(userId, { body: page.body, url: page.url, source: "manual" });
      revalidatePath("/jobs");
      return r.ok ? { ok: true, id: r.id } : { ok: false, message: r.reason };
    }
    if (text.length < 200) return { ok: false, message: "贴一个网址，或者把招聘页上的字整段贴进来（至少两百字）。" };
    const r = await createPosting(userId, { body: text, url: null, source: "manual" });
    revalidatePath("/jobs");
    return r.ok ? { ok: true, id: r.id } : { ok: false, message: r.reason };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没加上") };
  }
}

/** 材料详情页的"这是岗位"（表单提交，成功跳到岗位页）。 */
export async function addPostingFromMaterialAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const materialId = String(formData.get("material_id") ?? "");
  if (!UUID.test(materialId)) redirect("/materials");
  let target: string;
  try {
    const r = await createPostingFromMaterial(userId, materialId);
    target = r.ok ? `/jobs/${r.id}` : `/materials/${materialId}?job_error=${encodeURIComponent(r.reason)}`;
  } catch (error) {
    target = `/materials/${materialId}?job_error=${encodeURIComponent(errorMessage(error, "没转成岗位"))}`;
  }
  redirect(target);
}

export async function pickPostingAction(id: string): Promise<Result> {
  const userId = await requireUserId();
  try {
    await pickPosting(userId, id);
    revalidatePath("/jobs");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没弄成") };
  }
}

export async function dropCandidateAction(id: string): Promise<Result> {
  const userId = await requireUserId();
  try {
    await dropCandidate(userId, id);
    revalidatePath("/jobs");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没删掉") };
  }
}

export async function refreshMatchAction(id: string): Promise<Result<{ noEntries: boolean }>> {
  const userId = await requireUserId();
  try {
    const r = await refreshMatch(userId, id);
    revalidatePath(`/jobs/${id}`);
    return { ok: true, noEntries: r === "no-entries" };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没对照成") };
  }
}

export async function draftEntryAction(input: {
  id: string | null;
  topic: string;
  question: string;
  org: string;
  period: string;
  raw: string;
}): Promise<Result<{ id: string; draft_ja: string; dropped: DroppedSentence[]; follow_up: string }>> {
  const userId = await requireUserId();
  if (!isCareerTopic(input.topic)) return { ok: false, message: "话题不对" };
  try {
    const r = await draftEntry(userId, { ...input, topic: input.topic, id: input.id && UUID.test(input.id) ? input.id : null });
    revalidatePath("/jobs/base");
    return { ok: true, ...r };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没整理成") };
  }
}

export async function confirmEntryAction(input: { id: string; org: string; period: string; draftJa: string }): Promise<Result> {
  const userId = await requireUserId();
  try {
    await confirmEntry(userId, input);
    revalidatePath("/jobs/base");
    revalidatePath("/jobs");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没确认上") };
  }
}

export async function deleteEntryAction(id: string): Promise<Result> {
  const userId = await requireUserId();
  try {
    await deleteEntry(userId, id);
    revalidatePath("/jobs/base");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没删掉") };
  }
}

export async function tailorResumeAction(postingId: string): Promise<Result<{ id: string }>> {
  const userId = await requireUserId();
  try {
    const id = await tailorForPosting(userId, postingId);
    revalidatePath(`/jobs/${postingId}`);
    return { ok: true, id };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没改成") };
  }
}

export async function saveResumeEditAction(input: {
  resumeId: string;
  postingId: string;
  key: string;
  text: string;
}): Promise<Result<{ id: string }>> {
  const userId = await requireUserId();
  if (!RESUME_SECTION_KEYS.includes(input.key as ResumeSectionKey)) return { ok: false, message: "段落不对" };
  try {
    const id = await saveResumeEdit(userId, input.resumeId, input.key as ResumeSectionKey, input.text);
    revalidatePath(`/jobs/${input.postingId}`);
    return { ok: true, id };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没存上") };
  }
}

export async function recordApplicationAction(input: {
  postingId: string;
  resumeId: string | null;
  channel: string;
  appliedOn: string;
}): Promise<Result> {
  const userId = await requireUserId();
  if (!isChannel(input.channel)) return { ok: false, message: "选一下是从哪投的" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.appliedOn)) return { ok: false, message: "投递日期格式不对" };
  try {
    await recordApplication(userId, { ...input, channel: input.channel });
    revalidatePath(`/jobs/${input.postingId}`);
    revalidatePath("/jobs");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没记上") };
  }
}

export async function setApplicationStatusAction(input: {
  id: string;
  postingId: string;
  status: string;
  offeredSalary: string;
}): Promise<Result> {
  const userId = await requireUserId();
  if (!isApplicationStatus(input.status)) return { ok: false, message: "状态不对" };
  const salaryText = input.offeredSalary.trim();
  const salary = salaryText ? Number(salaryText) : null;
  if (salary !== null && (!Number.isInteger(salary) || salary < 100 || salary > 5000)) {
    return { ok: false, message: "年收写万日元的整数，比如 480" };
  }
  try {
    await setApplicationStatus(userId, { id: input.id, status: input.status, offeredSalary: salary, today: tokyoDate() });
    revalidatePath(`/jobs/${input.postingId}`);
    revalidatePath("/jobs");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没改上") };
  }
}

export async function createMarketBetAction(input: { text: string; dueOn: string; confidence: number }): Promise<Result> {
  const userId = await requireUserId();
  try {
    await createMarketBet(userId, input);
    revalidatePath("/self");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "没押上") };
  }
}
