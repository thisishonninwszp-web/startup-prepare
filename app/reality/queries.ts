import { supabaseAdmin } from "@/lib/supabase";
import {
  parseRealityDelta,
  parseRealityMap,
  type RealityCaseSummary,
  type RealityContext,
  type RealityMessage,
  type RealityMode,
  type RealitySourceType,
  type RealityVersion,
} from "./types";

export type RealitySourceOption = {
  type: RealitySourceType;
  id: string;
  label: string;
  detail: string;
  date: string;
};

function relationOne(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return (value[0] as Record<string, unknown> | undefined) ?? null;
  }
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export async function listRealitySourceOptions(
  userId: string
): Promise<RealitySourceOption[]> {
  const [observations, ideas, validations, predictions] = await Promise.all([
    supabaseAdmin
      .from("observations")
      .select("id, raw_text, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("ideas")
      .select("id, title, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("validations")
      .select(
        "id, has_pain, will_pay, note, contacted_at, ideas!inner(user_id, title)"
      )
      .eq("ideas.user_id", userId)
      .order("contacted_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("predictions")
      .select("id, text, outcome, made_at, ideas!inner(user_id, title)")
      .eq("ideas.user_id", userId)
      .order("made_at", { ascending: false })
      .limit(20),
  ]);
  for (const result of [observations, ideas, validations, predictions]) {
    if (result.error) throw new Error(result.error.message);
  }

  const output: RealitySourceOption[] = [];
  for (const row of observations.data ?? []) {
    output.push({
      type: "observation",
      id: row.id,
      label: "观察",
      detail: row.raw_text,
      date: row.created_at,
    });
  }
  for (const row of ideas.data ?? []) {
    output.push({
      type: "idea",
      id: row.id,
      label: `想法 · ${row.title?.trim() || "无标题"}`,
      detail: `状态：${row.status}`,
      date: row.created_at,
    });
  }
  for (const row of validations.data ?? []) {
    const idea = relationOne(row.ideas);
    output.push({
      type: "validation",
      id: row.id,
      label: `验证 · ${(idea?.title as string | undefined)?.trim() || "无标题"}`,
      detail: `有真实痛：${row.has_pain} · 愿付钱：${row.will_pay}${
        row.note ? ` · ${row.note}` : ""
      }`,
      date: row.contacted_at,
    });
  }
  for (const row of predictions.data ?? []) {
    const idea = relationOne(row.ideas);
    output.push({
      type: "prediction",
      id: row.id,
      label: `预测 · ${(idea?.title as string | undefined)?.trim() || "无标题"}`,
      detail: `${row.text} · ${row.outcome}`,
      date: row.made_at,
    });
  }
  return output.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export async function listRealityCases(
  userId: string
): Promise<RealityCaseSummary[]> {
  const { data, error } = await supabaseAdmin
    .from("reality_cases")
    .select(
      "id, mode, context, title, domains, updated_at, reality_versions(version_no, review_due_at)"
    )
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const versions = Array.isArray(row.reality_versions)
      ? [...row.reality_versions].sort(
          (a, b) => (b.version_no as number) - (a.version_no as number)
        )
      : [];
    return {
      id: row.id,
      mode: row.mode,
      context: row.context,
      title: row.title,
      domains: row.domains ?? [],
      updated_at: row.updated_at,
      review_due_at: (versions[0]?.review_due_at as string | null) ?? null,
    };
  });
}

export async function getRealityCase(caseId: string, userId: string) {
  const { data: realityCase, error } = await supabaseAdmin
    .from("reality_cases")
    .select(
      "id, user_id, mode, context, title, initial_statement, domains, messages, created_at, updated_at, archived_at"
    )
    .eq("id", caseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!realityCase || realityCase.user_id !== userId) return null;

  const [
    { data: sources, error: sourcesError },
    { data: versions, error: versionsError },
  ] = await Promise.all([
      supabaseAdmin
        .from("reality_case_sources")
        .select("id, source_snapshot, added_at")
        .eq("case_id", caseId)
        .order("added_at", { ascending: true }),
      supabaseAdmin
        .from("reality_versions")
        .select(
          "id, version_no, map, delta, selected_path, custom_action, selection_reason, review_due_at, created_at"
        )
        .eq("case_id", caseId)
        .order("version_no", { ascending: false }),
  ]);
  if (sourcesError) throw new Error(sourcesError.message);
  if (versionsError) throw new Error(versionsError.message);

  return {
    id: realityCase.id as string,
    mode: realityCase.mode as RealityMode,
    context: realityCase.context as RealityContext,
    title: realityCase.title as string,
    initial_statement: realityCase.initial_statement as string,
    domains: (realityCase.domains ?? []) as string[],
    messages: Array.isArray(realityCase.messages)
      ? (realityCase.messages as RealityMessage[])
      : [],
    created_at: realityCase.created_at as string,
    updated_at: realityCase.updated_at as string,
    sources: (sources ?? []).map((source) => source.source_snapshot),
    versions: (versions ?? []).map(
      (version): RealityVersion => ({
        id: version.id as string,
        version_no: version.version_no as number,
        map: parseRealityMap(version.map),
        delta: version.delta ? parseRealityDelta(version.delta) : null,
        selected_path: version.selected_path
          ? (version.selected_path as RealityVersion["selected_path"])
          : null,
        custom_action: version.custom_action as string | null,
        selection_reason: version.selection_reason as string | null,
        review_due_at: version.review_due_at as string | null,
        created_at: version.created_at as string,
      })
    ),
  };
}

export type RealityCaseDetail = NonNullable<
  Awaited<ReturnType<typeof getRealityCase>>
>;
