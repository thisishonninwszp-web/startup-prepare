"use client";

import { useState, useTransition } from "react";
import { runPatternAnalysis } from "./actions";
import type { CognitivePattern } from "@/lib/ai";
import { Button } from "@/components/ui/button";

const PATTERN_TYPE_LABELS: Record<string, string> = {
  validation_bias: "验证选择性",
  prediction_calibration: "预测校准",
  domain_concentration: "领域集中",
  reasoning_tendency: "思维定势",
  execution_speed: "行动速度",
  evidence_avoidance: "回避证据",
};

const PATTERN_TYPE_COLORS: Record<string, string> = {
  validation_bias: "border-l-status-validating bg-status-validating/10",
  prediction_calibration: "border-l-status-hypothesis bg-status-hypothesis/10",
  domain_concentration: "border-l-verdict-learned bg-verdict-learned/10",
  reasoning_tendency: "border-l-status-validating bg-status-validating/10",
  execution_speed: "border-l-destructive bg-destructive/10",
  evidence_avoidance: "border-l-destructive bg-destructive/10",
};

function PatternCard({ pattern }: { pattern: CognitivePattern }) {
  const colorClass =
    PATTERN_TYPE_COLORS[pattern.pattern_type] ??
    "border-l-muted-foreground bg-muted/30";
  const typeLabel = PATTERN_TYPE_LABELS[pattern.pattern_type] ?? pattern.pattern_type;

  return (
    <div className={`rounded-lg border-l-2 p-4 space-y-3 ${colorClass}`}>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
          {typeLabel}
        </span>
      </div>
      <p className="text-sm font-medium leading-relaxed">{pattern.title}</p>
      <ul className="space-y-1">
        {pattern.evidence.map((e, i) => (
          <li key={i} className="text-xs text-muted-foreground leading-relaxed">
            · {e}
          </li>
        ))}
      </ul>
      <div className="rounded-md border border-foreground/20 bg-background/60 px-3 py-2">
        <p className="text-xs font-medium leading-relaxed">{pattern.question}</p>
      </div>
    </div>
  );
}

export function PatternReport({ hasEnoughData }: { hasEnoughData: boolean }) {
  const [patterns, setPatterns] = useState<CognitivePattern[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await runPatternAnalysis();
        setPatterns(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "分析失败，请重试");
      }
    });
  }

  if (!hasEnoughData) {
    return (
      <div className="rounded-lg border bg-muted/30 px-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          还需要积累更多数据——至少 3 个想法或 5 条验证记录，认知镜才能找到有意义的规律。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          AI 认知分析
        </h2>
        <Button
          type="button"
          onClick={handleGenerate}
          disabled={pending}
          className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50 hover:opacity-90"
        >
          {pending ? "分析中（约 20 秒）…" : patterns ? "重新分析" : "生成认知报告"}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {patterns && patterns.length === 0 && (
        <p className="text-sm text-muted-foreground">
          当前数据没有发现明显的系统性规律——继续积累，下次分析可能会有发现。
        </p>
      )}

      {patterns && patterns.length > 0 && (
        <div className="space-y-4">
          {patterns.map((p, i) => (
            <PatternCard key={i} pattern={p} />
          ))}
          <p className="text-xs text-muted-foreground">
            以上规律基于你截至目前的数据快照。数据越多，发现越准确。
          </p>
        </div>
      )}

      {!patterns && !pending && (
        <p className="text-xs text-muted-foreground">
          点击「生成认知报告」，AI 会跨所有想法寻找你的系统性认知规律。
        </p>
      )}
    </div>
  );
}
