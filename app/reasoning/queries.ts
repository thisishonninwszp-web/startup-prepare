import { supabaseAdmin } from "@/lib/supabase";
import type {
  BayesianBelief,
  BayesianBeliefWithHistory,
  BayesianUpdate,
  FermiComponent,
  FermiEstimate,
  FermiEstimateWithComponents,
  FirstPrinciplesNode,
  FirstPrinciplesSession,
  FirstPrinciplesSessionWithNodes,
  NodeBasisType,
  OutsideViewCheck,
  OutsideViewExample,
  OutsideViewSession,
  OutsideViewSessionWithItems,
  PrevalenceBucket,
  ReframingFrame,
  ReframingSession,
  ReframingSessionWithFrames,
} from "./types";

// ── Bayesian ──────────────────────────────────────────────────────────────────

export async function listBayesianBeliefs(
  userId: string
): Promise<(BayesianBelief & { current_posterior: number })[]> {
  const { data, error } = await supabaseAdmin
    .from("bayesian_beliefs")
    .select("id, question, prior, prior_rationale, idea_id, created_at, updated_at")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("列出贝叶斯信念失败", error.message);
    throw new Error("读取数据失败，请重试");
  }
  const beliefs = data ?? [];
  if (beliefs.length === 0) return [];

  // For each belief, fetch the latest update to get current_posterior
  const beliefIds = beliefs.map((b) => b.id);
  const { data: latestUpdates, error: latestUpdatesError } = await supabaseAdmin
    .from("bayesian_updates")
    .select("belief_id, posterior")
    .in("belief_id", beliefIds)
    .order("recorded_at", { ascending: false });
  if (latestUpdatesError) throw new Error(latestUpdatesError.message);

  const latestMap = new Map<string, number>();
  for (const u of latestUpdates ?? []) {
    if (!latestMap.has(u.belief_id)) {
      latestMap.set(u.belief_id, u.posterior);
    }
  }

  return beliefs.map((b) => ({
    id: b.id,
    question: b.question,
    prior: b.prior,
    prior_rationale: b.prior_rationale,
    idea_id: b.idea_id ?? null,
    created_at: b.created_at,
    updated_at: b.updated_at,
    current_posterior: latestMap.get(b.id) ?? b.prior,
  }));
}

export async function getBayesianBelief(
  beliefId: string,
  userId: string
): Promise<BayesianBeliefWithHistory | null> {
  const { data: belief, error } = await supabaseAdmin
    .from("bayesian_beliefs")
    .select("id, question, prior, prior_rationale, idea_id, created_at, updated_at, user_id, archived_at")
    .eq("id", beliefId)
    .maybeSingle();
  if (error) {
    console.error("读取贝叶斯信念失败", error.message);
    throw new Error("读取数据失败，请重试");
  }
  if (!belief || belief.user_id !== userId || belief.archived_at) return null;

  const { data: updatesData, error: updatesError } = await supabaseAdmin
    .from("bayesian_updates")
    .select(
      "id, belief_id, evidence_text, evidence_type, likelihood_if_true, likelihood_if_false, posterior, prior_at_time, ai_explanation, recorded_at"
    )
    .eq("belief_id", beliefId)
    .order("recorded_at", { ascending: true });
  if (updatesError) {
    console.error("读取贝叶斯更新失败", updatesError.message);
    throw new Error("读取数据失败，请重试");
  }

  const updates: BayesianUpdate[] = (updatesData ?? []).map((u) => ({
    id: u.id,
    belief_id: u.belief_id,
    evidence_text: u.evidence_text,
    evidence_type: u.evidence_type,
    likelihood_if_true: u.likelihood_if_true,
    likelihood_if_false: u.likelihood_if_false,
    posterior: u.posterior,
    prior_at_time: u.prior_at_time,
    ai_explanation: u.ai_explanation,
    recorded_at: u.recorded_at,
  }));

  const current_posterior =
    updates.length > 0 ? updates[updates.length - 1].posterior : belief.prior;

  return {
    id: belief.id,
    question: belief.question,
    prior: belief.prior,
    prior_rationale: belief.prior_rationale,
    idea_id: belief.idea_id ?? null,
    created_at: belief.created_at,
    updated_at: belief.updated_at,
    updates,
    current_posterior,
  };
}

