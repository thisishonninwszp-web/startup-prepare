import { supabaseAdmin } from "@/lib/supabase";
import {
  parseCustomerPatternReport,
  parseCustomerProxy,
  parseCustomerProxyDelta,
  parseCustomerSegments,
  type CustomerEvidenceAtom,
  type CustomerMarket,
  type CustomerMaterialOrigin,
  type CustomerProxyDelta,
  type CustomerReviewStatus,
  type CustomerSegment,
} from "./types";

function one(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export type CustomerCaseListItem = {
  id: string;
  title: string;
  customer_hypothesis: string;
  markets: CustomerMarket[];
  updated_at: string;
  kept_count: number;
  candidate_count: number;
  proxy_count: number;
};

export type CustomerMaterialListItem = {
  id: string;
  origin: CustomerMaterialOrigin;
  source: string;
  source_url: string | null;
  title: string | null;
  sanitized_text: string;
  market: CustomerMarket | null;
  language: string | null;
  created_at: string;
  case_id: string;
  case_title: string;
  status: CustomerReviewStatus;
};

export async function listCustomerCases(
  userId: string
): Promise<CustomerCaseListItem[]> {
  const { data, error } = await supabaseAdmin
    .from("customer_cases")
    .select(
      "id, title, customer_hypothesis, markets, updated_at, customer_case_materials(status), customer_proxy_versions(id)"
    )
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const links = Array.isArray(row.customer_case_materials)
      ? row.customer_case_materials
      : [];
    const versions = Array.isArray(row.customer_proxy_versions)
      ? row.customer_proxy_versions
      : [];
    return {
      id: row.id,
      title: row.title,
      customer_hypothesis: row.customer_hypothesis,
      markets: row.markets ?? [],
      updated_at: row.updated_at,
      kept_count: links.filter((link) => link.status === "kept").length,
      candidate_count: links.filter((link) => link.status === "candidate").length,
      proxy_count: versions.length,
    };
  });
}

export async function listCustomerMaterials(
  userId: string,
  status?: CustomerReviewStatus
): Promise<CustomerMaterialListItem[]> {
  const { data: cases, error: caseError } = await supabaseAdmin
    .from("customer_cases")
    .select("id, title")
    .eq("user_id", userId);
  if (caseError) throw new Error(caseError.message);
  const caseMap = new Map((cases ?? []).map((item) => [item.id, item.title]));
  const caseIds = Array.from(caseMap.keys());
  if (caseIds.length === 0) return [];

  let linkQuery = supabaseAdmin
    .from("customer_case_materials")
    .select("case_id, material_id, status")
    .in("case_id", caseIds);
  if (status) linkQuery = linkQuery.eq("status", status);
  const { data: links, error: linkError } = await linkQuery
    .order("added_at", { ascending: false })
    .limit(300);
  if (linkError) throw new Error(linkError.message);
  const materialIds = Array.from(
    new Set((links ?? []).map((link) => link.material_id as string))
  );
  if (materialIds.length === 0) return [];

  const { data: materials, error } = await supabaseAdmin
    .from("customer_materials")
    .select(
      "id, origin, source, source_url, title, sanitized_text, market, language, created_at"
    )
    .eq("user_id", userId)
    .in("id", materialIds);
  if (error) throw new Error(error.message);
  const materialMap = new Map((materials ?? []).map((item) => [item.id, item]));

  return (links ?? []).flatMap((link) => {
    const material = materialMap.get(link.material_id);
    if (!material) return [];
    return [
      {
        ...material,
        case_id: link.case_id as string,
        case_title: caseMap.get(link.case_id) ?? "未知课题",
        status: link.status as CustomerReviewStatus,
      } as CustomerMaterialListItem,
    ];
  });
}

export async function listCustomerTopics(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("customer_research_topics")
    .select(
      "id, case_id, query, markets, cadence, enabled, last_run_at, next_run_at, last_error, customer_cases!inner(title, user_id)"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    case_id: row.case_id as string,
    case_title: String(one(row.customer_cases)?.title ?? "未知课题"),
    query: row.query as string,
    markets: (row.markets ?? []) as CustomerMarket[],
    cadence: row.cadence as "daily" | "weekly",
    enabled: row.enabled as boolean,
    last_run_at: row.last_run_at as string | null,
    next_run_at: row.next_run_at as string,
    last_error: row.last_error as string | null,
  }));
}

export async function listCustomerIdeas(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("ideas")
    .select("id, title, status")
    .eq("user_id", userId)
    .neq("status", "归档")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map((idea) => ({
    id: idea.id as string,
    title: (idea.title as string | null)?.trim() || "无标题",
    status: idea.status as string,
  }));
}

