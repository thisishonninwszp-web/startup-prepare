"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  buildInsightStory,
  buildVisionStory,
  compareConceptVersions,
  generateActionValues,
  generateConceptCandidates,
  generateLandingPageConcept,
  type ConceptCustomerEvidence,
} from "@/lib/ai";
import { parseDreamVision } from "@/app/(app)/dreams/types";
import { parseCustomerProxy } from "@/app/(app)/customer-view/types";
import {
  evaluateConceptConfirmation,
  parseConceptCandidates,
  parseConceptSynthesis,
  stripBayesianPercentages,
  validateConceptCitations,
  type ConceptStoryType,
} from "./types";

const CONCEPT_PROMPT_VERSION = "concept-v1";

type DraftSource = {
  source_type: string;
  source_id: string;
  snapshot: unknown;
};

async function requireUserId() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

function cleanText(value: string, label: string, max = 5000) {
  const text = value.trim();
  if (!text) throw new Error(`${label}不能为空`);
  if (text.length > max) throw new Error(`${label}不能超过${max}字`);
  return text;
}

async function requireIdea(ideaId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("ideas")
    .select("id, user_id, title, status, hypothesis, tags")
    .eq("id", ideaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) throw new Error("无权访问该想法");
  return data;
}

async function ensureWorkspace(ideaId: string, userId: string) {
  await requireIdea(ideaId, userId);
  const { data, error } = await supabaseAdmin
    .from("concept_workspaces")
    .upsert(
      {
        idea_id: ideaId,
        user_id: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "idea_id" }
    )
    .select(
      "id, idea_id, user_id, customer_proxy_version_id, dream_version_id, reframing_session_id, fermi_estimate_id, bayesian_belief_id, question_candidates, central_question_type, central_question, story_type, draft, draft_sources"
    )
    .single();
  if (error) throw new Error(error.message);
  if (data.user_id !== userId) throw new Error("无权访问该价值设计图");
  return data;
}

async function assertOwnedReference(
  table: string,
  id: string,
  userId: string,
  options?: { parentTable?: string; foreignKey?: string }
) {
  if (!options?.parentTable || !options.foreignKey) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select("id, user_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || data.user_id !== userId) {
      throw new Error("引用来源不属于当前用户");
    }
    return;
  }

  const { data, error } = await supabaseAdmin
    .from(table)
    .select(`id, ${options.foreignKey}`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const parentId = data
    ? (data as unknown as Record<string, unknown>)[options.foreignKey]
    : null;
  if (typeof parentId !== "string") {
    throw new Error("引用来源不属于当前用户");
  }

  const { data: parent, error: parentError } = await supabaseAdmin
    .from(options.parentTable)
    .select("id, user_id")
    .eq("id", parentId)
    .maybeSingle();
  if (parentError) throw new Error(parentError.message);
  if (!parent || parent.user_id !== userId) {
    throw new Error("引用来源不属于当前用户");
  }
}

