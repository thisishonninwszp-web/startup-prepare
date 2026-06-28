import { supabaseAdmin } from "@/lib/supabase";
import { listDreamVersionChoices } from "@/app/dreams/queries";
import {
  parseActionValues,
  parseCentralQuestions,
  parseConceptCandidates,
  parseConceptDelta,
  parseInsightStory,
  parseLandingPageConcept,
  parseVisionStory,
  type ConceptCandidate,
  type ConceptStoryType,
} from "./types";

function first(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function isMissingConceptWorkspacesTable(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    error.code === "PGRST205" &&
    error.message?.includes("concept_workspaces") === true
  );
}

export async function getConceptSchemaStatus(): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("concept_workspaces")
    .select("id")
    .limit(1);
  if (!error) return true;
  if (isMissingConceptWorkspacesTable(error)) return false;
  throw new Error(error.message);
}

export async function getConceptWorkspaceDetail(
  ideaId: string,
  userId: string
) {
  const { data: idea, error: ideaError } = await supabaseAdmin
    .from("ideas")
    .select("id, user_id, title, hypothesis, status, tags, created_at")
    .eq("id", ideaId)
    .maybeSingle();
  if (ideaError) throw new Error(ideaError.message);
  if (!idea || idea.user_id !== userId) return null;

  const [
    workspaceResult,
    factResult,
    customerCasesResult,
    reframingResult,
    fermiResult,
    bayesResult,
    dreamChoices,
  ] = await Promise.all([
    supabaseAdmin
      .from("concept_workspaces")
      .select(
        "id, customer_proxy_version_id, dream_version_id, reframing_session_id, fermi_estimate_id, bayesian_belief_id, question_candidates, central_question_type, central_question, story_type, draft, draft_sources, updated_at"
      )
      .eq("idea_id", ideaId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("idea_company_facts")
      .select("id, fact, created_at")
      .eq("idea_id", ideaId)
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("created_at"),
    supabaseAdmin
      .from("customer_cases")
      .select(
        "id, title, idea_id, customer_case_materials(status), customer_proxy_versions(id, version_no, selected_segment, is_provisional, created_at, customer_conclusions(id, updated_understanding, still_unknown, created_at))"
      )
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false }),
    supabaseAdmin
      .from("reframing_sessions")
      .select(
        "id, topic_text, selected_question_type, selected_question, central_question_candidates, created_at"
      )
      .eq("user_id", userId)
      .eq("idea_id", ideaId)
      .not("selected_question", "is", null)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("fermi_estimates")
      .select("id, question, final_low, final_high, unit, updated_at")
      .eq("user_id", userId)
      .eq("idea_id", ideaId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false }),
    supabaseAdmin
      .from("bayesian_beliefs")
      .select("id, question, updated_at")
      .eq("user_id", userId)
      .eq("idea_id", ideaId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false }),
    listDreamVersionChoices(userId),
  ]);
  for (const result of [
    workspaceResult,
    factResult,
    customerCasesResult,
    reframingResult,
    fermiResult,
    bayesResult,
  ]) {
    if (result.error) throw new Error(result.error.message);
  }

  const workspace = workspaceResult.data;
  let versions: Array<Record<string, unknown>> = [];
  let comprehension: Array<Record<string, unknown>> = [];
  let derivatives: Array<Record<string, unknown>> = [];
  if (workspace) {
    const [versionResult, comprehensionResult, derivativeResult] =
      await Promise.all([
        supabaseAdmin
          .from("concept_versions")
          .select(
            "id, previous_version_id, version_no, status, story_type, central_question, insight_story, vision_story, benefit_chain, candidates, selected_concept, evidence_gaps, personal_resonance, delta, created_at, confirmed_at"
          )
          .eq("workspace_id", workspace.id)
          .eq("user_id", userId)
          .order("version_no", { ascending: false }),
        supabaseAdmin
          .from("concept_comprehension_tests")
          .select(
            "id, concept_version_id, repeated_words, captured_core, created_at"
          )
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("concept_derivative_versions")
          .select(
            "id, concept_version_id, version_no, landing_page, action_values, created_at"
          )
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      ]);
    for (const result of [
      versionResult,
      comprehensionResult,
      derivativeResult,
    ]) {
      if (result.error) throw new Error(result.error.message);
    }
    versions = versionResult.data ?? [];
    const versionIds = new Set(versions.map((item) => item.id));
    comprehension = (comprehensionResult.data ?? []).filter((item) =>
      versionIds.has(item.concept_version_id)
    );
    derivatives = (derivativeResult.data ?? []).filter((item) =>
      versionIds.has(item.concept_version_id)
    );
  }

  const customerChoices = (customerCasesResult.data ?? []).flatMap((item) => {
    const links = Array.isArray(item.customer_case_materials)
      ? item.customer_case_materials
      : [];
    const keptCount = links.filter((link) => link.status === "kept").length;
    const proxyVersions = Array.isArray(item.customer_proxy_versions)
      ? item.customer_proxy_versions
      : [];
    return proxyVersions.map((version) => ({
      id: version.id as string,
      case_id: item.id as string,
      case_title: item.title as string,
      version_no: version.version_no as number,
      is_provisional: version.is_provisional as boolean,
      kept_count: keptCount,
      has_conclusion: Array.isArray(version.customer_conclusions)
        ? version.customer_conclusions.length > 0
        : Boolean(version.customer_conclusions),
      created_at: version.created_at as string,
    }));
  });

  return {
    idea: {
      id: idea.id as string,
      title: (idea.title as string | null)?.trim() || "无标题",
      hypothesis: idea.hypothesis,
      status: idea.status as string,
      tags: (idea.tags ?? []) as string[],
    },
    workspace: workspace
      ? {
          id: workspace.id as string,
          customer_proxy_version_id:
            workspace.customer_proxy_version_id as string | null,
          dream_version_id: workspace.dream_version_id as string | null,
          reframing_session_id:
            workspace.reframing_session_id as string | null,
          fermi_estimate_id: workspace.fermi_estimate_id as string | null,
          bayesian_belief_id:
            workspace.bayesian_belief_id as string | null,
          question_candidates: workspace.question_candidates
            ? parseCentralQuestions(workspace.question_candidates).candidates
            : null,
          central_question_type:
            workspace.central_question_type as string | null,
          central_question: workspace.central_question as string | null,
          story_type: workspace.story_type as ConceptStoryType,
          draft: workspace.draft,
          draft_sources: Array.isArray(workspace.draft_sources)
            ? workspace.draft_sources
            : [],
          updated_at: workspace.updated_at as string,
        }
      : null,
    facts: factResult.data ?? [],
    customerChoices,
    dreamChoices,
    reframingChoices: (reframingResult.data ?? []).map((item) => ({
      id: item.id as string,
      topic_text: item.topic_text as string,
      selected_question_type: item.selected_question_type as string,
      selected_question: item.selected_question as string,
      candidates: item.central_question_candidates
        ? parseCentralQuestions(item.central_question_candidates).candidates
        : [],
    })),
    fermiChoices: fermiResult.data ?? [],
    bayesChoices: bayesResult.data ?? [],
    versions: versions.map((version) => ({
      id: version.id as string,
      previous_version_id: version.previous_version_id as string | null,
      version_no: version.version_no as number,
      status: version.status as "provisional" | "confirmed",
      story_type: version.story_type as ConceptStoryType,
      central_question: version.central_question as {
        type: string;
        question: string;
      },
      insight_story: version.insight_story
        ? parseInsightStory(version.insight_story)
        : null,
      vision_story: version.vision_story
        ? parseVisionStory(version.vision_story)
        : null,
      benefit_chain: Array.isArray(version.benefit_chain)
        ? version.benefit_chain
        : [],
      candidates: parseConceptCandidates({
        candidates: version.candidates,
      }).candidates,
      selected_concept: version.selected_concept as ConceptCandidate,
      evidence_gaps: Array.isArray(version.evidence_gaps)
        ? version.evidence_gaps
        : [],
      personal_resonance: version.personal_resonance as boolean | null,
      delta: version.delta ? parseConceptDelta(version.delta) : null,
      created_at: version.created_at as string,
      confirmed_at: version.confirmed_at as string | null,
      comprehension_tests: comprehension.filter(
        (test) => test.concept_version_id === version.id
      ),
      derivatives: derivatives
        .filter(
          (derivative) =>
            derivative.concept_version_id === version.id
        )
        .map((derivative) => ({
          id: derivative.id,
          version_no: derivative.version_no,
          landing_page: parseLandingPageConcept(
            derivative.landing_page
          ),
          action_values: parseActionValues(
            derivative.action_values
          ),
          created_at: derivative.created_at,
        })),
    })),
  };
}

