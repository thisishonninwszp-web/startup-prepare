import { supabaseAdmin } from "@/lib/supabase";
import { EMPTY_PERSONAL, isJobCategory, type JobProfile, type PersonalInfo } from "./shared";

export const MISSING_MIGRATION =
  "还差一步：迁移 078 没跑。在 Supabase 的 SQL Editor 里执行 supabase/migrations/078_jobs.sql 之后再来。";

const JOB_TABLES = /job_profiles|career_entries|job_postings|job_resumes|job_applications/;

/** 表还没建时 Supabase 的报错里会带表名。 */
export function isMissingJobTables(message: string): boolean {
  return JOB_TABLES.test(message);
}

function toPersonal(value: unknown): PersonalInfo {
  const v = (value ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(EMPTY_PERSONAL).map((key) => [key, typeof v[key] === "string" ? (v[key] as string) : ""])
  ) as PersonalInfo;
}

export async function getJobProfile(userId: string): Promise<JobProfile | null | "missing-schema"> {
  const { data, error } = await supabaseAdmin
    .from("job_profiles")
    .select("categories, locations, salary_now, salary_floor, visa, personal, last_search_on")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingJobTables(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  if (!data) return null;
  return {
    categories: ((data.categories as string[] | null) ?? []).filter(isJobCategory),
    locations: (data.locations as string[] | null) ?? [],
    salaryNow: (data.salary_now as number | null) ?? null,
    salaryFloor: (data.salary_floor as number | null) ?? null,
    visa: data.visa === "none" ? "none" : "gijinkoku",
    personal: toPersonal(data.personal),
    lastSearchOn: (data.last_search_on as string | null) ?? null,
  };
}

export async function saveJobProfile(userId: string, input: Omit<JobProfile, "lastSearchOn">): Promise<void> {
  const { error } = await supabaseAdmin.from("job_profiles").upsert(
    {
      user_id: userId,
      categories: input.categories,
      locations: input.locations,
      salary_now: input.salaryNow,
      salary_floor: input.salaryFloor,
      visa: input.visa,
      personal: input.personal,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(isMissingJobTables(error.message) ? MISSING_MIGRATION : error.message);
}

/** 记下今天搜过了（每天第一次打开 /jobs 时搜一次）。 */
export async function markSearched(userId: string, day: string): Promise<void> {
  const { error } = await supabaseAdmin.from("job_profiles").update({ last_search_on: day }).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
