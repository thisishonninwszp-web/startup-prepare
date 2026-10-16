import { supabaseAdmin } from "@/lib/supabase";
import { fetchPublicPage } from "@/app/(app)/materials/fetch-page";
import { extractPostingFacts, matchPosting, type ExtractedPosting } from "@/lib/ai";
import { extractJobText } from "./page-text";
import { listConfirmedEntries } from "./base";
import { isMissingJobTables, MISSING_MIGRATION } from "./profile";
import {
  addDays,
  CANDIDATE_TTL_DAYS,
  normalizeUrl,
  postingKey,
  tokyoDate,
  type JobPosting,
  type PostingCategory,
  type PostingFacts,
  type PostingMatch,
  type PostingSource,
} from "./shared";

/**
 * 岗位：手机分享（经材料箱）、手动加、每天搜到的都存成同一种东西。
 * picked_at 为空的是搜到的候选；点"要这个"才挂到公司档案上、跟底稿对照。
 */

const POSTING_COLUMNS =
  "id, company_id, company_name, title, url, source, material_id, body, facts, category, match, picked_at, found_on, created_at";

function toPosting(r: Record<string, unknown>): JobPosting {
  return {
    id: r.id as string,
    company_id: (r.company_id as string | null) ?? null,
    company_name: r.company_name as string,
    title: r.title as string,
    url: (r.url as string | null) ?? null,
    source: r.source as PostingSource,
    material_id: (r.material_id as string | null) ?? null,
    body: r.body as string,
    facts: r.facts as PostingFacts,
    category: r.category as PostingCategory,
    match: (r.match as PostingMatch | null) ?? null,
    picked_at: (r.picked_at as string | null) ?? null,
    found_on: r.found_on as string,
    created_at: r.created_at as string,
  };
}

/** 读一页招聘页（防内网、手动跟跳转都在 fetchPublicPage 里）。字太少多半是要登录或脚本画出来的。 */
export async function readJobPage(url: string): Promise<{ ok: true; url: string; body: string } | { ok: false; reason: string }> {
  const page = await fetchPublicPage(url, (html) => extractJobText(html));
  if (!page.ok) return { ok: false, reason: page.reason };
  if (page.body.length < 200) return { ok: false, reason: "页面上读到的字太少，可能要登录，或者正文是脚本画出来的" };
  return { ok: true, url: normalizeUrl(page.finalUrl), body: page.body };
}

async function findExisting(userId: string, url: string | null, key: string): Promise<string | null> {
  const byKey = await supabaseAdmin.from("job_postings").select("id").eq("user_id", userId).eq("dedupe_key", key).maybeSingle();
  if (byKey.error) throw new Error(byKey.error.message);
  if (byKey.data) return byKey.data.id as string;
  if (!url) return null;
  const byUrl = await supabaseAdmin.from("job_postings").select("id").eq("user_id", userId).eq("url", url).maybeSingle();
  if (byUrl.error) throw new Error(byUrl.error.message);
  return (byUrl.data?.id as string | undefined) ?? null;
}

/** 这家公司在公司档案里有就用（名字去掉株式会社、空白后比），没有就建一个"求职对象"。 */
export async function ensureProspectCompany(userId: string, name: string): Promise<string> {
  const { data, error } = await supabaseAdmin.from("companies").select("id, name").eq("user_id", userId).is("archived_at", null);
  if (error) throw new Error(error.message);
  const key = postingKey(name, "");
  const hit = (data ?? []).find((c) => postingKey(c.name as string, "") === key);
  if (hit) return hit.id as string;
  const { data: created, error: insertError } = await supabaseAdmin
    .from("companies")
    .insert({ user_id: userId, name: name.trim(), company_type: "prospect", ceo_notes: "" })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);
  return created.id as string;
}

export type SavedPosting = { id: string; existed: boolean };

/** 抽好的岗位存下来；同一家公司 + 同一个职位名、或同一个网址已经有了就不重复存。 */
export async function savePosting(
  userId: string,
  extracted: Extract<ExtractedPosting, { is_posting: true }>,
  input: { body: string; url: string | null; source: PostingSource; materialId?: string | null; picked: boolean; foundOn: string }
): Promise<SavedPosting> {
  const key = postingKey(extracted.company, extracted.title);
  const existing = await findExisting(userId, input.url, key);
  if (existing) return { id: existing, existed: true };
  const companyId = input.picked ? await ensureProspectCompany(userId, extracted.company) : null;
  const { data, error } = await supabaseAdmin
    .from("job_postings")
    .insert({
      user_id: userId,
      company_id: companyId,
      company_name: extracted.company,
      title: extracted.title,
      url: input.url,
      dedupe_key: key,
      source: input.source,
      material_id: input.materialId ?? null,
      body: input.body,
      facts: extracted.facts,
      category: extracted.category,
      picked_at: input.picked ? new Date().toISOString() : null,
      found_on: input.foundOn,
    })
    .select("id")
    .single();
  if (error) {
    // 两个请求同时存同一个岗位：撞了唯一约束就当已经有了
    if (error.code === "23505") {
      const again = await findExisting(userId, input.url, key);
      if (again) return { id: again, existed: true };
    }
    throw new Error(isMissingJobTables(error.message) ? MISSING_MIGRATION : error.message);
  }
  return { id: data.id as string, existed: false };
}

