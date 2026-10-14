"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { LEANS, leanSummary, tallyLeans, type Breakdown, type Lean } from "@/lib/domains/signals/breakdown-shared";
import type { HorizonKey } from "@/lib/domains/signals/practice-shared";
import { ensureBreakdownAction, saveBreakdownLeansAction } from "./actions";
import { JudgmentForm } from "./judgment-forms";

/**
 * 每日练习：先拆一拆，再写判断。
 * 拆解卡给地图不给方向 —— 这件事由哪几个因素决定、怎么起作用、现在怎样、去哪看；
 * 每个因素偏向哪边由他自己点，点的结果交判断时一起给挑刺看（哪个看反了、漏了）。
 */
export function PracticeComposer({
  date,
  initialBreakdown,
  signalId,
  question,
  knownTags,
  defaultHorizon,
  deadline,
}: {
  /** 这道题是哪一天报告里的（拆解卡存在那一天的报告里）。 */
  date: string;
  initialBreakdown: Breakdown | null;
  signalId: string;
  question: string;
  knownTags: string[];
  defaultHorizon: HorizonKey;
  deadline?: string;
}) {
  const [breakdown, setBreakdown] = useState<Breakdown | null>(initialBreakdown);
  const [leans, setLeans] = useState<(Lean | null)[]>(initialBreakdown?.leans ?? initialBreakdown?.factors.map(() => null) ?? []);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const generate = () =>
    startTransition(async () => {
      setError(null);
      const result = await ensureBreakdownAction(date);
      if (result.ok) {
        setBreakdown(result.breakdown);
        setLeans(result.breakdown.leans ?? result.breakdown.factors.map(() => null));
      } else setError(result.message);
    });

  const pick = (i: number, lean: Lean) => {
    const next = leans.map((l, j) => (j === i ? (l === lean ? null : lean) : l));
    setLeans(next);
    // 记不上不影响写判断，只是下次打开要重点
    void saveBreakdownLeansAction(date, next);
  };

  const tally = tallyLeans(leans);

  return (
    <div className="space-y-5">
      {!breakdown ? (
        <div>
          <p className="mb-2 text-sm leading-7 text-muted-foreground">
            不知道从哪想起？先拆一拆：这件事由哪几个因素决定、每个怎么起作用、现在是什么情况、去哪看。
            只给地图，不给方向 —— 往哪边偏由你自己点。
          </p>
          <Button variant="outline" size="sm" disabled={pending} onClick={generate}>
            {pending ? "在拆、在查每个因素现在怎样……二三十秒" : "先拆一拆"}
          </Button>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
      ) : (
        <div>
          <p className="text-sm font-medium">这件事由这几个因素决定</p>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            「怎么起作用」是 AI 写的原理；「现在」是上网查的，原文逐字核对过。每个因素偏向哪边，你自己点 —— AI 不说方向。
          </p>
          <ol className="mt-3 space-y-5">
            {breakdown.factors.map((f, i) => (
              <li key={i} className="rounded-md border border-border bg-background p-4 text-sm leading-7">
                <p className="font-medium">
                  {i + 1}. {f.factor}
                </p>
                <p>
                  <span className="text-muted-foreground">怎么起作用：</span>
                  {f.mechanism}
                </p>
                <p>
                  <span className="text-muted-foreground">现在：</span>
                  {f.now}
                </p>
                {f.basis.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">原文</summary>
                    <ul className="mt-1 space-y-1">
                      {f.basis.map((b, j) => (
                        <li key={j} className="text-muted-foreground">
                          「{b.excerpt}」
                          <a href={b.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary underline-offset-4 hover:underline">
                            {b.title || "来源"} ↗
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <p className="text-xs text-muted-foreground">去哪看：{f.indicator}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(Object.keys(LEANS) as Lean[]).map((l) => (
                    <Button key={l} size="sm" variant={leans[i] === l ? "secondary" : "ghost"} onClick={() => pick(i, l)}>
                      {LEANS[l]}
                    </Button>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          {tally.yes + tally.no + tally.unclear > 0 && (
            <p className="mt-3 font-mono text-xs text-muted-foreground">
              你点的：偏向会 {tally.yes} · 偏向不会 {tally.no} · 看不出 {tally.unclear}
            </p>
          )}
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            几个因素指向不同方向时，判断就是在掂量哪个更重 —— 想清楚了再写下面那句。
          </p>
        </div>
      )}

      <JudgmentForm
        signalId={signalId}
        question={question}
        knownTags={knownTags}
        defaultHorizon={defaultHorizon}
        deadline={deadline}
        reasoning={leanSummary(breakdown, leans)}
      />
    </div>
  );
}
