"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  suggestBayesPrior,
  analyzeBayesUpdate,
  decomposeFermiQuestion,
  computeFermiSensitivity,
  generateReframes,
} from "@/lib/ai";
import {
  normalizeCreateBayesianBelief,
  normalizeCreateFermiEstimate,
  normalizeCreateReframingSession,
  assertFermiComponentValues,
} from "./validation";

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

// ── Bayesian ──────────────────────────────────────────────────────────────────

export async function createBayesianBelief(formData: FormData): Promise<{ id: string }> {
  const userId = await requireUserId();
  const input = normalizeCreateBayesianBelief({
    question: formData.get("question"),
    prior: formData.get("prior"),
    idea_id: formData.get("idea_id"),
  });

  const suggestion = await suggestBayesPrior(input.question);
  const prior = input.prior ?? suggestion.suggested_prior;

  const { data, error } = await supabaseAdmin
    .from("bayesian_beliefs")
    .insert({
      user_id: userId,
      question: input.question,
      prior,
      prior_rationale: suggestion.rationale,
      idea_id: input.idea_id,
    })
    .select("id")
    .single();
  if (error) {
    console.error("创建贝叶斯信念失败", error.message);
    throw new Error("创建失败，请重试");
  }
  revalidatePath("/reasoning");
  return { id: data.id };
}

export async function recordBayesUpdate(
  beliefId: string,
  evidenceText: string,
  evidenceType: string
): Promise<{ posterior: number; explanation: string; teaching_note: string }> {
  const userId = await requireUserId();

  // Verify ownership and load current state
  const { data: belief, error: beliefError } = await supabaseAdmin
    .from("bayesian_beliefs")
    .select("id, user_id, question, prior, archived_at")
    .eq("id", beliefId)
    .maybeSingle();
  if (beliefError || !belief || belief.user_id !== userId || belief.archived_at) {
    throw new Error("无权访问该信念");
  }

  // Load previous updates to determine current prior
  const { data: prevUpdates } = await supabaseAdmin
    .from("bayesian_updates")
    .select("evidence_text, posterior")
    .eq("belief_id", beliefId)
    .order("recorded_at", { ascending: true });

  const history = (prevUpdates ?? []).map((u) => ({
    evidence_text: u.evidence_text,
    posterior: u.posterior,
  }));
  const currentPrior =
    history.length > 0
      ? history[history.length - 1].posterior
      : belief.prior;

  const analysis = await analyzeBayesUpdate(
    belief.question,
    currentPrior,
    evidenceText,
    history
  );

  const { error: insertError } = await supabaseAdmin
    .from("bayesian_updates")
    .insert({
      belief_id: beliefId,
      evidence_text: evidenceText,
      evidence_type: evidenceType,
      likelihood_if_true: analysis.likelihood_if_true,
      likelihood_if_false: analysis.likelihood_if_false,
      posterior: analysis.posterior,
      prior_at_time: currentPrior,
      ai_explanation: analysis.explanation + "\n\n" + analysis.teaching_note,
    });
  if (insertError) {
    console.error("记录贝叶斯更新失败", insertError.message);
    throw new Error("记录失败，请重试");
  }

  await supabaseAdmin
    .from("bayesian_beliefs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", beliefId);

  revalidatePath(`/reasoning/bayesian/${beliefId}`);
  return {
    posterior: analysis.posterior,
    explanation: analysis.explanation,
    teaching_note: analysis.teaching_note,
  };
}

export async function archiveBayesianBelief(beliefId: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabaseAdmin
    .from("bayesian_beliefs")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", beliefId)
    .eq("user_id", userId);
  if (error) {
    console.error("归档贝叶斯信念失败", error.message);
    throw new Error("归档失败，请重试");
  }
  revalidatePath("/reasoning");
}

// ── Fermi ─────────────────────────────────────────────────────────────────────

