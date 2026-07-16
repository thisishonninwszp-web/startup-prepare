"use client";

import { useState, useTransition } from "react";
import { runAlignmentAnalysis } from "./actions";
import type { AlignmentObservation } from "./actions";

const OBS_TYPE_LABELS: Record<string, string> = {
  dream_action_gap: "梦想行动落差",
  action_concentration: "行动过度集中",
  stale_domain: "领域停滞",
  missing_validation: "缺乏真实接触",
};

const OBS_TYPE_COLORS: Record<string, string> = {
  dream_action_gap: "border-l-purple-500 bg-purple-50 dark:bg-purple-950/20",
  action_concentration: "border-l-orange-500 bg-orange-50 dark:bg-orange-950/20",
  stale_domain: "border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950/20",
  missing_validation: "border-l-red-500 bg-red-50 dark:bg-red-950/20",
};

function ObsCard({ obs }: { obs: AlignmentObservation }) {
  const colorClass =
    OBS_TYPE_COLORS[obs.observation_type] ?? "border-l-muted-foreground bg-muted/30";
  const typeLabel = OBS_TYPE_LABELS[obs.observation_type] ?? obs.observation_type;

  return (
    <div className={`rounded-lg border-l-2 p-4 space-y-3 ${colorClass}`}>
      <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
        {typeLabel}
      </span>
      <p className="text-sm leading-relaxed">{obs.description}</p>
      <div className="rounded-md border border-foreground/20 bg-background/60 px-3 py-2">
        <p className="text-xs font-medium leading-relaxed">{obs.question}</p>
      </div>
    </div>
  );
}

export function AlignmentReport({ hasEnoughData }: { hasEnoughData: boolean }) {
  const [observations, setObservations] = useState<AlignmentObservation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAnalyze() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await runAlignmentAnalysis();
        setObservations(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "分析失败，请重试");
      }
    });
  }

  if (!hasEnoughData) {
    return (
      <div className="rounded-lg border bg-muted/30 px-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          还需要积累更多数据——至少 3 个想法或 1 个梦想，对齐审视才有意义。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          AI 对齐审视
        </h2>
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={pending}
          className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50 hover:opacity-90"
        >
          {pending ? "审视中（约 15 秒）…" : observations ? "重新审视" : "审视对齐"}
        </button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {observations && observations.length === 0 && (
        <p className="text-sm text-muted-foreground">
          当前数据没有发现明显的落差——继续积累，下次审视可能会有发现。
        </p>
      )}

      {observations && observations.length > 0 && (
        <div className="space-y-4">
          {observations.map((obs, i) => (
            <ObsCard key={i} obs={obs} />
          ))}
          <p className="text-xs text-muted-foreground">
            以上观察基于你截至目前的数据快照。数据越多，发现越准确。
          </p>
        </div>
      )}

      {!observations && !pending && (
        <p className="text-xs text-muted-foreground">
          点击「审视对齐」，AI 会对比你的梦想和行动，找出真正的落差。
        </p>
      )}
    </div>
  );
}
