"use client";

import { useState, useTransition } from "react";
import { runProfileGeneration } from "./actions";
import type { PersonalProfileReport, BehavioralTrait, PersonalityInsight } from "@/lib/ai";

const CATEGORY_LABELS: Record<string, string> = {
  interest: "兴趣领域",
  value: "价值取向",
  cognitive_style: "认知风格",
  social_orientation: "社交取向",
};

const CATEGORY_COLORS: Record<string, string> = {
  interest: "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800",
  value: "bg-purple-50 border-purple-200 dark:bg-purple-950/20 dark:border-purple-800",
  cognitive_style: "bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-800",
  social_orientation: "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800",
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "高置信",
  medium: "中置信",
  low: "低置信",
};
const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-green-700 dark:text-green-400",
  medium: "text-yellow-700 dark:text-yellow-400",
  low: "text-muted-foreground",
};

function TraitSpectrum({ trait }: { trait: BehavioralTrait }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{trait.dimension}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-right text-[11px] text-muted-foreground leading-tight">
          {trait.low_label}
        </span>
        <div className="relative flex-1 h-2 rounded-full bg-muted">
          <div
            className="absolute top-0 h-2 rounded-l-full bg-foreground/20"
            style={{ width: `${trait.position}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-3.5 rounded-full border-2 border-background bg-foreground shadow-sm"
            style={{ left: `${trait.position}%` }}
          />
        </div>
        <span className="w-24 shrink-0 text-[11px] text-muted-foreground leading-tight">
          {trait.high_label}
        </span>
      </div>
      {trait.evidence && (
        <p className="text-xs text-muted-foreground pl-[6.5rem]">{trait.evidence}</p>
      )}
    </div>
  );
}

function InsightCard({ insight }: { insight: PersonalityInsight }) {
  const colorClass =
    CATEGORY_COLORS[insight.category] ?? "bg-muted/30 border-border";
  const catLabel = CATEGORY_LABELS[insight.category] ?? insight.category;

  return (
    <div className={`rounded-lg border p-4 space-y-2 ${colorClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {catLabel}
        </span>
        <span
          className={`text-[10px] font-medium ${CONFIDENCE_COLORS[insight.confidence]}`}
        >
          {CONFIDENCE_LABELS[insight.confidence]}
        </span>
      </div>
      <p className="text-sm leading-relaxed">{insight.observation}</p>
      {insight.basis && (
        <p className="text-xs text-muted-foreground leading-relaxed">{insight.basis}</p>
      )}
    </div>
  );
}

function ProfileDisplay({ report }: { report: PersonalProfileReport }) {
  return (
    <div className="space-y-10">
      {/* 行为光谱 */}
      <section className="space-y-5">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          行为光谱
        </h3>
        <div className="space-y-6 rounded-lg border bg-card px-5 py-5">
          {report.behavioral_traits.map((trait, i) => (
            <TraitSpectrum key={i} trait={trait} />
          ))}
        </div>
      </section>

      {/* 性格洞见 */}
      <section className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          性格洞见
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {report.personality_insights.map((insight, i) => (
            <InsightCard key={i} insight={insight} />
          ))}
        </div>
      </section>

      {/* 综合画像 */}
      <section className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          综合画像
        </h3>
        <div className="rounded-lg border bg-card px-5 py-4">
          <p className="text-sm leading-relaxed whitespace-pre-line">
            {report.composite_portrait}
          </p>
        </div>
      </section>

      {/* 成长边界 */}
      <section className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          成长边界
        </h3>
        <div className="space-y-2">
          {report.growth_edges.map((edge, i) => (
            <div
              key={i}
              className="flex gap-3 rounded-lg border border-foreground/15 bg-card px-4 py-3"
            >
              <span className="mt-0.5 shrink-0 text-xs font-mono text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="text-sm leading-relaxed">{edge}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ProfileReport({ hasEnoughData }: { hasEnoughData: boolean }) {
  const [report, setReport] = useState<PersonalProfileReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await runProfileGeneration();
        setReport(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "生成失败，请重试");
      }
    });
  }

  if (!hasEnoughData) {
    return (
      <div className="rounded-lg border bg-muted/30 px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          还需要更多数据才能生成有意义的档案——至少需要 5 个想法或 3 条验证记录。
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          继续在 IdeaOS 中记录和验证，档案会越来越准确。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {report
            ? "档案基于你截至目前的全量数据生成，随时可重新生成。"
            : "档案从你的想法、梦想、决策、验证记录等内容中推断，生成约需 30 秒。"}
        </p>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={pending}
          className="shrink-0 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50 hover:opacity-90"
        >
          {pending ? "生成中（约 30 秒）…" : report ? "重新生成" : "生成我的档案"}
        </button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!report && !pending && (
        <div className="rounded-lg border border-dashed bg-muted/20 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">档案尚未生成</p>
        </div>
      )}

      {pending && (
        <div className="rounded-lg border bg-muted/20 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground animate-pulse">
            AI 正在阅读你的全量记录，推断你这个人……
          </p>
        </div>
      )}

      {report && !pending && <ProfileDisplay report={report} />}
    </div>
  );
}