export async function saveConceptSelections(
  ideaId: string,
  input: {
    customerProxyVersionId?: string | null;
    dreamVersionId?: string | null;
    reframingSessionId: string;
    fermiEstimateId?: string | null;
    bayesianBeliefId?: string | null;
    storyType: ConceptStoryType;
  }
) {
  const userId = await requireUserId();
  if (
    input.storyType !== "insight" &&
    input.storyType !== "vision" &&
    input.storyType !== "integrated"
  ) {
    throw new Error("概念故事类型无效");
  }
  const workspace = await ensureWorkspace(ideaId, userId);
  if (input.customerProxyVersionId) {
    await assertOwnedReference(
      "customer_proxy_versions",
      input.customerProxyVersionId,
      userId,
      { parentTable: "customer_cases", foreignKey: "case_id" }
    );
  }
  if (input.dreamVersionId) {
    await assertOwnedReference(
      "dream_versions",
      input.dreamVersionId,
      userId,
      { parentTable: "dream_cases", foreignKey: "case_id" }
    );
  }
  const { data: reframing, error: reframingError } = await supabaseAdmin
    .from("reframing_sessions")
    .select(
      "id, user_id, idea_id, central_question_candidates, selected_question_type, selected_question"
    )
    .eq("id", input.reframingSessionId)
    .maybeSingle();
  if (reframingError) throw new Error(reframingError.message);
  if (
    !reframing ||
    reframing.user_id !== userId ||
    reframing.idea_id !== ideaId ||
    !reframing.selected_question
  ) {
    throw new Error("请选择属于该想法且已收敛的问题");
  }
  if (input.fermiEstimateId) {
    await assertOwnedReference(
      "fermi_estimates",
      input.fermiEstimateId,
      userId
    );
  }
  if (input.bayesianBeliefId) {
    await assertOwnedReference(
      "bayesian_beliefs",
      input.bayesianBeliefId,
      userId
    );
  }
  const { error } = await supabaseAdmin
    .from("concept_workspaces")
    .update({
      customer_proxy_version_id: input.customerProxyVersionId || null,
      dream_version_id: input.dreamVersionId || null,
      reframing_session_id: input.reframingSessionId,
      fermi_estimate_id: input.fermiEstimateId || null,
      bayesian_belief_id: input.bayesianBeliefId || null,
      question_candidates: reframing.central_question_candidates,
      central_question_type: reframing.selected_question_type,
      central_question: reframing.selected_question,
      story_type: input.storyType,
      draft: null,
      draft_sources: [],
      updated_at: new Date().toISOString(),
    })
    .eq("id", workspace.id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/ideas/${ideaId}/concept`);
}

export async function addCompanyFact(ideaId: string, fact: string) {
  const userId = await requireUserId();
  await requireIdea(ideaId, userId);
  const { data, error } = await supabaseAdmin
    .from("idea_company_facts")
    .insert({
      idea_id: ideaId,
      user_id: userId,
      fact: cleanText(fact, "公司事实", 1000),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(`/ideas/${ideaId}/concept`);
  return data.id as string;
}

export async function archiveCompanyFact(ideaId: string, factId: string) {
  const userId = await requireUserId();
  await requireIdea(ideaId, userId);
  const { error } = await supabaseAdmin
    .from("idea_company_facts")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", factId)
    .eq("idea_id", ideaId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/ideas/${ideaId}/concept`);
}

