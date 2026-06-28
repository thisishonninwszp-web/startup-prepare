import { supabaseAdmin } from "@/lib/supabase";
import {
  parseDreamDelta,
  parseDreamVision,
  type DreamContext,
  type DreamMessage,
  type DreamScale,
} from "./types";

export async function listDreamCases(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("dream_cases")
    .select(
      "id, title, context, scale, initial_desire, updated_at, dream_versions(id, version_no, created_at)"
    )
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const versions = Array.isArray(row.dream_versions)
      ? row.dream_versions
      : [];
    return {
      id: row.id as string,
      title: row.title as string,
      context: row.context as DreamContext,
      scale: row.scale as DreamScale,
      initial_desire: row.initial_desire as string,
      updated_at: row.updated_at as string,
      version_count: versions.length,
      latest_version:
        versions.sort(
          (a, b) => Number(b.version_no) - Number(a.version_no)
        )[0] ?? null,
    };
  });
}

export async function getDreamCase(caseId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("dream_cases")
    .select(
      "id, user_id, title, context, scale, initial_desire, messages, created_at, dream_sources(id, source_type, source_id, snapshot, created_at), dream_versions(id, previous_version_id, version_no, vision, delta, created_at)"
    )
    .eq("id", caseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) return null;
  return {
    id: data.id as string,
    title: data.title as string,
    context: data.context as DreamContext,
    scale: data.scale as DreamScale,
    initial_desire: data.initial_desire as string,
    messages: (Array.isArray(data.messages) ? data.messages : []) as DreamMessage[],
    created_at: data.created_at as string,
    sources: Array.isArray(data.dream_sources) ? data.dream_sources : [],
    versions: (Array.isArray(data.dream_versions)
      ? data.dream_versions
      : []
    )
      .map((version) => ({
        id: version.id as string,
        previous_version_id: version.previous_version_id as string | null,
        version_no: version.version_no as number,
        vision: parseDreamVision(version.vision),
        delta: version.delta ? parseDreamDelta(version.delta) : null,
        created_at: version.created_at as string,
      }))
      .sort((a, b) => b.version_no - a.version_no),
  };
}

export type DreamCaseDetail = NonNullable<
  Awaited<ReturnType<typeof getDreamCase>>
>;

export async function listRealityVersionChoices(userId: string) {
  const { data: cases, error: caseError } = await supabaseAdmin
    .from("reality_cases")
    .select("id, title")
    .eq("user_id", userId)
    .is("archived_at", null);
  if (caseError) throw new Error(caseError.message);
  const caseMap = new Map((cases ?? []).map((item) => [item.id, item.title]));
  const caseIds = Array.from(caseMap.keys());
  if (caseIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("reality_versions")
    .select("id, case_id, version_no, map, created_at")
    .in("case_id", caseIds)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map((version) => ({
    id: version.id as string,
    case_id: version.case_id as string,
    case_title: caseMap.get(version.case_id) ?? "未知现状课题",
    version_no: version.version_no as number,
    map: version.map,
    created_at: version.created_at as string,
  }));
}

export async function listDreamVersionChoices(userId: string) {
  const cases = await listDreamCases(userId);
  const caseMap = new Map(cases.map((item) => [item.id, item]));
  const caseIds = Array.from(caseMap.keys());
  if (caseIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("dream_versions")
    .select("id, case_id, version_no, vision, created_at")
    .in("case_id", caseIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((version) => ({
    id: version.id as string,
    case_id: version.case_id as string,
    case_title: caseMap.get(version.case_id)?.title ?? "未知梦想",
    context: caseMap.get(version.case_id)?.context ?? "cross",
    scale: caseMap.get(version.case_id)?.scale ?? "small",
    version_no: version.version_no as number,
    vision: parseDreamVision(version.vision),
    created_at: version.created_at as string,
  }));
}