export async function getCustomerCaseDetail(caseId: string, userId: string) {
  const { data: customerCase, error } = await supabaseAdmin
    .from("customer_cases")
    .select(
      "id, user_id, idea_id, title, customer_hypothesis, problem_context, markets, original_belief, created_at, updated_at"
    )
    .eq("id", caseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!customerCase || customerCase.user_id !== userId) return null;

  const [
    { data: links, error: linksError },
    { data: runs, error: runsError },
    { data: versions, error: versionsError },
    { data: topics, error: topicsError },
  ] = await Promise.all([
    supabaseAdmin
      .from("customer_case_materials")
      .select(
        "material_id, status, reviewed_at, customer_materials!inner(id, origin, source, source_url, title, sanitized_text, market, language, created_at)"
      )
      .eq("case_id", caseId)
      .order("added_at", { ascending: false }),
    supabaseAdmin
      .from("customer_research_runs")
      .select("id, evidence_ids, segments, created_at")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("customer_proxy_versions")
      .select(
        "id, research_run_id, version_no, selected_segment, proxy, delta, is_provisional, created_at"
      )
      .eq("case_id", caseId)
      .order("version_no", { ascending: false }),
    supabaseAdmin
      .from("customer_research_topics")
      .select(
        "id, query, markets, cadence, enabled, last_run_at, next_run_at, last_error"
      )
      .eq("case_id", caseId)
      .order("created_at", { ascending: false }),
  ]);
  if (linksError) throw new Error(linksError.message);
  if (runsError) throw new Error(runsError.message);
  if (versionsError) throw new Error(versionsError.message);
  if (topicsError) throw new Error(topicsError.message);

  const materialIds = (links ?? []).map((link) => link.material_id as string);
  const { data: atoms, error: atomError } = materialIds.length
    ? await supabaseAdmin
        .from("customer_evidence_atoms")
        .select(
          "id, material_id, quote, scene, behavior, alternative, tradeoff, emotion, emotion_basis"
        )
        .eq("user_id", userId)
        .in("material_id", materialIds)
    : { data: [], error: null };
  if (atomError) throw new Error(atomError.message);

  const versionIds = (versions ?? []).map((version) => version.id as string);
  const [
    { data: sessions, error: sessionsError },
    { data: conclusions, error: conclusionsError },
  ] = versionIds.length
    ? await Promise.all([
        supabaseAdmin
          .from("customer_proxy_sessions")
          .select("id, proxy_version_id, mode, messages, idea_snapshot, created_at")
          .in("proxy_version_id", versionIds)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("customer_conclusions")
          .select(
            "proxy_version_id, original_misunderstanding, updated_understanding, still_unknown, contact_person, one_question"
          )
          .in("proxy_version_id", versionIds),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (sessionsError) throw new Error(sessionsError.message);
  if (conclusionsError) throw new Error(conclusionsError.message);

  return {
    id: customerCase.id as string,
    idea_id: customerCase.idea_id as string | null,
    title: customerCase.title as string,
    customer_hypothesis: customerCase.customer_hypothesis as string,
    problem_context: customerCase.problem_context as string,
    markets: (customerCase.markets ?? []) as CustomerMarket[],
    original_belief: customerCase.original_belief as string,
    created_at: customerCase.created_at as string,
    materials: (links ?? []).map((link) => {
      const material = one(link.customer_materials)!;
      return {
        id: material.id as string,
        origin: material.origin as CustomerMaterialOrigin,
        source: material.source as string,
        source_url: material.source_url as string | null,
        title: material.title as string | null,
        sanitized_text: material.sanitized_text as string,
        market: material.market as CustomerMarket | null,
        language: material.language as string | null,
        created_at: material.created_at as string,
        status: link.status as CustomerReviewStatus,
      };
    }),
    atoms: (atoms ?? []) as CustomerEvidenceAtom[],
    runs: (runs ?? []).map((run) => ({
      id: run.id as string,
      evidence_ids: (run.evidence_ids ?? []) as string[],
      segments: parseCustomerSegments(run.segments).segments,
      created_at: run.created_at as string,
    })),
    versions: (versions ?? []).map((version) => ({
      id: version.id as string,
      research_run_id: version.research_run_id as string,
      version_no: version.version_no as number,
      selected_segment: version.selected_segment as CustomerSegment,
      proxy: parseCustomerProxy(version.proxy),
      delta: version.delta
        ? parseCustomerProxyDelta(version.delta)
        : (null as CustomerProxyDelta | null),
      is_provisional: version.is_provisional as boolean,
      created_at: version.created_at as string,
      sessions: (sessions ?? []).filter(
        (session) => session.proxy_version_id === version.id
      ),
      conclusion:
        (conclusions ?? []).find(
          (conclusion) => conclusion.proxy_version_id === version.id
        ) ?? null,
    })),
    topics: topics ?? [],
  };
}

export type CustomerCaseDetail = NonNullable<
  Awaited<ReturnType<typeof getCustomerCaseDetail>>
>;

export async function listCustomerPatternReports(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("customer_pattern_reports")
    .select(
      "id, filters, report, evidence_ids, created_at, customer_opportunities(id, draft, created_idea_id)"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    filters: row.filters as Record<string, unknown>,
    report: parseCustomerPatternReport(row.report),
    evidence_ids: (row.evidence_ids ?? []) as string[],
    created_at: row.created_at as string,
    opportunities: Array.isArray(row.customer_opportunities)
      ? row.customer_opportunities
      : [],
  }));
}