export async function getBayesianBeliefsForIdea(
  ideaId: string,
  userId: string
): Promise<(BayesianBelief & { current_posterior: number })[]> {
  const { data, error } = await supabaseAdmin
    .from("bayesian_beliefs")
    .select("id, question, prior, prior_rationale, idea_id, created_at, updated_at")
    .eq("user_id", userId)
    .eq("idea_id", ideaId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("读取想法关联信念失败", error.message);
    throw new Error("读取数据失败，请重试");
  }
  const beliefs = data ?? [];
  if (beliefs.length === 0) return [];
  const { data: latestUpdates, error: latestUpdatesError } = await supabaseAdmin
    .from("bayesian_updates")
    .select("belief_id, posterior")
    .in("belief_id", beliefs.map((b) => b.id))
    .order("recorded_at", { ascending: false });
  if (latestUpdatesError) throw new Error(latestUpdatesError.message);
  const latestMap = new Map<string, number>();
  for (const u of latestUpdates ?? []) {
    if (!latestMap.has(u.belief_id)) latestMap.set(u.belief_id, u.posterior);
  }
  return beliefs.map((b) => ({
    id: b.id,
    question: b.question,
    prior: b.prior,
    prior_rationale: b.prior_rationale,
    idea_id: b.idea_id ?? null,
    created_at: b.created_at,
    updated_at: b.updated_at,
    current_posterior: latestMap.get(b.id) ?? b.prior,
  }));
}

// ── Fermi ─────────────────────────────────────────────────────────────────────

export async function listFermiEstimates(
  userId: string
): Promise<FermiEstimate[]> {
  const { data, error } = await supabaseAdmin
    .from("fermi_estimates")
    .select(
      "id, question, category, final_low, final_high, unit, ai_teaching, idea_id, created_at, updated_at"
    )
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("列出费米估算失败", error.message);
    throw new Error("读取数据失败，请重试");
  }
  return (data ?? []).map((e) => ({
    id: e.id,
    question: e.question,
    category: e.category,
    final_low: e.final_low ?? null,
    final_high: e.final_high ?? null,
    unit: e.unit,
    ai_teaching: e.ai_teaching,
    idea_id: e.idea_id ?? null,
    created_at: e.created_at,
    updated_at: e.updated_at,
  }));
}

export async function getFermiEstimate(
  estimateId: string,
  userId: string
): Promise<FermiEstimateWithComponents | null> {
  const { data: estimate, error } = await supabaseAdmin
    .from("fermi_estimates")
    .select(
      "id, question, category, final_low, final_high, unit, ai_teaching, idea_id, created_at, updated_at, user_id, archived_at"
    )
    .eq("id", estimateId)
    .maybeSingle();
  if (error) {
    console.error("读取费米估算失败", error.message);
    throw new Error("读取数据失败，请重试");
  }
  if (!estimate || estimate.user_id !== userId || estimate.archived_at) return null;

  const { data: componentsData, error: compError } = await supabaseAdmin
    .from("fermi_components")
    .select("id, estimate_id, ordinal, label, rationale, low, high, user_note, sensitivity")
    .eq("estimate_id", estimateId)
    .order("ordinal", { ascending: true });
  if (compError) {
    console.error("读取费米组成部分失败", compError.message);
    throw new Error("读取数据失败，请重试");
  }

  const components: FermiComponent[] = (componentsData ?? []).map((c) => ({
    id: c.id,
    estimate_id: c.estimate_id,
    ordinal: c.ordinal,
    label: c.label,
    rationale: c.rationale,
    low: c.low,
    high: c.high,
    user_note: c.user_note,
    sensitivity: c.sensitivity,
  }));

  return {
    id: estimate.id,
    question: estimate.question,
    category: estimate.category,
    final_low: estimate.final_low ?? null,
    final_high: estimate.final_high ?? null,
    unit: estimate.unit,
    ai_teaching: estimate.ai_teaching,
    idea_id: estimate.idea_id ?? null,
    created_at: estimate.created_at,
    updated_at: estimate.updated_at,
    components,
  };
}

export async function getFermiEstimatesForIdea(
  ideaId: string,
  userId: string
): Promise<FermiEstimate[]> {
  const { data, error } = await supabaseAdmin
    .from("fermi_estimates")
    .select(
      "id, question, category, final_low, final_high, unit, ai_teaching, idea_id, created_at, updated_at"
    )
    .eq("user_id", userId)
    .eq("idea_id", ideaId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("读取想法关联费米估算失败", error.message);
    throw new Error("读取数据失败，请重试");
  }
  return (data ?? []).map((e) => ({
    id: e.id,
    question: e.question,
    category: e.category,
    final_low: e.final_low ?? null,
    final_high: e.final_high ?? null,
    unit: e.unit,
    ai_teaching: e.ai_teaching,
    idea_id: e.idea_id ?? null,
    created_at: e.created_at,
    updated_at: e.updated_at,
  }));
}

