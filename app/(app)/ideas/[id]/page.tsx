import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
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
} from "@/app/(app)/reasoning/queries";
import {
  getConceptSchemaStatus,
  getIdeaConceptSummary,
  getIdeaEvidenceSnapshot,
  type IdeaEvidenceSnapshot,
} from "@/lib/domains/concepts/queries";
import { PageContainer } from "@/components/ui/page-container";
import { loadSlowWind, windFor } from "@/lib/domains/signals/slow-then";
import { WindLine } from "@/app/(app)/signals/slow/wind-line";
import { dueGaps, getFounderFacts, loadIdeaGaps } from "@/lib/domains/ideas/info-gaps";
import { tokyoToday } from "@/lib/domains/signals/brief";
import { InfoGapsPanel } from "./info-gaps-panel";

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

  // 慢变量：这个想法顺着、逆着哪几个（在慢变量页看过才有）；信息缺口和他写的约束优势
  const [wind, infoGaps, founderFacts] = await Promise.all([
    loadSlowWind(userId).catch(() => null),
    loadIdeaGaps(userId, params.id),
    getFounderFacts(userId),
  ]);
  const today = tokyoToday();

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
    <>
      <PageContainer width="narrow" className="animate-fade-up">
        <Link
          href={`/workbench/idea/${ideaCore.id}`}
          className="mb-4 inline-flex rounded-md border px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          在决策工作台打开
        </Link>
        <WindLine links={windFor(wind, "idea", idea.id)} />
        {infoGaps !== "missing-schema" && (
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            <a href="#gaps" className="underline-offset-4 hover:text-foreground hover:underline">
              {infoGaps.gaps.length === 0
                ? "信息缺口：还没列 —— 继续还是 Kill 还缺什么信息？↓"
                : `信息缺口：还缺 ${infoGaps.gaps.filter((g) => g.status === "open").length} 个${
                    dueGaps(infoGaps.gaps, today) > 0 ? `（${dueGaps(infoGaps.gaps, today)} 个该拿了）` : ""
                  } ↓`}
            </a>
          </p>
        )}
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
        <section id="gaps" className="mt-12 border-t pt-6">
          <h2 className="mb-3 text-lg font-semibold">信息缺口</h2>
          <InfoGapsPanel
            ideaId={idea.id}
            initial={infoGaps}
            founderFacts={founderFacts}
            today={today}
          />
        </section>
      </PageContainer>
    </>
  );
}