export async function createFermiEstimate(formData: FormData): Promise<{ id: string }> {
  const userId = await requireUserId();
  const input = normalizeCreateFermiEstimate({
    question: formData.get("question"),
    category: formData.get("category"),
    idea_id: formData.get("idea_id"),
  });

  const decomposition = await decomposeFermiQuestion(input.question, input.category);

  // Compute initial final_low and final_high from AI suggestion
  let final_low = 1;
  let final_high = 1;
  for (const c of decomposition.components) {
    final_low *= c.suggested_low;
    final_high *= c.suggested_high;
  }

  const { data: estimate, error: estimateError } = await supabaseAdmin
    .from("fermi_estimates")
    .insert({
      user_id: userId,
      question: input.question,
      category: input.category,
      final_low,
      final_high,
      unit: decomposition.unit,
      ai_teaching: decomposition.teaching_note,
      idea_id: input.idea_id,
    })
    .select("id")
    .single();
  if (estimateError) {
    console.error("创建费米估算失败", estimateError.message);
    throw new Error("创建失败，请重试");
  }

  const componentRows = decomposition.components.map((c, index) => ({
    estimate_id: estimate.id,
    ordinal: index + 1,
    label: c.label,
    rationale: c.rationale,
    low: c.suggested_low,
    high: c.suggested_high,
  }));

  const { error: compError } = await supabaseAdmin
    .from("fermi_components")
    .insert(componentRows);
  if (compError) {
    console.error("创建费米组成部分失败", compError.message);
    throw new Error("创建失败，请重试");
  }

  revalidatePath("/reasoning");
  return { id: estimate.id };
}

export async function updateFermiComponent(
  componentId: string,
  low: number,
  high: number,
  userNote: string
): Promise<void> {
  const userId = await requireUserId();
  assertFermiComponentValues(low, high);

  // Verify ownership via estimate
  const { data: component, error: compError } = await supabaseAdmin
    .from("fermi_components")
    .select("id, estimate_id")
    .eq("id", componentId)
    .maybeSingle();
  if (compError || !component) throw new Error("无权访问该组成部分");

  const { data: estimate, error: estimateError } = await supabaseAdmin
    .from("fermi_estimates")
    .select("id, user_id")
    .eq("id", component.estimate_id)
    .maybeSingle();
  if (estimateError || !estimate || estimate.user_id !== userId) {
    throw new Error("无权访问该费米估算");
  }

  const { error: updateError } = await supabaseAdmin
    .from("fermi_components")
    .update({ low, high, user_note: userNote })
    .eq("id", componentId);
  if (updateError) {
    console.error("更新费米组成部分失败", updateError.message);
    throw new Error("更新失败，请重试");
  }

  // Recompute final range from all components
  const { data: allComponents } = await supabaseAdmin
    .from("fermi_components")
    .select("low, high")
    .eq("estimate_id", component.estimate_id);

  let final_low = 1;
  let final_high = 1;
  for (const c of allComponents ?? []) {
    final_low *= c.low;
    final_high *= c.high;
  }

  await supabaseAdmin
    .from("fermi_estimates")
    .update({
      final_low,
      final_high,
      updated_at: new Date().toISOString(),
    })
    .eq("id", component.estimate_id);

  revalidatePath(`/reasoning/fermi/${component.estimate_id}`);
}

export async function computeSensitivity(estimateId: string): Promise<void> {
  const userId = await requireUserId();

  const { data: estimate, error: estimateError } = await supabaseAdmin
    .from("fermi_estimates")
    .select("id, user_id, question")
    .eq("id", estimateId)
    .maybeSingle();
  if (estimateError || !estimate || estimate.user_id !== userId) {
    throw new Error("无权访问该费米估算");
  }

  const { data: components, error: compError } = await supabaseAdmin
    .from("fermi_components")
    .select("id, label, low, high")
    .eq("estimate_id", estimateId)
    .order("ordinal", { ascending: true });
  if (compError || !components) throw new Error("读取组成部分失败");

  const result = await computeFermiSensitivity(estimate.question, components);

  // Write sensitivity text back to each component
  for (const sensitivity of result.sensitivities) {
    const component = components.find(
      (c) => c.label === sensitivity.component_label
    );
    if (!component) continue;
    await supabaseAdmin
      .from("fermi_components")
      .update({ sensitivity: sensitivity.final_change_description })
      .eq("id", component.id);
  }

  revalidatePath(`/reasoning/fermi/${estimateId}`);
}

