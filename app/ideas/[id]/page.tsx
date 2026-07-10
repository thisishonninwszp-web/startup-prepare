import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { AppShell } from "@/components/app-shell";
import { IdeaDetail } from "./idea-detail";
import {
  AI_ROLES,
  type AiRole,
  type ChatTurn,
  type ExitCriterion,
  type Hypothesis,
  type Idea,
  type Prediction,
  type Validation,
  visibleTags,
} from "../types";
import {
  getBayesianBeliefsForIdea,
  getFermiEstimatesForIdea,
  getReframingSessionsForIdea,
} from "@/app/reasoning/queries";
import {
  getConceptSchemaStatus,
  getIdeaConceptSummary,
  getIdeaEvidenceSnapshot,
  type IdeaEvidenceSnapshot,
} from "@/app/concepts/queries";

export const dynamic = "force-dynamic";

export default async function IdeaDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;

  const { data: idea, error: ideaError } = await supabaseAdmin
    .from("ideas")
    .select("id, user_id, title, status, tags, hypothesis, created_at, last_activity_at")
    .eq("id", params.id)
    .maybeSingle();
  if (ideaError) throw new Error(ideaError.message);

  if (!idea || idea.user_id !== userId) notFound();

  // 各角色的既有对话
  const { data: sessions, error: sessionsError } = await supabaseAdmin
    .from("ai_sessions")
    .select("role, messages")
    .eq("idea_id", params.id)
    .in(
      "role",
      AI_ROLES.map((r) => r.key)
    );
  if (sessionsError) throw new Error(sessionsError.message);

  const initialChats = {} as Record<AiRole, ChatTurn[]>;
  for (const r of AI_ROLES) initialChats[r.key] = [];
  for (const s of sessions ?? []) {
    if (Array.isArray(s.messages)) {
      initialChats[s.role as AiRole] = s.messages as ChatTurn[];
    }
  }

  // 验证记录（倒序）
  const { data: validations, error: validationsError } = await supabaseAdmin
    .from("validations")
    .select("id, has_pain, will_pay, note, contacted_at")
    .eq("idea_id", params.id)
    .order("contacted_at", { ascending: false });
  if (validationsError) throw new Error(validationsError.message);

  // 预测（倒序）
  const { data: predictions, error: predictionsError } = await supabaseAdmin
    .from("predictions")
    .select("id, text, due_at, made_at, outcome, resolved_at, note")
    .eq("idea_id", params.id)
    .order("made_at", { ascending: false });
  if (predictionsError) throw new Error(predictionsError.message);

  // 退出条件（预先承诺，顺序按写下的时间）
  const { data: exitCriteria, error: exitCriteriaError } = await supabaseAdmin
    .from("idea_exit_criteria")
    .select("id, criterion, triggered, reviewed_at, created_at")
    .eq("idea_id", params.id)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (exitCriteriaError) throw new Error(exitCriteriaError.message);

  // 关联推理工具
  const [
    reasoningBeliefs,
    reasoningEstimates,
    reasoningSessions,
    conceptSummary,
    conceptAvailable,
  ] =
    await Promise.all([
      getBayesianBeliefsForIdea(params.id, userId),
      getFermiEstimatesForIdea(params.id, userId),
      getReframingSessionsForIdea(params.id, userId),
      getIdeaConceptSummary(params.id, userId),
      getConceptSchemaStatus(),
    ]);

  const evidenceSnapshot: IdeaEvidenceSnapshot | null = conceptAvailable
    ? await getIdeaEvidenceSnapshot(params.id, userId)
    : null;

  const ideaCore: Idea = {
    id: idea.id,
    title: idea.title,
    status: idea.status,
    tags: visibleTags(idea.tags ?? []),
    created_at: idea.created_at,
    last_activity_at: idea.last_activity_at,
  };

  return (
    <AppShell>
      <main className="animate-fade-up mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Link
          href={`/workbench/idea/${ideaCore.id}`}
          className="mb-4 inline-flex rounded-md border px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          在决策工作台打开
        </Link>
        <IdeaDetail
          idea={ideaCore}
          hypothesis={(idea.hypothesis ?? {}) as Hypothesis}
          initialChats={initialChats}
          initialValidations={(validations ?? []) as Validation[]}
          initialPredictions={(predictions ?? []) as Prediction[]}
          initialExitCriteria={(exitCriteria ?? []) as ExitCriterion[]}
          initialBeliefs={reasoningBeliefs}
          initialEstimates={reasoningEstimates}
          initialReframings={reasoningSessions}
          conceptSummary={conceptSummary}
          conceptAvailable={conceptAvailable}
          evidenceSnapshot={evidenceSnapshot}
        />
      </main>
    </AppShell>
  );
}
