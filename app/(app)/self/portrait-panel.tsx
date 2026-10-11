"use client";

import { Button } from "@/components/ui/button";
import { Err, useAction } from "./self-forms";
import { generatePortrait } from "./actions";
import type { PortraitSnapshot } from "./queries";
import {
  PORTRAIT_AXES,
  WRITING_KIND_LABELS,
  formatPercent,
  formatScore,
  hasEvidence,
  scoreShift,
  type PortraitAxisResult,
  type WritingKind,
} from "@/lib/domains/self-model/portrait";

function AxisRow({
  axis,
  result,
  previous,
}: {
  axis: (typeof PORTRAIT_AXES)[number];
  result: PortraitAxisResult;
  previous: PortraitAxisResult | undefined;
}) {
  const grounded = hasEvidence(result);
  const shift = scoreShift(result, previous);
  const top = result.probabilities.indexOf(Math.max(...result.probabilities));

  return (
    <div className="self-row space-y-2 py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">{axis.name}</span>
        <span className="font-mono text-sm">
          {grounded ? formatScore(result.score) : "—"}
          <span className="text-muted-foreground"> / 4</span>
        </span>
        {shift !== null && shift !== 0 && (
          <span className="font-mono text-xs text-muted-foreground">
            比上次 {shift > 0 ? "+" : ""}
            {shift.toFixed(1)}
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          把握 {formatPercent(result.confidence)} · 讲到过 {formatPercent(result.evidence)}
        </span>
      </div>

      <div className={grounded ? "" : "opacity-50"}>
        <div className="grid grid-cols-5 gap-1">
          {result.probabilities.map((p, level) => (
            <div key={level} className="flex flex-col items-center gap-1">
              <div className="flex h-10 w-full items-end rounded-sm bg-muted">
                <div
                  className={
                    level === top ? "w-full rounded-sm bg-primary" : "w-full rounded-sm bg-foreground/30"
                  }
                  style={{ height: `${Math.max(p * 100, 2)}%` }}
                />
              </div>
              <span className="font-mono text-[11px] text-muted-foreground">
                {formatPercent(p)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-0.5 flex justify-between text-xs text-muted-foreground">
          <span>← {axis.low}</span>
          <span>{axis.high} →</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {grounded
          ? axis.hint
          : "这批字里没怎么讲到这件事，上面的分布是 Jev 硬猜的，别当真。"}
      </p>
    </div>
  );
}

function SourceList({ snapshot }: { snapshot: PortraitSnapshot }) {
  const counts = (Object.keys(WRITING_KIND_LABELS) as WritingKind[])
    .filter((kind) => snapshot.counts[kind] > 0)
    .map((kind) => `${WRITING_KIND_LABELS[kind]} ${snapshot.counts[kind]}`)
    .join(" · ");

  return (
    <details className="self-panel">
      <summary className="cursor-pointer px-3.5 py-2 text-sm transition-colors duration-150">
        这次读了 {snapshot.sources.length} 段、{snapshot.chars} 字
        <span className="text-muted-foreground"> —— {counts}</span>
      </summary>
      <div className="self-panel__body max-h-96 space-y-1 overflow-y-auto">
        {snapshot.sources.map((source, index) => (
          <div key={index} className="self-row flex gap-3 py-1.5 text-[13px]">
            <span className="w-20 shrink-0 font-mono text-[11px] text-muted-foreground">
              {source.date}
            </span>
            <span className="w-24 shrink-0 text-xs text-muted-foreground">
              {WRITING_KIND_LABELS[source.kind]}
            </span>
            <span className="min-w-0 flex-1">{source.text}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

function History({ snapshots }: { snapshots: PortraitSnapshot[] }) {
  return (
    <div className="self-panel">
      <div className="self-panel__head">
        <span className="self-label">history</span>
        <span className="text-sm font-medium">以前读过的</span>
      </div>
      <div className="self-panel__body overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 pr-3 font-normal">日期</th>
              {PORTRAIT_AXES.map((axis) => (
                <th key={axis.key} className="py-1 pr-3 font-normal">
                  {axis.name}
                </th>
              ))}
              <th className="py-1 font-normal">读了</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((snapshot) => (
              <tr key={snapshot.id} className="self-row">
                <td className="py-1.5 pr-3 font-mono text-[11px] text-muted-foreground">
                  {snapshot.createdAt.slice(0, 10)}
                </td>
                {PORTRAIT_AXES.map((axis) => {
                  const result = snapshot.answers[axis.key];
                  return (
                    <td key={axis.key} className="py-1.5 pr-3 font-mono">
                      {hasEvidence(result) ? formatScore(result.score) : "—"}
                    </td>
                  );
                })}
                <td className="py-1.5 font-mono text-[11px] text-muted-foreground">
                  {snapshot.sources.length} 段
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PortraitPanel({ snapshots }: { snapshots: PortraitSnapshot[] }) {
  const { pending, error, run } = useAction();
  const [latest, previous] = snapshots;

  return (
    <div className="space-y-6">
      <div className="self-panel">
        <div className="self-panel__head">
          <span className="self-label">portrait · jev</span>
          <span className="text-sm font-medium">你写字的样子</span>
          {latest && (
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">
              {latest.createdAt.slice(0, 10)} · {latest.model}
            </span>
          )}
        </div>
        <div className="self-panel__body space-y-3">
          <p className="text-sm text-muted-foreground">
            这些数字是 Jev 读了你亲手写下的字给出来的。它量的是你怎么讲自己，
            不是你做了什么 —— 同一件事换个口气写，数字就会动。
            它不进台账，不影响任何档位和特性。
          </p>

          {latest ? (
            <div>
              {PORTRAIT_AXES.map((axis) => (
                <AxisRow
                  key={axis.key}
                  axis={axis}
                  result={latest.answers[axis.key]}
                  previous={previous?.answers[axis.key]}
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm">
              这里空着。点下面的按钮，Jev 会把你最近的复盘发言、随手捕捉、自述和「学到了」
              读一遍，在四个方向上各给一个判断。
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              type="button"
              size="sm"
              variant={latest ? "outline" : "default"}
              disabled={pending}
              onClick={() => run(() => generatePortrait())}
            >
              {pending ? "Jev 在读…" : latest ? "再读一遍" : "让 Jev 读一遍"}
            </Button>
            <span className="text-xs text-muted-foreground">
              每读一次用一点 TypeSafe 的额度。写了新东西再读才有意义。
            </span>
          </div>
          <Err message={error} />
        </div>
      </div>

      {latest && <SourceList snapshot={latest} />}
      {snapshots.length > 1 && <History snapshots={snapshots} />}
    </div>
  );
}
