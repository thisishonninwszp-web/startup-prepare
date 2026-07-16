import { supabaseAdmin } from "@/lib/supabase";
import {
  DEFAULT_REFLECTION_CATEGORIES,
  parseMonthlyRetrospective,
  parseWeeklyRetrospective,
  type DailyTimeBlock,
  type ReflectionCategory,
} from "./types";

export type ReflectionSettings = {
  timezone: string;
  review_weekday: number;
  categories: ReflectionCategory[];
  gray_keywords: string[];
  private_terms: string[];
};

export function defaultReflectionSettings(): ReflectionSettings {
  return {
    timezone: "Asia/Tokyo",
    review_weekday: 0,
    categories: DEFAULT_REFLECTION_CATEGORIES.map((item) => ({ ...item })),
    gray_keywords: [],
    private_terms: [],
  };
}

export function todayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function getReflectionSettings(
  userId: string
): Promise<ReflectionSettings> {
  const { data, error } = await supabaseAdmin
    .from("reflection_settings")
    .select("timezone, review_weekday, categories, gray_keywords, private_terms")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return defaultReflectionSettings();
  const categories = Array.isArray(data.categories)
    ? (data.categories as ReflectionCategory[]).filter(
        (item) =>
          item &&
          typeof item.key === "string" &&
          typeof item.label === "string" &&
          typeof item.color === "string"
      )
    : [];
  return {
    timezone: data.timezone as string,
    review_weekday: data.review_weekday as number,
    categories: categories.length
      ? categories
      : defaultReflectionSettings().categories,
    gray_keywords: (data.gray_keywords ?? []) as string[],
    private_terms: (data.private_terms ?? []) as string[],
  };
}

export async function getDailyReflection(
  userId: string,
  date: string
) {
  const { data, error } = await supabaseAdmin
    .from("daily_reflections")
    .select(
      "id, reflection_date, sanitized_journal, ambiguities, fact_observation, status, confirmed_at, daily_time_blocks(id, start_slot, end_slot, event, category_key, time_basis, secondary_note, origin)"
    )
    .eq("user_id", userId)
    .eq("reflection_date", date)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id as string,
    reflection_date: data.reflection_date as string,
    sanitized_journal: data.sanitized_journal as string,
    ambiguities: (data.ambiguities ?? []) as string[],
    fact_observation: data.fact_observation as string,
    status: data.status as "draft" | "confirmed",
    confirmed_at: data.confirmed_at as string | null,
    blocks: ((data.daily_time_blocks ?? []) as DailyTimeBlock[]).sort(
      (a, b) => a.start_slot - b.start_slot
    ),
  };
}

export async function listDailyReflections(
  userId: string,
  fromDate: string,
  toDate: string
) {
  const { data, error } = await supabaseAdmin
    .from("daily_reflections")
    .select(
      "id, reflection_date, fact_observation, status, daily_time_blocks(start_slot, end_slot, category_key)"
    )
    .eq("user_id", userId)
    .gte("reflection_date", fromDate)
    .lte("reflection_date", toDate)
    .order("reflection_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listRetroPeriods(userId: string, limit = 24) {
  const { data, error } = await supabaseAdmin
    .from("retro_periods")
    .select("id, period_type, period_start, period_end, status, completed_at")
    .eq("user_id", userId)
    .order("period_start", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listJudgmentRules(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("judgment_rules")
    .select("id, text, status, created_at, replaces_rule_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listDueRetroPredictions(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("predictions")
    .select("id, period_id, text, due_at, outcome")
    .eq("user_id", userId)
    .eq("source_type", "retro")
    .eq("outcome", "pending")
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listOpenRetroCommitments(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("retro_commitments")
    .select("id, period_id, text, due_at, completed_at, note")
    .eq("user_id", userId)
    .is("completed_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getRetroPeriod(periodId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("retro_periods")
    .select(
      "id, user_id, period_type, period_start, period_end, status, draft, messages, final, completed_at, retro_sources(id, source_type, source_id, label, snapshot, included), retro_commitments(id, text, due_at, completed_at)"
    )
    .eq("id", periodId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) return null;

  const { data: predictionRows, error: predictionsError } = await supabaseAdmin
    .from("predictions")
    .select("id, text, due_at, outcome, note")
    .eq("period_id", periodId)
    .eq("source_type", "retro");
  if (predictionsError) throw new Error(predictionsError.message);

  return {
    id: data.id as string,
    period_type: data.period_type as "weekly" | "monthly",
    period_start: data.period_start as string,
    period_end: data.period_end as string,
    status: data.status as "draft" | "interview" | "completed",
    draft:
      data.draft && data.period_type === "weekly"
        ? parseWeeklyRetrospective(data.draft)
        : data.draft && data.period_type === "monthly"
          ? parseMonthlyRetrospective(data.draft)
          : null,
    final:
      data.final && data.period_type === "weekly"
        ? parseWeeklyRetrospective(data.final)
        : data.final && data.period_type === "monthly"
          ? parseMonthlyRetrospective(data.final)
          : null,
    messages: Array.isArray(data.messages) ? data.messages : [],
    sources: Array.isArray(data.retro_sources) ? data.retro_sources : [],
    commitments: Array.isArray(data.retro_commitments)
      ? data.retro_commitments
      : [],
    predictions: predictionRows ?? [],
    completed_at: data.completed_at as string | null,
  };
}

export type RetroPeriodDetail = NonNullable<
  Awaited<ReturnType<typeof getRetroPeriod>>
>;
