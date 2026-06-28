"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { recordBayesUpdate } from "@/app/reasoning/actions";
import type { BayesianBeliefWithHistory, BayesianUpdate } from "@/app/reasoning/types";

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function ProbBar({ value }: { value: number }) {
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-border">
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-foreground transition-all duration-500"
        style={{ width: `${value * 100}%` }}
      />
    </div>
  );
}

function UpdateRow({ update }: { update: BayesianUpdate }) {
  const [open, setOpen] = useState(false);
  const lr = update.likelihood_if_true / update.likelihood_if_false;
  return (
    <div className="rounded-md border bg-card">
      <div
        className="flex cursor-pointer items-start justify-between gap-4 px-4 py-3"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm">{update.evidence_text}</p>
          <p className="mt-0.5 text-xs text-muted-foreground capitalize">
            {update.evidence_type}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-sm">
          <span className="text-muted-foreground">{pct(update.prior_at_time)}</span>
          <span className="text-muted-foreground">→</span>
          <span className="font-medium">{pct(update.posterior)}</span>
        </div>
      </div>
      {open && (
        <div className="border-t bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground space-y-2">
          <div className="overflow-x-auto">
            <div className="font-mono text-[11px] text-foreground/60 whitespace-nowrap">
              P(E|H) = {update.likelihood_if_true} · P(E|¬H) = {update.likelihood_if_false} · 似然比 = {lr.toFixed(2)}
            </div>
            <div className="font-mono text-[11px] text-foreground/60 whitespace-nowrap">
              后验 = ({update.likelihood_if_true} × {pct(update.prior_at_time)}) ÷ ({update.likelihood_if_true} × {pct(update.prior_at_time)} + {update.likelihood_if_false} × {pct(1 - update.prior_at_time)}) = {pct(update.posterior)}
            </div>
          </div>
          <p className="whitespace-pre-wrap">{update.ai_explanation}</p>
        </div>
      )}
    </div>
  );
}

export function BayesianWorkspace({
  belief,
}: {
  belief: BayesianBeliefWithHistory;
}) {
  const [pending, startTransition] = useTransition();
  const [evidenceText, setEvidenceText] = useState("");
  const [evidenceType, setEvidenceType] = useState("observation");
  const [error, setError] = useState<string | null>(null);
  const [updates, setUpdates] = useState(belief.updates);
  const [currentPosterior, setCurrentPosterior] = useState(
    belief.current_posterior
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!evidenceText.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await recordBayesUpdate(
          belief.id,
          evidenceText.trim(),
          evidenceType
        );
        setCurrentPosterior(result.posterior);
        setUpdates((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            belief_id: belief.id,
            evidence_text: evidenceText.trim(),
            evidence_type: evidenceType,
            likelihood_if_true: 0,
            likelihood_if_false: 0,
            posterior: result.posterior,
            prior_at_time:
              prev.length > 0 ? prev[prev.length - 1].posterior : belief.prior,
            ai_explanation: result.explanation + "\n\n" + result.teaching_note,
            recorded_at: new Date().toISOString(),
          },
        ]);
        setEvidenceText("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "操作失败，请重试");
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-2 text-xs text-muted-foreground">
        <Link href="/reasoning" className="hover:underline">
          推理工具
        </Link>{" "}
        / 贝叶斯信念
      </div>

      <div className="mb-8">
        <h1 className="text-lg font-semibold leading-snug">{belief.question}</h1>

        <div className="mt-4 space-y-1.5">
          <div className="flex items-end justify-between">
            <span className="text-xs text-muted-foreground">当前概率</span>
            <span className="text-3xl font-bold tabular-nums">
              {pct(currentPosterior)}
            </span>
          </div>
          <ProbBar value={currentPosterior} />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>

        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            AI 建议的初始先验：{pct(belief.prior)}
          </summary>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {belief.prior_rationale}
          </p>
        </details>
      </div>

      {updates.length > 0 && (
        <div className="mb-8 space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">证据记录</h2>
          {updates.map((u) => (
            <UpdateRow key={u.id} update={u} />
          ))}
        </div>
      )}

      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-medium">记录新证据</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={evidenceText}
            onChange={(e) => setEvidenceText(e.target.value)}
            rows={3}
            placeholder="你观察到了什么？访谈中听到了什么？"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-2">
              {(
                [
                  { value: "observation", label: "观察" },
                  { value: "interview", label: "访谈" },
                  { value: "data", label: "数据" },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-1.5 text-xs"
                >
                  <input
                    type="radio"
                    name="evidenceType"
                    value={opt.value}
                    checked={evidenceType === opt.value}
                    onChange={() => setEvidenceType(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={pending || !evidenceText.trim()}
              className="ml-auto"
            >
              {pending ? "AI 计算中…" : "更新信念"}
            </Button>
          </div>
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
