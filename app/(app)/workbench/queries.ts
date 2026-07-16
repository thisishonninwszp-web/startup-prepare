import { supabaseAdmin } from "@/lib/supabase";
import type {
  DecisionClosure,
  DecisionClosureObjectType,
} from "@/app/decision-closures/domain";
import {
  DECISION_OBJECT_TYPES,
  objectHref,
  toClosureObjectType,
  type WorkbenchObject,
  type WorkbenchObjectSignal,
  type WorkbenchObjectType,
} from "./domain";

export type WorkbenchDetail = {
  object: WorkbenchObject;
  signal: WorkbenchObjectSignal & { objectId: string };
  evidence: Array<{ label: string; text: string; href: string }>;
  closures: DecisionClosure[];
  learnings: Array<{
    id: string;
    actual_result: string;
    gap_reason: string;
    updated_rule: string | null;
    created_at: string;
  }>;
};

export function isMissingWorkbenchSchemaError(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    error.code === "PGRST205" &&
    Boolean(
      error.message?.includes("decision_objects") ||
        error.message?.includes("decision_object_links") ||
        error.message?.includes("decision_object_framework_uses") ||
        error.message?.includes("decision_object_learnings")
    )
  );
}

export async function getWorkbenchSchemaStatus(): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("decision_objects")
    .select("id")
    .limit(1);
  if (!error) return true;
  if (isMissingWorkbenchSchemaError(error)) return false;
  throw new Error(error.message);
}

export function attachActiveClosures<T extends WorkbenchObject>(
  objects: T[],
  closures: DecisionClosure[]
): T[] {
  return objects.map((object) => ({
    ...object,
    current_closure:
      closures.find(
        (closure) =>
          closure.object_type === object.object_type &&
          closure.object_id === object.object_id
      ) ?? null,
  }));
}

export function sortWorkbenchObjects<T extends WorkbenchObject>(
  objects: T[],
  today: string
): T[] {
  return [...objects].sort((a, b) => {
    const aDue = a.current_closure?.due_on
      ? a.current_closure.due_on <= today
      : false;
    const bDue = b.current_closure?.due_on
      ? b.current_closure.due_on <= today
      : false;
    if (aDue !== bDue) return aDue ? -1 : 1;
    return b.last_activity_at.localeCompare(a.last_activity_at);
  });
}