export type ConceptWorkspaceDetail = NonNullable<
  Awaited<ReturnType<typeof getConceptWorkspaceDetail>>
>;

export async function getIdeaConceptSummary(
  ideaId: string,
  userId: string
) {
  const { data: workspace, error } = await supabaseAdmin
    .from("concept_workspaces")
    .select("id")
    .eq("idea_id", ideaId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingConceptWorkspacesTable(error)) return null;
    throw new Error(error.message);
  }
  if (!workspace) return null;
  const [latestResult, confirmedResult] = await Promise.all([
    supabaseAdmin
      .from("concept_versions")
      .select("id, version_no, status, selected_concept, created_at")
      .eq("workspace_id", workspace.id)
      .eq("user_id", userId)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("concept_versions")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("user_id", userId)
      .eq("status", "confirmed"),
  ]);
  if (latestResult.error) throw new Error(latestResult.error.message);
  if (confirmedResult.error) throw new Error(confirmedResult.error.message);
  const data = latestResult.data;
  return data
    ? {
        id: data.id as string,
        version_no: data.version_no as number,
        status: data.status as "provisional" | "confirmed",
        one_line: first(data.selected_concept)?.one_line as string,
        created_at: data.created_at as string,
        has_confirmed: (confirmedResult.count ?? 0) > 0,
      }
    : null;
}
