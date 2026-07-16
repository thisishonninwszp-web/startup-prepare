"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  draftMonthlyRetrospective,
  draftWeeklyRetrospective,
  extractDailyTimeline,
  finalizeWeeklyRetrospective,
  nextRetrospectiveQuestions,
  type RetroAiSource,
  type RetroInterviewTurn,
} from "@/lib/ai";
import {
  DEFAULT_REFLECTION_CATEGORIES,
  applyGrayTimeRules,
  getMonthlyPeriod,
  getWeeklyPeriod,
  normalizeAiTimelineCategories,
  parseDailyTimeline,
  parseMonthlyRetrospective,
  parseWeeklyRetrospective,
  validateRetroCitations,
  validatePredictionDueDate,
  type ReflectionCategory,
  type WeeklyRetrospective,
} from "./types";
import {
  getReflectionSettings,
  getRetroPeriod,
  type ReflectionSettings,
} from "./queries";

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

function text(value: string, label: string, max = 12_000): string {
  const clean = value.trim();
  if (!clean) throw new Error(`${label}不能为空`);
  if (clean.length > max) throw new Error(`${label}不能超过${max}字`);
  return clean;
}

function validDate(value: string, label = "日期"): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label}格式无效`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`${label}格式无效`);
  return value;
}

function endExclusive(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString();
}

function startInstant(date: string): string {
  return `${date}T00:00:00.000Z`;
}

function validateCategories(categories: ReflectionCategory[]) {
  if (categories.length < 2 || categories.length > 20) {
    throw new Error("时间分类必须为2到20项");
  }
  const keys = new Set<string>();
  return categories.map((item) => {
    const key = item.key.trim();
    const label = item.label.trim();
    if (!/^[a-z0-9_-]{1,40}$/i.test(key) || !label) {
      throw new Error("时间分类格式无效");
    }
    if (keys.has(key)) throw new Error("时间分类键不能重复");
    keys.add(key);
    return { key, label: label.slice(0, 30), color: item.color || "zinc" };
  });
}

export async function saveReflectionSettings(input: {
  timezone: string;
  reviewWeekday: number;
  categories: ReflectionCategory[];
  grayKeywords: string[];
  privateTerms: string[];
}) {
  const userId = await requireUserId();
  if (!Number.isInteger(input.reviewWeekday) || input.reviewWeekday < 0 || input.reviewWeekday > 6) {
    throw new Error("复盘日无效");
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.timezone }).format();
  } catch {
    throw new Error("时区无效");
  }
  const categories = validateCategories(input.categories);
  if (!categories.some((item) => item.key === "unknown")) {
    throw new Error("必须保留未知分类");
  }
  const { error } = await supabaseAdmin.from("reflection_settings").upsert({
    user_id: userId,
    timezone: input.timezone,
    review_weekday: input.reviewWeekday,
    categories,
    gray_keywords: input.grayKeywords.map((item) => item.trim()).filter(Boolean).slice(0, 50),
    private_terms: input.privateTerms.map((item) => item.trim()).filter(Boolean).slice(0, 100),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/retrospectives");
  revalidatePath("/retrospectives/settings");
}

async function saveTimelineRpc(
  userId: string,
  date: string,
  sanitizedJournal: string,
  blocks: ReturnType<typeof parseDailyTimeline>["blocks"],
  ambiguities: string[],
  factObservation: string,
  confirm: boolean
) {
  const { data, error } = await supabaseAdmin.rpc("save_daily_timeline", {
    p_user_id: userId,
    p_reflection_date: date,
    p_sanitized_journal: sanitizedJournal,
    p_ambiguities: ambiguities,
    p_blocks: blocks,
    p_fact_observation: factObservation,
    p_confirm: confirm,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function extractDailyReflection(
  date: string,
  confirmedSanitizedJournal: string
) {
  const userId = await requireUserId();
  validDate(date);
  const journal = text(confirmedSanitizedJournal, "遮蔽后的日记");
  const settings = await getReflectionSettings(userId);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: settings.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (date > today) throw new Error("不能为未来日期创建实际时间镜子");
  const timeline = await extractDailyTimeline(journal, settings.categories);
  const normalized = parseDailyTimeline({
    blocks: normalizeAiTimelineCategories(
      timeline.blocks,
      settings.categories.map((item) => item.key)
    ),
    ambiguities: timeline.ambiguities,
  });
  const blocks = applyGrayTimeRules(
    normalized.blocks,
    settings.gray_keywords
  );
  const reflectionId = await saveTimelineRpc(
    userId,
    date,
    journal,
    blocks,
    normalized.ambiguities,
    "",
    false
  );
  revalidatePath(`/retrospectives/daily/${date}`);
  revalidatePath("/retrospectives");
  return { reflectionId, blocks, ambiguities: normalized.ambiguities };
}

export async function confirmDailyReflection(input: {
  date: string;
  sanitizedJournal: string;
  blocks: unknown;
  ambiguities: string[];
  factObservation: string;
}) {
  const userId = await requireUserId();
  validDate(input.date);
  const settings = await getReflectionSettings(userId);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: settings.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (input.date > today) throw new Error("不能确认未来日期");
  const timeline = parseDailyTimeline({
    blocks: input.blocks,
    ambiguities: [],
  });
  const categoryKeys = new Set(settings.categories.map((item) => item.key));
  if (timeline.blocks.some((block) => !categoryKeys.has(block.category_key))) {
    throw new Error("时间块使用了无效分类");
  }
  const blocks = applyGrayTimeRules(timeline.blocks, settings.gray_keywords);
  await saveTimelineRpc(
    userId,
    input.date,
    text(input.sanitizedJournal, "遮蔽后的日记"),
    blocks,
    input.ambiguities.map((item) => item.trim()).filter(Boolean).slice(0, 50),
    text(input.factObservation, "一句事实观察", 500),
    true
  );
  revalidatePath(`/retrospectives/daily/${input.date}`);
  revalidatePath("/retrospectives");
}

type SourceRow = {
  type: string;
  id: string;
  label: string;
  snapshot: Record<string, unknown>;
};

async function gatherWeeklySources(
  userId: string,
  start: string,
  end: string
): Promise<SourceRow[]> {
  const from = startInstant(start);
  const until = endExclusive(end);
  const sources: SourceRow[] = [];

  const [
    daily,
    observations,
    ideas,
    realityCases,
    customerCases,
  ] = await Promise.all([
    supabaseAdmin
      .from("daily_reflections")
      .select("id, reflection_date, fact_observation, daily_time_blocks(start_slot, end_slot, event, category_key)")
      .eq("user_id", userId)
      .eq("status", "confirmed")
      .gte("reflection_date", start)
      .lte("reflection_date", end),
    supabaseAdmin
      .from("observations")
      .select("id, raw_text, tags, created_at")
      .eq("user_id", userId)
      .gte("created_at", from)
      .lt("created_at", until),
    supabaseAdmin
      .from("ideas")
      .select("id, title, status, hypothesis, last_activity_at")
      .eq("user_id", userId),
    supabaseAdmin.from("reality_cases").select("id, title").eq("user_id", userId),
    supabaseAdmin.from("customer_cases").select("id, title").eq("user_id", userId),
  ]);
  for (const result of [daily, observations, ideas, realityCases, customerCases]) {
    if (result.error) throw new Error(result.error.message);
  }

  for (const row of daily.data ?? []) {
    sources.push({
      type: "daily",
      id: row.id,
      label: `时间镜子 · ${row.reflection_date}`,
      snapshot: {
        date: row.reflection_date,
        fact_observation: row.fact_observation,
        blocks: row.daily_time_blocks,
      },
    });
  }
  for (const row of observations.data ?? []) {
    sources.push({
      type: "observation",
      id: row.id,
      label: "观察",
      snapshot: { text: row.raw_text, tags: row.tags, created_at: row.created_at },
    });
  }
  for (const row of ideas.data ?? []) {
    if (row.last_activity_at < from || row.last_activity_at >= until) continue;
    sources.push({
      type: "idea",
      id: row.id,
      label: `想法 · ${row.title?.trim() || "无标题"}`,
      snapshot: {
        status: row.status,
        hypothesis: row.hypothesis,
        last_activity_at: row.last_activity_at,
      },
    });
  }

  const ideaIds = (ideas.data ?? []).map((row) => row.id);
  if (ideaIds.length) {
    const [validations, predictions, decisions] = await Promise.all([
      supabaseAdmin
        .from("validations")
        .select("id, idea_id, has_pain, will_pay, note, contacted_at")
        .in("idea_id", ideaIds)
        .gte("contacted_at", from)
        .lt("contacted_at", until),
      supabaseAdmin
        .from("predictions")
        .select("id, idea_id, text, due_at, made_at, outcome, resolved_at, note")
        .in("idea_id", ideaIds)
        .or(`and(made_at.gte.${from},made_at.lt.${until}),and(resolved_at.gte.${from},resolved_at.lt.${until})`),
      supabaseAdmin
        .from("decisions")
        .select("id, idea_id, verdict, reason, learned, decided_at")
        .in("idea_id", ideaIds)
        .gte("decided_at", from)
        .lt("decided_at", until),
    ]);
    for (const result of [validations, predictions, decisions]) {
      if (result.error) throw new Error(result.error.message);
    }
    for (const row of validations.data ?? []) {
      sources.push({
        type: "validation",
        id: row.id,
        label: "真实接触",
        snapshot: row,
      });
    }
    for (const row of predictions.data ?? []) {
      sources.push({
        type: "prediction",
        id: row.id,
        label: "想法预测",
        snapshot: row,
      });
    }
    for (const row of decisions.data ?? []) {
      sources.push({
        type: "decision",
        id: row.id,
        label: `决策 · ${row.verdict}`,
        snapshot: row,
      });
    }
  }

  const realityCaseIds = (realityCases.data ?? []).map((row) => row.id);
  if (realityCaseIds.length) {
    const { data, error } = await supabaseAdmin
      .from("reality_versions")
      .select("id, case_id, version_no, map, delta, created_at")
      .in("case_id", realityCaseIds)
      .gte("created_at", from)
      .lt("created_at", until);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      sources.push({
        type: "reality",
        id: row.id,
        label: `现状地图 · v${row.version_no}`,
        snapshot: row,
      });
    }
  }

  const customerCaseIds = (customerCases.data ?? []).map((row) => row.id);
  if (customerCaseIds.length) {
    const { data: versions, error: versionError } = await supabaseAdmin
      .from("customer_proxy_versions")
      .select("id, case_id")
      .in("case_id", customerCaseIds);
    if (versionError) throw new Error(versionError.message);
    const versionIds = (versions ?? []).map((row) => row.id);
    if (versionIds.length) {
      const { data, error } = await supabaseAdmin
        .from("customer_conclusions")
        .select("id, proxy_version_id, original_misunderstanding, updated_understanding, still_unknown, contact_person, one_question, created_at")
        .in("proxy_version_id", versionIds)
        .gte("created_at", from)
        .lt("created_at", until);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        sources.push({
          type: "customer",
          id: row.id,
          label: "顾客研究结论",
          snapshot: row,
        });
      }
    }
  }

  return sources;
}

async function gatherMonthlySources(
  userId: string,
  start: string,
  end: string
): Promise<SourceRow[]> {
  const { data, error } = await supabaseAdmin
    .from("retro_periods")
    .select("id, period_start, period_end, final, retro_commitments(text, due_at, completed_at, note)")
    .eq("user_id", userId)
    .eq("period_type", "weekly")
    .eq("status", "completed")
    .gte("period_start", start)
    .lte("period_end", end)
    .order("period_start");
  if (error) throw new Error(error.message);

  const periodIds = (data ?? []).map((row) => row.id);
  const { data: predictionRows, error: predictionsError } = periodIds.length
    ? await supabaseAdmin
        .from("predictions")
        .select("period_id, text, due_at, outcome, note")
        .eq("source_type", "retro")
        .in("period_id", periodIds)
    : { data: [], error: null };
  if (predictionsError) throw new Error(predictionsError.message);
  const predictionsByPeriod = new Map<string, unknown[]>();
  for (const p of predictionRows ?? []) {
    const list = predictionsByPeriod.get(p.period_id) ?? [];
    list.push(p);
    predictionsByPeriod.set(p.period_id, list);
  }

  return (data ?? []).map((row) => ({
    type: "weekly",
    id: row.id,
    label: `周复盘 · ${row.period_start}—${row.period_end}`,
    snapshot: {
      final: row.final,
      predictions: predictionsByPeriod.get(row.id) ?? [],
      commitments: row.retro_commitments,
    },
  }));
}

function validatePeriodRange(
  type: "weekly" | "monthly",
  start: string,
  end: string,
  settings: ReflectionSettings
) {
  validDate(start, "开始日期");
  validDate(end, "结束日期");
  const expected =
    type === "weekly"
      ? getWeeklyPeriod(end, settings.review_weekday)
      : getMonthlyPeriod(start);
  if (expected.start !== start || expected.end !== end) {
    throw new Error("复盘周期范围无效");
  }
}

export async function prepareRetroPeriod(
  type: "weekly" | "monthly",
  start: string,
  end: string
) {
  const userId = await requireUserId();
  const settings = await getReflectionSettings(userId);
  validatePeriodRange(type, start, end, settings);
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("retro_periods")
    .select("id")
    .eq("user_id", userId)
    .eq("period_type", type)
    .eq("period_start", start)
    .eq("period_end", end)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return existing.id as string;

  const sources =
    type === "weekly"
      ? await gatherWeeklySources(userId, start, end)
      : await gatherMonthlySources(userId, start, end);
  if (type === "monthly" && sources.length === 0) {
    throw new Error("这个月还没有已完成的周复盘");
  }
  const { data: period, error } = await supabaseAdmin
    .from("retro_periods")
    .insert({
      user_id: userId,
      period_type: type,
      period_start: start,
      period_end: end,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  if (sources.length) {
    const { error: sourceError } = await supabaseAdmin.from("retro_sources").insert(
      sources.map((source) => ({
        period_id: period.id,
        user_id: userId,
        source_type: source.type,
        source_id: source.id,
        label: source.label,
        snapshot: source.snapshot,
      }))
    );
    if (sourceError) throw new Error(sourceError.message);
  }
  revalidatePath("/retrospectives");
  return period.id as string;
}

async function requirePeriod(periodId: string, userId: string) {
  const period = await getRetroPeriod(periodId, userId);
  if (!period) throw new Error("无权访问该复盘");
  return period;
}

function aiSources(
  sources: {
    id: string;
    source_type: string;
    label: string;
    snapshot: unknown;
    included: boolean;
  }[]
): RetroAiSource[] {
  return sources
    .filter((source) => source.included)
    .map((source) => ({
      id: `${source.source_type}:${source.id}`,
      label: source.label,
      context:
        source.source_type === "offline" &&
        source.snapshot &&
        typeof source.snapshot === "object" &&
        "context" in source.snapshot
          ? ((source.snapshot as { context: RetroAiSource["context"] }).context)
          : source.source_type === "daily"
          ? "personal"
          : source.source_type === "reality"
            ? "cross"
            : "business",
      snapshot: source.snapshot,
    }));
}

export async function addOfflineRetroSource(
  periodId: string,
  input: {
    label: string;
    content: string;
    context: "personal" | "business" | "cross";
  }
) {
  const userId = await requireUserId();
  const period = await requirePeriod(periodId, userId);
  if (period.status === "completed") throw new Error("已完成复盘不能补充事件");
  if (
    input.context !== "personal" &&
    input.context !== "business" &&
    input.context !== "cross"
  ) {
    throw new Error("线下事件语境无效");
  }
  const sourceId = randomUUID();
  const { error } = await supabaseAdmin.from("retro_sources").insert({
    period_id: periodId,
    user_id: userId,
    source_type: "offline",
    source_id: sourceId,
    label: text(input.label, "事件标题", 120),
    snapshot: {
      content: text(input.content, "事件内容", 3000),
      context: input.context,
    },
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/retrospectives/${period.period_type}/${periodId}`);
}

