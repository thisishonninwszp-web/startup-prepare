"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { USE_CASES, type UseCase } from "../types";
import { createCanvas } from "../actions";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-container";
import { prepareSearchOutreachAction } from "@/app/(app)/workbench/search-observation-actions";
import type { SearchOutreachDraft } from "@/lib/domains/observations/search/outreach";
import { prepareFeedbackContactAction } from "@/app/(app)/workbench/feedback-contact-actions";
import type { FeedbackContactDraft } from "@/lib/domains/observations/feedback/contact-brief";

function NewCanvasForm() {
  const router = useRouter();
  const params = useSearchParams();
  const preUseCase = (params.get("use_case") ?? "") as UseCase;

  const [useCase, setUseCase] = useState<UseCase>(
    USE_CASES.some((u) => u.key === preUseCase) ? preUseCase : "other"
  );
  const [title, setTitle] = useState("");
  const [scenario, setScenario] = useState("");
  const [isPending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const sourceRunId = params.get("observation_run_id");
  const sourceFeedbackId = params.get("feedback_id");
  const [feedback, setFeedback] = useState<FeedbackContactDraft | null>(null);
  const [observation, setObservation] = useState<SearchOutreachDraft | null>(null);
  const [loadingSource, setLoadingSource] = useState(false);
  useEffect(() => {
    let active = true;
    setObservation(null);
    setLoadingSource(false);
    if (sourceFeedbackId) return () => { active = false; };
    if (!sourceRunId) return () => { active = false; };
    setLoadingSource(true);
    prepareSearchOutreachAction(sourceRunId).then(draft => {
      if (!active) return;
      setObservation(draft); setTitle(old => old || draft.title); setScenario(old => old || draft.scenario);
    }).catch(() => { if (active) setError("未能读取观察来源；请从原观察记录重新打开。不会创建无出处的关联。"); })
      .finally(() => { if (active) setLoadingSource(false); });
    return () => { active = false; };
  }, [sourceRunId, sourceFeedbackId]);
  useEffect(() => {
    let active = true; setFeedback(null);
    if (!sourceFeedbackId) return () => { active = false; };
    if (sourceRunId) { setError("请一次选择一种提纲来源。"); return () => { active = false; }; }
    setLoadingSource(true);
    prepareFeedbackContactAction(sourceFeedbackId).then(draft => { if (active) { setFeedback(draft); setTitle(old => old || draft.title); setScenario(old => old || draft.scenario); } })
      .catch(() => { if (active) setError("反馈来源不可访问，请从原记录重新打开。"); })
      .finally(() => { if (active) setLoadingSource(false); });
    return () => { active = false; };
  }, [sourceFeedbackId, sourceRunId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || inFlight.current || (sourceRunId && !observation) || (sourceFeedbackId && !feedback)) return;
    setError(null);
    inFlight.current = true; setPending(true);
      try {
        const id = await createCanvas({ title: title.trim(), use_case: useCase, scenario, ...(observation ? { source_observation_run_id: observation.runId } : {}), ...(feedback ? { source_feedback_id: feedback.feedbackId } : {}) });
        router.push(`/outreach/${id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "创建失败");
      } finally { inFlight.current = false; setPending(false); }
  }

  const ucInfo = USE_CASES.find((u) => u.key === useCase);

  return (
    <form onSubmit={submit} className="space-y-6">
      {loadingSource && <p role="status" className="text-sm text-muted-foreground">正在读取你选择的提纲来源。</p>}
      {feedback && <p className="rounded border p-3 text-xs leading-6 text-muted-foreground">已带入反馈 {feedback.feedbackId.slice(0, 8)} 的接触提纲，请编辑核对。创建后保存为私人画布。</p>}
      {observation && <p className="rounded border p-3 text-xs leading-6 text-muted-foreground">已带入观察 {observation.runId.slice(0, 8)} 的问题与提纲，请编辑核对。创建只保存私人画布，不会联系任何人或调用AI。</p>}
      {/* 选场景 */}
      <div className="space-y-2">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          这次触达是为了
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {USE_CASES.map((uc) => (
            <Button
              key={uc.key}
              type="button"
              onClick={() => setUseCase(uc.key)}
              className={
                "rounded-lg border p-3 text-left transition-colors " +
                (useCase === uc.key
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground/30 hover:bg-muted/30")
              }
            >
              <p className="text-sm font-medium">{uc.label}</p>
              <p
                className={
                  "mt-0.5 text-xs " +
                  (useCase === uc.key ? "text-background/70" : "text-muted-foreground")
                }
              >
                {uc.hint}
              </p>
            </Button>
          ))}
        </div>
      </div>

      {/* 标题 */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          给这个画布起个名字
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder={
            ucInfo?.key === "startup"
              ? "例：找第一批付费用户"
              : ucInfo?.key === "job"
                ? "例：联系 Acme 公司 CTO"
                : ucInfo?.key === "persuasion"
                  ? "例：说服老板给我升职"
                  : "一句话描述这次触达目标"
          }
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* 场景描述 */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          具体情况（可选）
        </label>
        <textarea
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          rows={3}
          placeholder="我想说服 ___，让他们 ___。背景是 ___。"
          className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          越具体，AI 挑战时越有针对性。
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={isPending || !title.trim() || loadingSource || Boolean(sourceRunId && !observation) || Boolean(sourceFeedbackId && !feedback)}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {isPending ? "创建中…" : "开始规划"}
        </Button>
        <Button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border px-4 py-2 text-sm text-muted-foreground"
        >
          取消
        </Button>
      </div>
    </form>
  );
}

function SourceBoundCanvasForm() {
  const params = useSearchParams();
  return <NewCanvasForm key={`${params.get('observation_run_id') ?? ''}:${params.get('feedback_id') ?? ''}`} />;
}

export default function NewCanvasPage() {
  return (
    <PageContainer width="narrow">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">新建触达画布</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        选一个场景，描述你的目标——画布帮你逐维度想清楚。
      </p>
      <Suspense fallback={null}>
        <SourceBoundCanvasForm />
      </Suspense>
    </PageContainer>
  );
}