// ── Reframing ─────────────────────────────────────────────────────────────────

export async function listReframingSessions(
  userId: string
): Promise<ReframingSession[]> {
  const { data, error } = await supabaseAdmin
    .from("reframing_sessions")
    .select("id, topic_text, context_note, idea_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("列出重构会话失败", error.message);
    throw new Error("读取数据失败，请重试");
  }
  return (data ?? []).map((s) => ({
    id: s.id,
    topic_text: s.topic_text,
    context_note: s.context_note,
    idea_id: s.idea_id ?? null,
    created_at: s.created_at,
  }));
}

export async function getReframingSession(
  sessionId: string,
  userId: string
): Promise<ReframingSessionWithFrames | null> {
  const { data: session, error } = await supabaseAdmin
    .from("reframing_sessions")
    .select("id, topic_text, context_note, idea_id, created_at, user_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) {
    console.error("读取重构会话失败", error.message);
    throw new Error("读取数据失败，请重试");
  }
  if (!session || session.user_id !== userId) return null;

  const { data: framesData, error: framesError } = await supabaseAdmin
    .from("reframing_frames")
    .select("id, session_id, frame_type, title, description, is_marked, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (framesError) {
    console.error("读取重构视角失败", framesError.message);
    throw new Error("读取数据失败，请重试");
  }

  const frames: ReframingFrame[] = (framesData ?? []).map((f) => ({
    id: f.id,
    session_id: f.session_id,
    frame_type: f.frame_type,
    title: f.title,
    description: f.description,
    is_marked: f.is_marked,
    created_at: f.created_at,
  }));

  return {
    id: session.id,
    topic_text: session.topic_text,
    context_note: session.context_note,
    idea_id: session.idea_id ?? null,
    created_at: session.created_at,
    frames,
  };
}

export async function getReframingSessionsForIdea(
  ideaId: string,
  userId: string
): Promise<ReframingSession[]> {
  const { data, error } = await supabaseAdmin
    .from("reframing_sessions")
    .select("id, topic_text, context_note, idea_id, created_at")
    .eq("user_id", userId)
    .eq("idea_id", ideaId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("读取想法关联重构会话失败", error.message);
    throw new Error("读取数据失败，请重试");
  }
  return (data ?? []).map((s) => ({
    id: s.id,
    topic_text: s.topic_text,
    context_note: s.context_note,
    idea_id: s.idea_id ?? null,
    created_at: s.created_at,
  }));
}

// ── Cross-tool insights ───────────────────────────────────────────────────────