export type CreatePostingResult = { ok: true; id: string; existed: boolean } | { ok: false; reason: string };

/** 一页正文 → 岗位（分享、手动加、以后的邮件都走这里），马上挂公司、跟底稿对照。 */
export async function createPosting(
  userId: string,
  input: { body: string; url: string | null; source: PostingSource; materialId?: string | null }
): Promise<CreatePostingResult> {
  const extracted = await extractPostingFacts(userId, input.body);
  if (!extracted.is_posting) return { ok: false, reason: "这一页看起来不是一个具体职位的招聘页（列表页、文章这类不算）。" };
  const saved = await savePosting(userId, extracted, { ...input, picked: true, foundOn: tokyoDate() });
  if (saved.existed) await pickPosting(userId, saved.id);
  else await refreshMatchQuietly(userId, saved.id);
  return { ok: true, ...saved };
}

/** 从材料箱的一份材料变成岗位：有网址就按招聘页重新读一遍（材料箱读文章的方式会丢掉表格），读不到再用材料里存的字。 */
export async function createPostingFromMaterial(userId: string, materialId: string): Promise<CreatePostingResult> {
  const { data: material, error } = await supabaseAdmin
    .from("reality_materials")
    .select("id, source_url")
    .eq("id", materialId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!material) return { ok: false, reason: "找不到这份材料。" };
  const url = (material.source_url as string | null) ?? null;
  if (url) {
    const page = await readJobPage(url);
    if (page.ok) return createPosting(userId, { body: page.body, url: page.url, source: "share", materialId });
  }
  const { data: extraction, error: extractionError } = await supabaseAdmin
    .from("reality_material_extractions")
    .select("extracted_text")
    .eq("material_id", materialId)
    .eq("user_id", userId)
    .maybeSingle();
  if (extractionError) throw new Error(extractionError.message);
  const text = (extraction?.extracted_text as string | undefined) ?? "";
  if (text.trim().length < 200) {
    return { ok: false, reason: "这份材料里的字太少，看不出是哪个岗位。把招聘页上的字复制下来，贴进「加一个岗位」试试。" };
  }
  return createPosting(userId, { body: text, url: url ? normalizeUrl(url) : null, source: "share", materialId });
}

export async function getPosting(userId: string, id: string): Promise<JobPosting | null> {
  const { data, error } = await supabaseAdmin.from("job_postings").select(POSTING_COLUMNS).eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(isMissingJobTables(error.message) ? MISSING_MIGRATION : error.message);
  return data ? toPosting(data as Record<string, unknown>) : null;
}

/** 要了的岗位（新的在前）和还没决定的候选（新的在前）。 */
export async function listPostings(userId: string): Promise<{ picked: JobPosting[]; candidates: JobPosting[] }> {
  const { data, error } = await supabaseAdmin
    .from("job_postings")
    .select(POSTING_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingJobTables(error.message)) return { picked: [], candidates: [] };
    throw new Error(error.message);
  }
  const all = (data ?? []).map((r) => toPosting(r as Record<string, unknown>));
  return { picked: all.filter((p) => p.picked_at), candidates: all.filter((p) => !p.picked_at) };
}

/** 点"要这个"：挂到公司档案上，跟底稿对照。 */
export async function pickPosting(userId: string, id: string): Promise<void> {
  const posting = await getPosting(userId, id);
  if (!posting) throw new Error("找不到这个岗位");
  if (!posting.picked_at) {
    const companyId = await ensureProspectCompany(userId, posting.company_name);
    const { error } = await supabaseAdmin
      .from("job_postings")
      .update({ picked_at: new Date().toISOString(), company_id: companyId, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  }
  if (!posting.match) await refreshMatchQuietly(userId, id);
}

/** 候选点"不要"：直接删（要了的岗位不在这里删）。 */
export async function dropCandidate(userId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("job_postings").delete().eq("id", id).eq("user_id", userId).is("picked_at", null);
  if (error) throw new Error(error.message);
}

/** 没点"要这个"的候选，留 14 天。 */
export async function cleanOldCandidates(userId: string, today: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("job_postings")
    .delete()
    .eq("user_id", userId)
    .is("picked_at", null)
    .lt("found_on", addDays(today, -CANDIDATE_TTL_DAYS));
  if (error) throw new Error(error.message);
}

/** 跟确认过的底稿对照。底稿一条都没确认时返回 "no-entries"，不调 AI。 */
export async function refreshMatch(userId: string, id: string): Promise<PostingMatch | "no-entries"> {
  const posting = await getPosting(userId, id);
  if (!posting) throw new Error("找不到这个岗位");
  const entries = await listConfirmedEntries(userId);
  if (entries.length === 0) return "no-entries";
  const match = await matchPosting(userId, posting.facts.conditions, entries);
  const { error } = await supabaseAdmin
    .from("job_postings")
    .update({ match, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return match;
}

/** 对照没做成不挡住岗位进来：详情页会显示"还没对照"和按钮。 */
async function refreshMatchQuietly(userId: string, id: string): Promise<void> {
  try {
    await refreshMatch(userId, id);
  } catch (e) {
    console.error("job match failed", id, e);
  }
}

/** 这些网址里哪些已经存过。 */
export async function knownUrls(userId: string, urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  const { data, error } = await supabaseAdmin.from("job_postings").select("url").eq("user_id", userId).in("url", urls);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.url as string));
}