async function loadCustomerBundle(
  proxyVersionId: string,
  userId: string
): Promise<{
  evidence: ConceptCustomerEvidence[];
  sources: DraftSource[];
  materialIds: string[];
  hasConclusion: boolean;
}> {
  const { data: version, error } = await supabaseAdmin
    .from("customer_proxy_versions")
    .select(
      "id, case_id, research_run_id, version_no, selected_segment, proxy, customer_cases!inner(user_id, title)"
    )
    .eq("id", proxyVersionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const customerCase = Array.isArray(version?.customer_cases)
    ? version?.customer_cases[0]
    : version?.customer_cases;
  if (!version || customerCase?.user_id !== userId) {
    throw new Error("无权引用该顾客代理");
  }
  const { data: run, error: runError } = await supabaseAdmin
    .from("customer_research_runs")
    .select("id, evidence_ids")
    .eq("id", version.research_run_id)
    .maybeSingle();
  if (runError) throw new Error(runError.message);
  if (!run) throw new Error("顾客研究批次不存在");
  const segmentIds = new Set(
    Array.isArray(version.selected_segment?.evidence_ids)
      ? (version.selected_segment.evidence_ids as string[])
      : []
  );
  const evidenceIds = ((run.evidence_ids ?? []) as string[]).filter((id) =>
    segmentIds.has(id)
  );
  if (evidenceIds.length === 0) throw new Error("该顾客声音没有可用证据");
  const { data: atoms, error: atomError } = await supabaseAdmin
    .from("customer_evidence_atoms")
    .select(
      "id, material_id, quote, scene, behavior, alternative, tradeoff, emotion, emotion_basis"
    )
    .eq("user_id", userId)
    .in("id", evidenceIds);
  if (atomError) throw new Error(atomError.message);
  const { data: keptLinks, error: linkError } = await supabaseAdmin
    .from("customer_case_materials")
    .select("material_id")
    .eq("case_id", version.case_id)
    .eq("status", "kept");
  if (linkError) throw new Error(linkError.message);
  const keptIds = new Set(
    (keptLinks ?? []).map((item) => item.material_id as string)
  );
  const keptAtoms = (atoms ?? []).filter((atom) =>
    keptIds.has(atom.material_id)
  );
  const materialIds = Array.from(
    new Set(keptAtoms.map((atom) => atom.material_id as string))
  );
  const { data: materials, error: materialError } = materialIds.length
    ? await supabaseAdmin
        .from("customer_materials")
        .select(
          "id, title, source, source_url, sanitized_text, market, language, created_at"
        )
        .eq("user_id", userId)
        .in("id", materialIds)
    : { data: [], error: null };
  if (materialError) throw new Error(materialError.message);
  const { data: conclusion, error: conclusionError } = await supabaseAdmin
    .from("customer_conclusions")
    .select(
      "id, original_misunderstanding, updated_understanding, still_unknown, contact_person, one_question, created_at"
    )
    .eq("proxy_version_id", proxyVersionId)
    .maybeSingle();
  if (conclusionError) throw new Error(conclusionError.message);
  const sources: DraftSource[] = [
    {
      source_type: "customer_proxy",
      source_id: version.id,
      snapshot: {
        case_title: customerCase.title,
        version_no: version.version_no,
        selected_segment: version.selected_segment,
        proxy: parseCustomerProxy(version.proxy),
      },
    },
    ...((materials ?? []).map((material) => ({
      source_type: "customer_material",
      source_id: material.id as string,
      snapshot: material,
    })) satisfies DraftSource[]),
    ...(keptAtoms.map((atom) => ({
      source_type: "customer_evidence",
      source_id: atom.id as string,
      snapshot: atom,
    })) satisfies DraftSource[]),
  ];
  if (conclusion) {
    sources.push({
      source_type: "customer_conclusion",
      source_id: conclusion.id,
      snapshot: conclusion,
    });
  }
  return {
    evidence: keptAtoms.map((atom) => ({
      id: atom.id,
      quote: atom.quote,
      scene: atom.scene,
      behavior: atom.behavior,
      alternative: atom.alternative,
      tradeoff: atom.tradeoff,
      emotion: atom.emotion,
      emotion_basis: atom.emotion_basis,
    })),
    sources,
    materialIds,
    hasConclusion: Boolean(conclusion),
  };
}

async function loadDreamBundle(dreamVersionId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("dream_versions")
    .select(
      "id, case_id, version_no, vision, delta, created_at, dream_cases!inner(user_id, title, context, scale)"
    )
    .eq("id", dreamVersionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const dreamCase = Array.isArray(data?.dream_cases)
    ? data?.dream_cases[0]
    : data?.dream_cases;
  if (!data || dreamCase?.user_id !== userId) {
    throw new Error("无权引用该梦想版本");
  }
  const vision = parseDreamVision(data.vision);
  return {
    vision,
    source: {
      source_type: "dream",
      source_id: data.id,
      snapshot: {
        title: dreamCase.title,
        context: dreamCase.context,
        scale: dreamCase.scale,
        version_no: data.version_no,
        vision,
        delta: data.delta,
        created_at: data.created_at,
      },
    } satisfies DraftSource,
  };
}

async function loadReframingBundle(
  sessionId: string,
  ideaId: string,
  userId: string
) {
  const { data, error } = await supabaseAdmin
    .from("reframing_sessions")
    .select(
      "id, user_id, idea_id, topic_text, context_note, central_question_candidates, selected_question_type, selected_question"
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (
    !data ||
    data.user_id !== userId ||
    data.idea_id !== ideaId ||
    !data.selected_question
  ) {
    throw new Error("Central Question来源无效");
  }
  const { data: marked, error: frameError } = await supabaseAdmin
    .from("reframing_frames")
    .select("id, frame_type, title, description")
    .eq("session_id", sessionId)
    .eq("is_marked", true);
  if (frameError) throw new Error(frameError.message);
  return {
    centralQuestion: {
      type: data.selected_question_type as string,
      question: data.selected_question as string,
    },
    source: {
      source_type: "reframing",
      source_id: data.id,
      snapshot: {
        topic_text: data.topic_text,
        context_note: data.context_note,
        candidates: data.central_question_candidates,
        selected_question_type: data.selected_question_type,
        selected_question: data.selected_question,
        marked_frames: marked ?? [],
      },
    } satisfies DraftSource,
  };
}

async function loadFermiSource(id: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("fermi_estimates")
    .select(
      "id, user_id, question, category, final_low, final_high, unit, ai_teaching, fermi_components(label, rationale, low, high, user_note, sensitivity)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) throw new Error("无权引用该费米估算");
  return {
    source_type: "fermi",
    source_id: data.id,
    snapshot: {
      question: data.question,
      category: data.category,
      final_low: data.final_low,
      final_high: data.final_high,
      unit: data.unit,
      teaching: data.ai_teaching,
      components: data.fermi_components,
    },
  } satisfies DraftSource;
}

async function loadBayesianSource(id: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("bayesian_beliefs")
    .select(
      "id, user_id, question, bayesian_updates(evidence_text, ai_explanation, recorded_at)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) throw new Error("无权引用该信念");
  return {
    source_type: "bayesian",
    source_id: data.id,
    snapshot: stripBayesianPercentages({
      question: data.question,
      updates: data.bayesian_updates,
    }),
  } satisfies DraftSource;
}

export async function generateConceptDraft(ideaId: string) {
  const userId = await requireUserId();
  const idea = await requireIdea(ideaId, userId);
  const workspace = await ensureWorkspace(ideaId, userId);
  if (!workspace.reframing_session_id || !workspace.central_question) {
    throw new Error("请先选择已收敛Central Question的重构会话");
  }
  const storyType = workspace.story_type as ConceptStoryType;
  if (
    (storyType === "insight" || storyType === "integrated") &&
    !workspace.customer_proxy_version_id
  ) {
    throw new Error("洞察型概念需要选择顾客代理");
  }
  if (
    (storyType === "vision" || storyType === "integrated") &&
    !workspace.dream_version_id
  ) {
    throw new Error("愿景型概念需要选择梦想版本");
  }

  const sources: DraftSource[] = [
    {
      source_type: "idea",
      source_id: idea.id,
      snapshot: {
        title: idea.title,
        status: idea.status,
        hypothesis: idea.hypothesis,
        tags: idea.tags,
      },
    },
  ];
  const reframing = await loadReframingBundle(
    workspace.reframing_session_id,
    ideaId,
    userId
  );
  sources.push(reframing.source);

  let customer:
    | Awaited<ReturnType<typeof loadCustomerBundle>>
    | null = null;
  if (workspace.customer_proxy_version_id) {
    customer = await loadCustomerBundle(
      workspace.customer_proxy_version_id,
      userId
    );
    sources.push(...customer.sources);
  }
  let dream: Awaited<ReturnType<typeof loadDreamBundle>> | null = null;
  if (workspace.dream_version_id) {
    dream = await loadDreamBundle(workspace.dream_version_id, userId);
    sources.push(dream.source);
  }
  if (workspace.fermi_estimate_id) {
    sources.push(
      await loadFermiSource(workspace.fermi_estimate_id, userId)
    );
  }
  if (workspace.bayesian_belief_id) {
    sources.push(
      await loadBayesianSource(workspace.bayesian_belief_id, userId)
    );
  }
  const { data: facts, error: factError } = await supabaseAdmin
    .from("idea_company_facts")
    .select("id, fact, created_at")
    .eq("idea_id", ideaId)
    .eq("user_id", userId)
    .is("archived_at", null);
  if (factError) throw new Error(factError.message);
  for (const fact of facts ?? []) {
    sources.push({
      source_type: "company_fact",
      source_id: fact.id,
      snapshot: fact,
    });
  }

  const [insightStory, visionStory] = await Promise.all([
    customer ? buildInsightStory(customer.evidence) : Promise.resolve(null),
    dream
      ? buildVisionStory(dream.source.source_id, dream.vision, {
          title: idea.title,
          hypothesis: idea.hypothesis,
        })
      : Promise.resolve(null),
  ]);
  const synthesis = await generateConceptCandidates({
    centralQuestion: reframing.centralQuestion,
    storyType,
    insightStory,
    visionStory,
    companyFacts: (facts ?? []).map((fact) => ({
      id: fact.id,
      fact: fact.fact,
    })),
    customerEvidenceIds: customer?.evidence.map((item) => item.id) ?? [],
  });
  const draft = {
    central_question: reframing.centralQuestion,
    insight_story: insightStory,
    vision_story: visionStory,
    benefit_chain: synthesis.benefit_chain,
    candidates: synthesis.candidates,
    customer_material_ids: customer?.materialIds ?? [],
    has_customer_conclusion: customer?.hasConclusion ?? false,
    company_fact_ids: (facts ?? []).map((fact) => fact.id),
  };
  const { error } = await supabaseAdmin
    .from("concept_workspaces")
    .update({
      draft,
      draft_sources: sources,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workspace.id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/ideas/${ideaId}/concept`);
  return draft;
}

export async function createConceptVersion(
  ideaId: string,
  selectedConceptValue: unknown,
  personalResonance: boolean | null,
  changeReason = ""
) {
  const userId = await requireUserId();
  const workspace = await ensureWorkspace(ideaId, userId);
  if (!workspace.draft || !Array.isArray(workspace.draft_sources)) {
    throw new Error("请先生成价值设计草稿");
  }
  const draftObject = workspace.draft as Record<string, unknown>;
  const synthesis = parseConceptSynthesis({
    benefit_chain: draftObject.benefit_chain,
    candidates: draftObject.candidates,
  });
  const selectedConcept = parseConceptCandidates({
    candidates: [selectedConceptValue],
  }).candidates[0];
  const sources = workspace.draft_sources as DraftSource[];
  const customerEvidenceIds = sources
    .filter((source) => source.source_type === "customer_evidence")
    .map((source) => source.source_id);
  const companyFactIds = sources
    .filter((source) => source.source_type === "company_fact")
    .map((source) => source.source_id);
  validateConceptCitations(
    selectedConcept.customer_evidence_ids,
    customerEvidenceIds
  );
  validateConceptCitations(
    selectedConcept.company_fact_ids,
    companyFactIds
  );
  const { error: pendingInputError } = await supabaseAdmin
    .from("concept_workspaces")
    .update({
      draft: {
        ...draftObject,
        pending_selected_concept: selectedConcept,
        pending_personal_resonance: personalResonance,
        pending_change_reason: changeReason,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", workspace.id)
    .eq("user_id", userId);
  if (pendingInputError) throw new Error(pendingInputError.message);
  const confirmation = evaluateConceptConfirmation({
    keptMaterialIds: sources
      .filter((source) => source.source_type === "customer_material")
      .map((source) => source.source_id),
    hasCustomerConclusion: sources.some(
      (source) => source.source_type === "customer_conclusion"
    ),
    companyFactIds,
    centralQuestion: String(
      (draftObject.central_question as Record<string, unknown>)?.question ?? ""
    ),
  });
  const gaps = [...confirmation.missing];
  if (!sources.some((source) => source.source_type === "fermi")) {
    gaps.push("Scalable：尚未关联费米估算");
  }
  gaps.push("Simple：尚未记录真人复述");

  const { data: previous, error: previousError } = await supabaseAdmin
    .from("concept_versions")
    .select(
      "id, central_question, insight_story, vision_story, benefit_chain, selected_concept, evidence_gaps"
    )
    .eq("workspace_id", workspace.id)
    .eq("user_id", userId)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousError) throw new Error(previousError.message);
  const currentSnapshot = {
    central_question: draftObject.central_question,
    insight_story: draftObject.insight_story,
    vision_story: draftObject.vision_story,
    benefit_chain: synthesis.benefit_chain,
    selected_concept: selectedConcept,
    evidence_gaps: gaps,
  };
  const delta = previous
    ? await compareConceptVersions(previous, currentSnapshot, changeReason)
    : null;
  const payload = {
    story_type: selectedConcept.story_type,
    central_question: draftObject.central_question,
    insight_story: draftObject.insight_story,
    vision_story: draftObject.vision_story,
    benefit_chain: synthesis.benefit_chain,
    candidates: synthesis.candidates,
    selected_concept: selectedConcept,
    evidence_gaps: gaps,
    personal_resonance: personalResonance,
    delta,
    prompt_version: CONCEPT_PROMPT_VERSION,
  };
  const { data, error } = await supabaseAdmin.rpc("create_concept_version", {
    p_workspace_id: workspace.id,
    p_user_id: userId,
    p_payload: payload,
    p_sources: sources,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/ideas/${ideaId}`);
  revalidatePath(`/ideas/${ideaId}/concept`);
  return data as string;
}

export async function confirmConceptVersion(
  ideaId: string,
  conceptVersionId: string
) {
  const userId = await requireUserId();
  await requireIdea(ideaId, userId);
  const { data, error } = await supabaseAdmin
    .from("concept_versions")
    .select("id, idea_id, user_id")
    .eq("id", conceptVersionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId || data.idea_id !== ideaId) {
    throw new Error("无权确认该产品概念");
  }
  const { error: rpcError } = await supabaseAdmin.rpc(
    "confirm_concept_version",
    {
      p_concept_version_id: conceptVersionId,
      p_user_id: userId,
    }
  );
  if (rpcError) throw new Error(rpcError.message);
  revalidatePath(`/ideas/${ideaId}`);
  revalidatePath(`/ideas/${ideaId}/concept`);
}

export async function recordConceptComprehension(
  ideaId: string,
  conceptVersionId: string,
  repeatedWords: string,
  capturedCore: boolean
) {
  const userId = await requireUserId();
  await requireIdea(ideaId, userId);
  const { data: version, error } = await supabaseAdmin
    .from("concept_versions")
    .select("id, idea_id, user_id")
    .eq("id", conceptVersionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (
    !version ||
    version.user_id !== userId ||
    version.idea_id !== ideaId
  ) {
    throw new Error("无权记录该复述");
  }
  const { error: insertError } = await supabaseAdmin
    .from("concept_comprehension_tests")
    .insert({
      concept_version_id: conceptVersionId,
      user_id: userId,
      repeated_words: cleanText(repeatedWords, "真人复述", 2000),
      captured_core: capturedCore,
    });
  if (insertError) throw new Error(insertError.message);
  revalidatePath(`/ideas/${ideaId}/concept`);
}

export async function generateConceptDerivatives(
  ideaId: string,
  conceptVersionId: string
) {
  const userId = await requireUserId();
  await requireIdea(ideaId, userId);
  const { data: version, error } = await supabaseAdmin
    .from("concept_versions")
    .select(
      "id, idea_id, user_id, status, central_question, insight_story, vision_story, benefit_chain, selected_concept"
    )
    .eq("id", conceptVersionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (
    !version ||
    version.user_id !== userId ||
    version.idea_id !== ideaId
  ) {
    throw new Error("无权使用该产品概念");
  }
  if (version.status !== "confirmed") {
    throw new Error("只有已确认产品概念才能生成派生层");
  }
  const snapshot = {
    central_question: version.central_question,
    insight_story: version.insight_story,
    vision_story: version.vision_story,
    benefit_chain: version.benefit_chain,
    selected_concept: version.selected_concept,
  };
  const [landingPage, actionValues] = await Promise.all([
    generateLandingPageConcept(conceptVersionId, snapshot),
    generateActionValues(snapshot),
  ]);
  const { data: previous, error: previousError } = await supabaseAdmin
    .from("concept_derivative_versions")
    .select("version_no")
    .eq("concept_version_id", conceptVersionId)
    .eq("user_id", userId)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousError) throw new Error(previousError.message);
  const { error: insertError } = await supabaseAdmin
    .from("concept_derivative_versions")
    .insert({
      concept_version_id: conceptVersionId,
      user_id: userId,
      version_no: (previous?.version_no ?? 0) + 1,
      landing_page: landingPage,
      action_values: actionValues,
      prompt_version: CONCEPT_PROMPT_VERSION,
    });
  if (insertError) throw new Error(insertError.message);
  revalidatePath(`/ideas/${ideaId}/concept`);
}