function safeTitle(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function baseObject(input: {
  object_type: WorkbenchObjectType;
  object_id: string;
  title: string;
  primary_module: string;
  href: string;
  last_activity_at: string;
}): WorkbenchObject {
  return {
    ...input,
    status: "active",
    current_closure: null,
  };
}

async function listIdeaObjects(userId: string): Promise<WorkbenchObject[]> {
  const { data, error } = await supabaseAdmin
    .from("ideas")
    .select("id, title, status, last_activity_at")
    .eq("user_id", userId)
    .neq("status", "归档")
    .order("last_activity_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map((idea) =>
    baseObject({
      object_type: "idea",
      object_id: idea.id as string,
      title: safeTitle(idea.title, "未命名想法"),
      primary_module: "ideas",
      href: `/ideas/${idea.id}`,
      last_activity_at: idea.last_activity_at as string,
    })
  );
}

async function listCompanyObjects(userId: string): Promise<WorkbenchObject[]> {
  const { data, error } = await supabaseAdmin
    .from("own_company_profiles")
    .select("id, display_name, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) {
    if (error.code === "PGRST205") return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((company) =>
    baseObject({
      object_type: "company_profile",
      object_id: company.id as string,
      title: safeTitle(company.display_name, "公司档案"),
      primary_module: "companies",
      href: "/companies/my",
      last_activity_at: company.updated_at as string,
    })
  );
}

async function listDreamBranchObjects(
  userId: string
): Promise<WorkbenchObject[]> {
  const { data, error } = await supabaseAdmin
    .from("dream_branches")
    .select("id, case_id, name, updated_at, dream_cases!inner(user_id, title)")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) {
    if (error.code === "PGRST205") return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((branch) =>
    baseObject({
      object_type: "dream_branch",
      object_id: branch.id as string,
      title: safeTitle(branch.name, "梦想分支"),
      primary_module: "dreams",
      href: `/dreams/${branch.case_id}`,
      last_activity_at: branch.updated_at as string,
    })
  );
}

export async function listWorkbenchObjects(
  userId: string,
  today: string
): Promise<WorkbenchObject[]> {
  const [
    { listRealityCases },
    { listCustomerCases },
    { listDreamCases },
    { getDecisionClosureSchemaStatus, listOpenDecisionClosures },
  ] = await Promise.all([
    import("../reality/queries"),
    import("../customer-view/queries"),
    import("../dreams/queries"),
    import("@/app/decision-closures/queries"),
  ]);
  const [reality, ideas, customers, dreams, dreamBranches, companies] =
    await Promise.all([
      listRealityCases(userId),
      listIdeaObjects(userId),
      listCustomerCases(userId).catch(() => []),
      listDreamCases(userId).catch(() => []),
      listDreamBranchObjects(userId),
      listCompanyObjects(userId),
    ]);

  const objects: WorkbenchObject[] = [
    ...reality.map((item) =>
      baseObject({
        object_type: "reality_case",
        object_id: item.id,
        title: item.title,
        primary_module: "reality",
        href: `/reality/${item.id}`,
        last_activity_at: item.updated_at,
      })
    ),
    ...ideas,
    ...customers.map((item) =>
      baseObject({
        object_type: "customer_case",
        object_id: item.id,
        title: item.title,
        primary_module: "customer-view",
        href: `/customer-view/${item.id}`,
        last_activity_at: item.updated_at,
      })
    ),
    ...dreams.map((item) =>
      baseObject({
        object_type: "dream_case",
        object_id: item.id,
        title: item.title,
        primary_module: "dreams",
        href: `/dreams/${item.id}`,
        last_activity_at: item.updated_at,
      })
    ),
    ...dreamBranches,
    ...companies,
  ];

  const closureAvailable = await getDecisionClosureSchemaStatus();
  const withClosures = closureAvailable
    ? attachActiveClosures(objects, await listOpenDecisionClosures(userId))
    : objects;
  return sortWorkbenchObjects(withClosures, today);
}

export function signalForObject(
  object: WorkbenchObject,
  today: string,
  evidenceHints?: {
    factCount?: number;
    unknownCount?: number;
    interpretationCount?: number;
    hasEmotionOrContradiction?: boolean;
    sourceRealityVersionId?: string;
  }
): WorkbenchObjectSignal & {
  objectId: string;
  sourceRealityVersionId?: string;
} {
  return {
    objectType: object.object_type,
    objectId: object.object_id,
    title: object.title,
    hasActiveClosure: Boolean(object.current_closure),
    isClosureDue: Boolean(
      object.current_closure && object.current_closure.due_on <= today
    ),
    unknownCount: evidenceHints?.unknownCount ?? 1,
    factCount: evidenceHints?.factCount ?? 0,
    interpretationCount: evidenceHints?.interpretationCount ?? 2,
    hasEmotionOrContradiction:
      evidenceHints?.hasEmotionOrContradiction ?? false,
    hasQuantitativeQuestion:
      /成本|价格|人数|数量|规模|时间|売上|費用|販管費|cost|price/i.test(
        object.title
      ),
    needsCustomerEvidence: object.object_type === "idea",
    needsDirection:
      object.object_type === "dream_case" || object.object_type === "dream_branch",
    sourceRealityVersionId: evidenceHints?.sourceRealityVersionId,
  };
}

async function listClosuresForWorkbenchObject(
  userId: string,
  type: WorkbenchObjectType,
  id: string
): Promise<DecisionClosure[]> {
  const closureType = toClosureObjectType(type);
  if (!closureType) {
    const { data, error } = await supabaseAdmin
      .from("decision_closures")
      .select(
        "id, object_type, object_id, origin_module, title, current_judgment, critical_unknowns, options, selected_next_step, completion_criterion, expected_feedback, due_on, basis_refs, status, created_at, closed_at"
      )
      .eq("user_id", userId)
      .eq("id", id)
      .limit(1);
    if (error) return [];
    return (data ?? []) as unknown as DecisionClosure[];
  }
  const { listDecisionClosuresForObject } = await import(
    "@/app/decision-closures/queries"
  );
  return listDecisionClosuresForObject(
    userId,
    closureType as DecisionClosureObjectType,
    id
  );
}

async function listLearnings(userId: string, type: WorkbenchObjectType, id: string) {
  const available = await getWorkbenchSchemaStatus();
  if (!available) return [];
  const { data, error } = await supabaseAdmin
    .from("decision_object_learnings")
    .select("id, actual_result, gap_reason, updated_rule, created_at")
    .eq("user_id", userId)
    .eq("object_type", type)
    .eq("object_id", id)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingWorkbenchSchemaError(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as WorkbenchDetail["learnings"];
}

export async function getWorkbenchDetail(
  userId: string,
  type: WorkbenchObjectType,
  id: string,
  today: string
): Promise<WorkbenchDetail | null> {
  if (!DECISION_OBJECT_TYPES.includes(type)) return null;

  let object: WorkbenchObject | null = null;
  const evidence: WorkbenchDetail["evidence"] = [];
  let hints:
    | Parameters<typeof signalForObject>[2]
    | undefined;

  if (type === "reality_case") {
    const { getRealityCase } = await import("../reality/queries");
    const item = await getRealityCase(id, userId);
    if (!item) return null;
    const latest = item.versions[0];
    object = baseObject({
      object_type: "reality_case",
      object_id: item.id,
      title: item.title,
      primary_module: "reality",
      href: `/reality/${item.id}`,
      last_activity_at: item.updated_at,
    });
    if (latest) {
      evidence.push({
        label: "现状地图",
        text: `版本 ${latest.version_no}：事实 ${latest.map.facts.length} 条，未知 ${latest.map.unknowns.length} 条`,
        href: `/reality/${item.id}`,
      });
      hints = {
        factCount: latest.map.facts.length,
        unknownCount: latest.map.unknowns.length,
        interpretationCount: latest.map.interpretations.length,
        sourceRealityVersionId: latest.id,
        hasEmotionOrContradiction:
          latest.map.emotions.length > 0 ||
          latest.map.contradictions.length > 0,
      };
    }
  } else if (type === "idea") {
    const { data, error } = await supabaseAdmin
      .from("ideas")
      .select("id, title, status, hypothesis, last_activity_at, user_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || data.user_id !== userId) return null;
    object = baseObject({
      object_type: "idea",
      object_id: data.id as string,
      title: safeTitle(data.title, "未命名想法"),
      primary_module: "ideas",
      href: `/ideas/${data.id}`,
      last_activity_at: data.last_activity_at as string,
    });
    evidence.push({
      label: "想法状态",
      text: String(data.status),
      href: `/ideas/${data.id}`,
    });
  } else if (type === "customer_case") {
    const { data, error } = await supabaseAdmin
      .from("customer_cases")
      .select("id, title, updated_at, user_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || data.user_id !== userId) return null;
    object = baseObject({
      object_type: "customer_case",
      object_id: data.id as string,
      title: safeTitle(data.title, "顾客研究"),
      primary_module: "customer-view",
      href: `/customer-view/${data.id}`,
      last_activity_at: data.updated_at as string,
    });
  } else if (type === "dream_branch") {
    const { data, error } = await supabaseAdmin
      .from("dream_branches")
      .select("id, case_id, name, updated_at, user_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || data.user_id !== userId) return null;
    object = baseObject({
      object_type: "dream_branch",
      object_id: data.id as string,
      title: safeTitle(data.name, "梦想分支"),
      primary_module: "dreams",
      href: `/dreams/${data.case_id}`,
      last_activity_at: data.updated_at as string,
    });
  } else if (type === "decision_closure") {
    const { data, error } = await supabaseAdmin
      .from("decision_closures")
      .select(
        "id, object_type, object_id, origin_module, title, current_judgment, critical_unknowns, options, selected_next_step, completion_criterion, expected_feedback, due_on, basis_refs, status, created_at, closed_at"
      )
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const closure = data as unknown as DecisionClosure;
    object = baseObject({
      object_type: "decision_closure",
      object_id: closure.id,
      title: closure.title,
      primary_module: closure.origin_module,
      href: objectHref(closure.object_type as WorkbenchObjectType, closure.object_id),
      last_activity_at: closure.created_at,
    });
    object.current_closure = closure.status === "active" ? closure : null;
  } else {
    const objects = await listWorkbenchObjects(userId, today);
    object =
      objects.find(
        (item) => item.object_type === type && item.object_id === id
      ) ?? null;
  }

  if (!object) return null;
  const closures = await listClosuresForWorkbenchObject(userId, type, id);
  object.current_closure =
    closures.find((closure) => closure.status === "active") ??
    object.current_closure;

  return {
    object,
    signal: signalForObject(object, today, hints),
    evidence,
    closures,
    learnings: await listLearnings(userId, type, id),
  };
}
