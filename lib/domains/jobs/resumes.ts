import { supabaseAdmin } from "@/lib/supabase";
import { tailorResume } from "@/lib/ai";
import { listConfirmedEntries } from "./base";
import { getPosting } from "./postings";
import { MISSING_MIGRATION, isMissingJobTables } from "./profile";
import type { JobResume, ResumeProbe, ResumeSection, ResumeSectionKey, TailoredResume } from "./shared";

const RESUME_COLUMNS = "id, posting_id, version, sections, probes, dropped, created_at";

function toResume(r: Record<string, unknown>): JobResume {
  return {
    id: r.id as string,
    posting_id: r.posting_id as string,
    version: r.version as number,
    sections: r.sections as Record<ResumeSectionKey, ResumeSection>,
    probes: (r.probes as ResumeProbe[] | null) ?? [],
    dropped: (r.dropped as TailoredResume["dropped"] | null) ?? [],
    created_at: r.created_at as string,
  };
}

async function nextVersion(postingId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("job_resumes")
    .select("version")
    .eq("posting_id", postingId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(isMissingJobTables(error.message) ? MISSING_MIGRATION : error.message);
  return ((data?.version as number | undefined) ?? 0) + 1;
}

async function insertVersion(userId: string, postingId: string, resume: TailoredResume): Promise<string> {
  const version = await nextVersion(postingId);
  const { data, error } = await supabaseAdmin
    .from("job_resumes")
    .insert({ user_id: userId, posting_id: postingId, version, sections: resume.sections, probes: resume.probes, dropped: resume.dropped })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** 按这个岗位改一版（每句出处由代码核对过）。 */
export async function tailorForPosting(userId: string, postingId: string): Promise<string> {
  const posting = await getPosting(userId, postingId);
  if (!posting) throw new Error("找不到这个岗位");
  const entries = await listConfirmedEntries(userId);
  if (entries.length === 0) throw new Error("底稿里还没有确认过的经历。先去「底稿」写几条、点确认，再来改简历。");
  const tailored = await tailorResume(
    userId,
    { company: posting.company_name, title: posting.title, conditions: posting.facts.conditions, body: posting.body },
    entries
  );
  return insertVersion(userId, postingId, tailored);
}

export async function getResume(userId: string, id: string): Promise<JobResume | null> {
  const { data, error } = await supabaseAdmin.from("job_resumes").select(RESUME_COLUMNS).eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toResume(data as Record<string, unknown>) : null;
}

export async function latestResume(userId: string, postingId: string): Promise<JobResume | null> {
  const { data, error } = await supabaseAdmin
    .from("job_resumes")
    .select(RESUME_COLUMNS)
    .eq("posting_id", postingId)
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingJobTables(error.message)) return null;
    throw new Error(error.message);
  }
  return data ? toResume(data as Record<string, unknown>) : null;
}

/** 他改一段：存成新版本，其他段原样带过去，这一段放 user_text（他自己写的不核对）。 */
export async function saveResumeEdit(userId: string, resumeId: string, key: ResumeSectionKey, text: string): Promise<string> {
  const base = await getResume(userId, resumeId);
  if (!base) throw new Error("找不到这一版简历");
  const sections: Record<ResumeSectionKey, ResumeSection> = { ...base.sections };
  sections[key] = { sentences: base.sections[key]?.sentences ?? [], user_text: text.trim() };
  return insertVersion(userId, base.posting_id, { sections, probes: base.probes, dropped: base.dropped });
}