export async function archiveFermiEstimate(estimateId: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabaseAdmin
    .from("fermi_estimates")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", estimateId)
    .eq("user_id", userId);
  if (error) {
    console.error("归档费米估算失败", error.message);
    throw new Error("归档失败，请重试");
  }
  revalidatePath("/reasoning");
}

// ── Reframing ─────────────────────────────────────────────────────────────────

export async function createReframingSession(formData: FormData): Promise<{ id: string }> {
  const userId = await requireUserId();
  const input = normalizeCreateReframingSession({
    topic_text: formData.get("topic_text"),
    context_note: formData.get("context_note"),
    idea_id: formData.get("idea_id"),
  });

  const output = await generateReframes(
    input.topic_text,
    input.context_note || undefined
  );

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("reframing_sessions")
    .insert({
      user_id: userId,
      topic_text: input.topic_text,
      context_note: input.context_note,
      idea_id: input.idea_id,
    })
    .select("id")
    .single();
  if (sessionError) {
    console.error("创建重构会话失败", sessionError.message);
    throw new Error("创建失败，请重试");
  }

  const frameRows = output.frames.map((f) => ({
    session_id: session.id,
    frame_type: f.frame_type,
    title: f.title,
    description: f.description,
  }));

  const { error: framesError } = await supabaseAdmin
    .from("reframing_frames")
    .insert(frameRows);
  if (framesError) {
    console.error("插入重构视角失败", framesError.message);
    throw new Error("创建失败，请重试");
  }

  revalidatePath("/reasoning");
  return { id: session.id };
}

export async function markReframingFrame(
  frameId: string,
  isMarked: boolean
): Promise<void> {
  const userId = await requireUserId();

  // Verify ownership via session
  const { data: frame, error: frameError } = await supabaseAdmin
    .from("reframing_frames")
    .select("id, session_id")
    .eq("id", frameId)
    .maybeSingle();
  if (frameError || !frame) throw new Error("无权访问该视角");

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("reframing_sessions")
    .select("id, user_id")
    .eq("id", frame.session_id)
    .maybeSingle();
  if (sessionError || !session || session.user_id !== userId) {
    throw new Error("无权访问该重构会话");
  }

  const { error } = await supabaseAdmin
    .from("reframing_frames")
    .update({ is_marked: isMarked })
    .eq("id", frameId);
  if (error) {
    console.error("标记重构视角失败", error.message);
    throw new Error("标记失败，请重试");
  }
}

export async function promoteFrameToObservation(frameId: string): Promise<void> {
  const userId = await requireUserId();

  // Verify ownership and get frame content
  const { data: frame, error: frameError } = await supabaseAdmin
    .from("reframing_frames")
    .select("id, session_id, title, description")
    .eq("id", frameId)
    .maybeSingle();
  if (frameError || !frame) throw new Error("无权访问该视角");

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("reframing_sessions")
    .select("id, user_id, topic_text")
    .eq("id", frame.session_id)
    .maybeSingle();
  if (sessionError || !session || session.user_id !== userId) {
    throw new Error("无权访问该重构会话");
  }

  const raw_text = `[重构视角] ${frame.title}\n\n${frame.description}\n\n来源课题：${session.topic_text}`;

  const { error: obsError } = await supabaseAdmin
    .from("observations")
    .insert({
      user_id: userId,
      raw_text,
      tags: ["重构视角"],
    });
  if (obsError) {
    console.error("升格重构视角为观察失败", obsError.message);
    throw new Error("升格失败，请重试");
  }

  revalidatePath("/review");
}