export async function setRetroSourceIncluded(
  periodId: string,
  sourceRowId: string,
  included: boolean
) {
  const userId = await requireUserId();
  const period = await requirePeriod(periodId, userId);
  if (period.status === "completed") throw new Error("已完成复盘不能修改证据");
  const source = period.sources.find((item) => item.id === sourceRowId);
  if (!source) throw new Error("证据不属于该复盘");
  const { error } = await supabaseAdmin
    .from("retro_sources")
    .update({ included })
    .eq("id", sourceRowId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(
    `/retrospectives/${period.period_type}/${periodId}`
  );
}

export async function generateRetroDraft(periodId: string) {
  const userId = await requireUserId();
  const period = await requirePeriod(periodId, userId);
  if (period.status === "completed") throw new Error("该复盘已经完成");
  const sources = aiSources(period.sources);
  if (sources.length === 0) throw new Error("至少保留一条复盘证据");
  const activeRules =
    period.period_type === "monthly" ? await getActiveRules(userId) : [];
  if (period.period_type === "monthly" && activeRules.length === 0) {
    throw new Error("至少完成一份周复盘，形成判断规则后才能做月复盘");
  }
  const draft =
    period.period_type === "weekly"
      ? await draftWeeklyRetrospective(sources, period.period_end)
      : await draftMonthlyRetrospective(
          sources,
          activeRules.map((rule) => ({ id: rule.id, text: rule.text }))
        );
  const { error } = await supabaseAdmin
    .from("retro_periods")
    .update({ draft, status: "interview", updated_at: new Date().toISOString() })
    .eq("id", periodId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/retrospectives/${period.period_type}/${periodId}`);
  return draft;
}

async function getActiveRules(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("judgment_rules")
    .select("id, text")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; text: string }[];
}

export async function continueWeeklyInterview(
  periodId: string,
  answer?: string
) {
  const userId = await requireUserId();
  const period = await requirePeriod(periodId, userId);
  if (period.period_type !== "weekly" || !period.draft) {
    throw new Error("请先生成周复盘草稿");
  }
  const turns = [...(period.messages as RetroInterviewTurn[])];
  if (answer?.trim()) turns.push({ role: "user", content: answer.trim().slice(0, 3000) });
  const result = await nextRetrospectiveQuestions(
    period.draft as WeeklyRetrospective,
    aiSources(period.sources),
    turns
  );
  turns.push({ role: "assistant", content: result.questions.join("\n") });
  const { error } = await supabaseAdmin
    .from("retro_periods")
    .update({ messages: turns, updated_at: new Date().toISOString() })
    .eq("id", periodId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/retrospectives/weekly/${periodId}`);
  return result;
}

export async function refreshWeeklyFinal(periodId: string) {
  const userId = await requireUserId();
  const period = await requirePeriod(periodId, userId);
  if (period.period_type !== "weekly" || !period.draft) {
    throw new Error("请先生成周复盘草稿");
  }
  const final = await finalizeWeeklyRetrospective(
    period.draft as WeeklyRetrospective,
    aiSources(period.sources),
    period.messages as RetroInterviewTurn[]
  );
  const { error } = await supabaseAdmin
    .from("retro_periods")
    .update({ draft: final, updated_at: new Date().toISOString() })
    .eq("id", periodId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/retrospectives/weekly/${periodId}`);
  return final;
}

export async function completeWeeklyPeriod(periodId: string, value: unknown) {
  const userId = await requireUserId();
  const period = await requirePeriod(periodId, userId);
  if (period.period_type !== "weekly") throw new Error("复盘类型错误");
  const final = parseWeeklyRetrospective(value);
  validatePredictionDueDate(final.prediction.due_date, period.period_end);
  validateRetroCitations(
    final.gaps.flatMap((gap) => gap.evidence_ids),
    aiSources(period.sources).map((source) => source.id)
  );
  const { error } = await supabaseAdmin.rpc("complete_weekly_retrospective", {
    p_period_id: periodId,
    p_user_id: userId,
    p_final: final,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/retrospectives");
  revalidatePath("/dashboard");
  revalidatePath(`/retrospectives/weekly/${periodId}`);
}

export async function completeMonthlyPeriod(periodId: string, value: unknown) {
  const userId = await requireUserId();
  const period = await requirePeriod(periodId, userId);
  if (period.period_type !== "monthly") throw new Error("复盘类型错误");
  const final = parseMonthlyRetrospective(value);
  validateRetroCitations(
    final.repeated_patterns.flatMap((pattern) => pattern.evidence_ids),
    aiSources(period.sources).map((source) => source.id)
  );
  const activeRules = await getActiveRules(userId);
  if (!activeRules.some((rule) => rule.id === final.rule_decision.rule_id)) {
    throw new Error("必须选择自己的有效判断规则");
  }
  const { error } = await supabaseAdmin.rpc("complete_monthly_retrospective", {
    p_period_id: periodId,
    p_user_id: userId,
    p_final: final,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/retrospectives");
  revalidatePath(`/retrospectives/monthly/${periodId}`);
}

export async function resolveRetroPrediction(
  predictionId: string,
  outcome: "hit" | "miss",
  note: string
) {
  const userId = await requireUserId();
  if (outcome !== "hit" && outcome !== "miss") throw new Error("预测结果无效");
  const { data, error } = await supabaseAdmin
    .from("predictions")
    .select("id, user_id, outcome, source_type")
    .eq("id", predictionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId || data.source_type !== "retro") {
    throw new Error("无权对账该预测");
  }
  if (data.outcome !== "pending") throw new Error("该预测已经对账");
  const { error: updateError } = await supabaseAdmin
    .from("predictions")
    .update({
      outcome,
      note: note.trim().slice(0, 2000) || null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", predictionId)
    .eq("user_id", userId);
  if (updateError) throw new Error(updateError.message);
  revalidatePath("/retrospectives");
  revalidatePath("/dashboard");
}

export async function completeRetroCommitment(
  commitmentId: string,
  note: string
) {
  const userId = await requireUserId();
  const { data, error } = await supabaseAdmin
    .from("retro_commitments")
    .select("id, user_id, completed_at")
    .eq("id", commitmentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) throw new Error("无权更新该行动");
  if (data.completed_at) return;
  const { error: updateError } = await supabaseAdmin
    .from("retro_commitments")
    .update({
      completed_at: new Date().toISOString(),
      note: note.trim().slice(0, 2000) || null,
    })
    .eq("id", commitmentId)
    .eq("user_id", userId);
  if (updateError) throw new Error(updateError.message);
  revalidatePath("/retrospectives");
}

export async function resetReflectionCategories() {
  const userId = await requireUserId();
  const { error } = await supabaseAdmin.from("reflection_settings").upsert({
    user_id: userId,
    categories: DEFAULT_REFLECTION_CATEGORIES,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/retrospectives/settings");
}
