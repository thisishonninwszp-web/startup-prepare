import { supabaseAdmin } from "@/lib/supabase";
import { observationSourceTag } from "@/app/(app)/ideas/types";
import {
  getBayesianBeliefsForIdea,
  getFermiEstimatesForIdea,
  getReframingSessionsForIdea,
} from "@/app/(app)/reasoning/queries";

export type TimelineEventKind =
  | "origin_observation"
  | "idea_created"
  | "validation"
  | "prediction_made"
  | "prediction_resolved"
  | "decision"
  | "exit_criterion_added"
  | "exit_criterion_reviewed"
  | "reasoning_session";

export type TimelineEvent = {
  at: string;
  kind: TimelineEventKind;
  title: string;
  detail?: string;
  isRealContact: boolean;
};

export async function getIdeaTimeline(
  ideaId: string,
  userId: string
): Promise<TimelineEvent[]> {
  const { data: idea, error: ideaError } = await supabaseAdmin
    .from("ideas")
    .select("id, user_id, title, created_at, tags")
    .eq("id", ideaId)
    .maybeSingle();
  if (ideaError) throw new Error(ideaError.message);
  if (!idea || idea.user_id !== userId) throw new Error("无权访问该想法");

  const events: TimelineEvent[] = [
    {
      at: idea.created_at as string,
      kind: "idea_created",
      title: "想法建立",
      isRealContact: false,
    },
  ];

  const tags = (idea.tags ?? []) as string[];
  const sourceTag = tags.find((t) => t.startsWith("__ideaos_observation__:"));
  if (sourceTag) {
    const observationId = sourceTag.replace("__ideaos_observation__:", "");
    const expectedTag = observationSourceTag(observationId);
    if (sourceTag === expectedTag) {
      const { data: obs, error: obsError } = await supabaseAdmin
        .from("observations")
        .select("id, raw_text, created_at")
        .eq("id", observationId)
        .eq("user_id", userId)
        .maybeSingle();
      if (obsError) throw new Error(obsError.message);
      if (obs) {
        events.push({
          at: obs.created_at as string,
          kind: "origin_observation",
          title: "来源观察",
          detail: (obs.raw_text as string).slice(0, 80),
          isRealContact: false,
        });
      }
    }
  }

  const [
    validationsResult,
    predictionsResult,
    decisionsResult,
    exitCriteriaResult,
    firstPrinciplesResult,
    outsideViewResult,
    councilResult,
    beliefs,
    estimates,
    reframings,
  ] = await Promise.all([
    supabaseAdmin
      .from("validations")
      .select("has_pain, will_pay, note, contacted_at")
      .eq("idea_id", ideaId),
    supabaseAdmin
      .from("predictions")
      .select("text, made_at, resolved_at, outcome")
      .eq("idea_id", ideaId)
      .eq("source_type", "idea"),
    supabaseAdmin
      .from("decisions")
      .select("verdict, decided_at")
      .eq("idea_id", ideaId),
    supabaseAdmin
      .from("idea_exit_criteria")
      .select("criterion, triggered, created_at, reviewed_at")
      .eq("idea_id", ideaId)
      .eq("user_id", userId),
    supabaseAdmin
      .from("first_principles_sessions")
      .select("original_claim, created_at")
      .eq("idea_id", ideaId)
      .eq("user_id", userId),
    supabaseAdmin
      .from("outside_view_sessions")
      .select("plan_text, created_at")
      .eq("idea_id", ideaId)
      .eq("user_id", userId),
    supabaseAdmin
      .from("council_sessions")
      .select("title, created_at")
      .eq("idea_id", ideaId)
      .eq("user_id", userId),
    getBayesianBeliefsForIdea(ideaId, userId),
    getFermiEstimatesForIdea(ideaId, userId),
    getReframingSessionsForIdea(ideaId, userId),
  ]);
  if (validationsResult.error) throw new Error(validationsResult.error.message);
  if (predictionsResult.error) throw new Error(predictionsResult.error.message);
  if (decisionsResult.error) throw new Error(decisionsResult.error.message);
  if (exitCriteriaResult.error) throw new Error(exitCriteriaResult.error.message);
  if (firstPrinciplesResult.error) throw new Error(firstPrinciplesResult.error.message);
  if (outsideViewResult.error) throw new Error(outsideViewResult.error.message);
  if (councilResult.error) throw new Error(councilResult.error.message);

  for (const v of validationsResult.data ?? []) {
    events.push({
      at: v.contacted_at as string,
      kind: "validation",
      title: "真实验证",
      detail: `有痛：${v.has_pain} · 愿付费：${v.will_pay}`,
      isRealContact: true,
    });
  }

  for (const p of predictionsResult.data ?? []) {
    events.push({
      at: p.made_at as string,
      kind: "prediction_made",
      title: "写下预测",
      detail: (p.text as string).slice(0, 80),
      isRealContact: false,
    });
    if (p.resolved_at) {
      events.push({
        at: p.resolved_at as string,
        kind: "prediction_resolved",
        title: p.outcome === "hit" ? "预测命中" : "预测没命中",
        detail: (p.text as string).slice(0, 80),
        isRealContact: true,
      });
    }
  }

  for (const d of decisionsResult.data ?? []) {
    events.push({
      at: d.decided_at as string,
      kind: "decision",
      title: `决策：${d.verdict}`,
      isRealContact: false,
    });
  }

  for (const c of exitCriteriaResult.data ?? []) {
    events.push({
      at: c.created_at as string,
      kind: "exit_criterion_added",
      title: "写下退出条件",
      detail: c.criterion as string,
      isRealContact: false,
    });
    if (c.reviewed_at) {
      events.push({
        at: c.reviewed_at as string,
        kind: "exit_criterion_reviewed",
        title: c.triggered === "yes" ? "退出条件：触发了" : "退出条件：没触发",
        detail: c.criterion as string,
        isRealContact: false,
      });
    }
  }

  for (const b of beliefs) {
    events.push({
      at: b.created_at,
      kind: "reasoning_session",
      title: "贝叶斯信念追踪",
      detail: b.question,
      isRealContact: false,
    });
  }
  for (const e of estimates) {
    events.push({
      at: e.created_at,
      kind: "reasoning_session",
      title: "费米估算",
      detail: e.question,
      isRealContact: false,
    });
  }
  for (const r of reframings) {
    events.push({
      at: r.created_at,
      kind: "reasoning_session",
      title: "认知重构",
      detail: r.topic_text,
      isRealContact: false,
    });
  }
  for (const fp of firstPrinciplesResult.data ?? []) {
    events.push({
      at: fp.created_at as string,
      kind: "reasoning_session",
      title: "第一性原理分解",
      detail: (fp.original_claim as string).slice(0, 80),
      isRealContact: false,
    });
  }
  for (const ov of outsideViewResult.data ?? []) {
    events.push({
      at: ov.created_at as string,
      kind: "reasoning_session",
      title: "外部视角分析",
      detail: (ov.plan_text as string).slice(0, 80),
      isRealContact: false,
    });
  }
  for (const cs of councilResult.data ?? []) {
    events.push({
      at: cs.created_at as string,
      kind: "reasoning_session",
      title: "顾问团会话",
      detail: (cs.title as string) || undefined,
      isRealContact: false,
    });
  }

  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}