export async function getMarkedFramePatterns(
  sessionIds: string[]
): Promise<{ frame_type: string; count: number }[]> {
  if (sessionIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("reframing_frames")
    .select("frame_type")
    .in("session_id", sessionIds)
    .eq("is_marked", true);
  if (error) {
    console.error("读取重构标记模式失败", error.message);
    throw new Error("读取数据失败，请重试");
  }
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.frame_type, (counts.get(row.frame_type) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([frame_type, count]) => ({ frame_type, count }))
    .sort((a, b) => b.count - a.count);
}

// ── First Principles ──────────────────────────────────────────────────────────

export async function listFirstPrinciplesSessions(
  userId: string
): Promise<FirstPrinciplesSession[]> {
  const { data, error } = await supabaseAdmin
    .from("first_principles_sessions")
    .select(
      "id, user_id, idea_id, original_claim, context_note, restated_belief, bedrock_summary, weakest_links, created_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("列出第一性原理会话失败", error.message);
    throw new Error("读取数据失败，请重试");
  }
  return (data ?? []).map((s) => ({
    id: s.id,
    user_id: s.user_id,
    idea_id: s.idea_id ?? null,
    original_claim: s.original_claim,
    context_note: s.context_note,
    restated_belief: s.restated_belief,
    bedrock_summary: s.bedrock_summary,
    weakest_links: Array.isArray(s.weakest_links) ? (s.weakest_links as string[]) : [],
    created_at: s.created_at,
  }));
}

export async function getFirstPrinciplesSession(
  sessionId: string,
  userId: string
): Promise<FirstPrinciplesSessionWithNodes | null> {
  const { data: session, error } = await supabaseAdmin
    .from("first_principles_sessions")
    .select(
      "id, user_id, idea_id, original_claim, context_note, restated_belief, bedrock_summary, weakest_links, created_at"
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (error) {
    console.error("读取第一性原理会话失败", error.message);
    throw new Error("读取数据失败，请重试");
  }
  if (!session || session.user_id !== userId) return null;

  const { data: nodesData, error: nodesError } = await supabaseAdmin
    .from("first_principles_nodes")
    .select("id, session_id, claim, basis_type, basis_note, challenge, depth, is_verified, created_at")
    .eq("session_id", sessionId)
    .order("depth", { ascending: true })
    .order("created_at", { ascending: true });
  if (nodesError) {
    console.error("读取命题节点失败", nodesError.message);
    throw new Error("读取数据失败，请重试");
  }

  const nodes: FirstPrinciplesNode[] = (nodesData ?? []).map((n) => ({
    id: n.id,
    session_id: n.session_id,
    claim: n.claim,
    basis_type: n.basis_type as NodeBasisType,
    basis_note: n.basis_note,
    challenge: n.challenge,
    depth: n.depth as 1 | 2 | 3,
    is_verified: n.is_verified,
    created_at: n.created_at,
  }));

  return {
    id: session.id,
    user_id: session.user_id,
    idea_id: session.idea_id ?? null,
    original_claim: session.original_claim,
    context_note: session.context_note,
    restated_belief: session.restated_belief,
    bedrock_summary: session.bedrock_summary,
    weakest_links: Array.isArray(session.weakest_links)
      ? (session.weakest_links as string[])
      : [],
    created_at: session.created_at,
    nodes,
  };
}

// ── Outside View ──────────────────────────────────────────────────────────────

const OUTSIDE_VIEW_SESSION_COLUMNS =
  "id, user_id, idea_id, plan_text, context_note, reference_class_label, dominant_pattern, dominant_cause, prevalence_bucket, user_distinctions, pushback_note, created_at";

function mapOutsideViewSession(s: {
  id: string;
  user_id: string;
  idea_id: string | null;
  plan_text: string;
  context_note: string;
  reference_class_label: string;
  dominant_pattern: string;
  dominant_cause: string;
  prevalence_bucket: string;
  user_distinctions: string;
  pushback_note: string;
  created_at: string;
}): OutsideViewSession {
  return {
    id: s.id,
    user_id: s.user_id,
    idea_id: s.idea_id ?? null,
    plan_text: s.plan_text,
    context_note: s.context_note,
    reference_class_label: s.reference_class_label,
    dominant_pattern: s.dominant_pattern,
    dominant_cause: s.dominant_cause,
    prevalence_bucket: s.prevalence_bucket as PrevalenceBucket,
    user_distinctions: s.user_distinctions,
    pushback_note: s.pushback_note,
    created_at: s.created_at,
  };
}

export async function listOutsideViewSessions(
  userId: string
): Promise<OutsideViewSession[]> {
  const { data, error } = await supabaseAdmin
    .from("outside_view_sessions")
    .select(OUTSIDE_VIEW_SESSION_COLUMNS)
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("列出外部视角会话失败", error.message);
    throw new Error("读取数据失败，请重试");
  }
  return (data ?? []).map(mapOutsideViewSession);
}

export async function getOutsideViewSession(
  sessionId: string,
  userId: string
): Promise<OutsideViewSessionWithItems | null> {
  const { data: session, error } = await supabaseAdmin
    .from("outside_view_sessions")
    .select(OUTSIDE_VIEW_SESSION_COLUMNS)
    .eq("id", sessionId)
    .maybeSingle();
  if (error) {
    console.error("读取外部视角会话失败", error.message);
    throw new Error("读取数据失败，请重试");
  }
  if (!session || session.user_id !== userId) return null;

  const { data: examplesData, error: examplesError } = await supabaseAdmin
    .from("outside_view_examples")
    .select("id, session_id, label, outcome_note, is_well_known, ordinal")
    .eq("session_id", sessionId)
    .order("ordinal", { ascending: true });
  if (examplesError) {
    console.error("读取外部视角案例失败", examplesError.message);
    throw new Error("读取数据失败，请重试");
  }

  const { data: checksData, error: checksError } = await supabaseAdmin
    .from("outside_view_checks")
    .select("id, session_id, check_text, is_done")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (checksError) {
    console.error("读取外部视角检验行动失败", checksError.message);
    throw new Error("读取数据失败，请重试");
  }

  const examples: OutsideViewExample[] = (examplesData ?? []).map((e) => ({
    id: e.id,
    session_id: e.session_id,
    label: e.label,
    outcome_note: e.outcome_note,
    is_well_known: e.is_well_known,
    ordinal: e.ordinal,
  }));

  const checks: OutsideViewCheck[] = (checksData ?? []).map((c) => ({
    id: c.id,
    session_id: c.session_id,
    check_text: c.check_text,
    is_done: c.is_done,
  }));

  return { ...mapOutsideViewSession(session), examples, checks };
}
