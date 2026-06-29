"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AiErrorNotice } from "@/components/ai-error-notice";
import { updateFermiComponent, computeSensitivity } from "@/app/reasoning/actions";
import { RealitySourceCard } from "@/app/reasoning/reality-source-card";
import type { RealityReasoningSnapshot } from "@/app/reasoning/reality-source";
import type { FermiComponent, FermiEstimateWithComponents } from "@/app/reasoning/types";

function formatNum(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toFixed(0);
}

function ComponentRow({
  component,
  onUpdate,
}: {
  component: FermiComponent;
  onUpdate: (id: string, low: number, high: number, note: string) => void;
}) {
  const [lowStr, setLowStr] = useState(String(component.low));
  const [highStr, setHighStr] = useState(String(component.high));
  const [note, setNote] = useState(component.user_note);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    const low = parseFloat(lowStr);
    const high = parseFloat(highStr);
    if (!isFinite(low) || !isFinite(high) || low <= 0 || high <= 0 || low > high) {
      return;
    }
    startTransition(async () => {
      await updateFermiComponent(component.id, low, high, note);
      onUpdate(component.id, low, high, note);
      setDirty(false);
    });
  }

  return (
    <div className="rounded-md border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 sm:flex-1">
          <p className="text-sm font-medium">{component.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {component.rationale}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <input
            type="number"
            value={lowStr}
            onChange={(e) => {
              setLowStr(e.target.value);
              setDirty(true);
            }}
            className="w-24 rounded border bg-background px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            min="0"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <input
            type="number"
            value={highStr}
            onChange={(e) => {
              setHighStr(e.target.value);
              setDirty(true);
            }}
            className="w-24 rounded border bg-background px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            min="0"
          />
        </div>
      </div>
      {dirty && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="备注（可选）"
            className="flex-1 rounded border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button size="sm" onClick={handleSave} disabled={pending}>
            {pending ? "保存中…" : "保存"}
          </Button>
        </div>
      )}
      {component.sensitivity && (
        <p className="mt-2 text-xs text-muted-foreground border-t pt-2">
          偏差 3 倍时：{component.sensitivity}
        </p>
      )}
    </div>
  );
}

export function FermiWorkspace({
  estimate: initialEstimate,
  realitySource,
}: {
  estimate: FermiEstimateWithComponents;
  realitySource: RealityReasoningSnapshot | null;
}) {
  const [components, setComponents] = useState(initialEstimate.components);
  const [finalLow, setFinalLow] = useState(initialEstimate.final_low ?? 0);
  const [finalHigh, setFinalHigh] = useState(initialEstimate.final_high ?? 0);
  const [sensitivityPending, startSensitivity] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleComponentUpdate(
    id: string,
    low: number,
    high: number,
    note: string
  ) {
    const updated = components.map((c) =>
      c.id === id ? { ...c, low, high, user_note: note } : c
    );
    setComponents(updated);
    const newLow = updated.reduce((acc, c) => acc * c.low, 1);
    const newHigh = updated.reduce((acc, c) => acc * c.high, 1);
    setFinalLow(newLow);
    setFinalHigh(newHigh);
  }

  function handleSensitivity() {
    setError(null);
    startSensitivity(async () => {
      try {
        await computeSensitivity(initialEstimate.id);
        window.location.reload();
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
        / 费米估算
      </div>

      <div className="mb-8">
        <h1 className="text-lg font-semibold leading-snug">
          {initialEstimate.question}
        </h1>
        {realitySource && (
          <div className="mt-4">
            <RealitySourceCard snapshot={realitySource} showLink />
          </div>
        )}
        <div className="mt-4 rounded-lg border bg-card p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">估算范围</p>
          <p className="text-3xl font-bold tabular-nums">
            {formatNum(finalLow)} – {formatNum(finalHigh)}
            {initialEstimate.unit && (
              <span className="ml-1 text-base font-normal text-muted-foreground">
                {initialEstimate.unit}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="mb-6 space-y-1">
        <h2 className="text-sm font-medium text-muted-foreground mb-2">
          组成部分（直接编辑区间，结果实时更新）
        </h2>
        {components.map((component, index) => (
          <div key={component.id}>
            <ComponentRow component={component} onUpdate={handleComponentUpdate} />
            {index < components.length - 1 && (
              <div className="flex justify-center py-1">
                <span className="text-muted-foreground text-sm">×</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-3 mb-6">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSensitivity}
          disabled={sensitivityPending}
        >
          {sensitivityPending ? "AI 分析中…" : "分析敏感性"}
        </Button>
      </div>

      <AiErrorNotice error={error} />

      {initialEstimate.ai_teaching && (
        <aside className="rounded-md bg-muted/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground border">
          <p className="font-medium text-foreground/70 mb-1">为什么要拆解？</p>
          <p>{initialEstimate.ai_teaching}</p>
        </aside>
      )}
    </div>
  );
}
