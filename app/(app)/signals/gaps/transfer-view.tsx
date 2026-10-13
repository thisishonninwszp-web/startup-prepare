"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { GapSide, GapTransfer } from "@/lib/domains/signals/gaps-shared";
import { analyzeGapTransferAction } from "../actions";

const HOLDS: Record<GapTransfer["conditions"][number]["holds"], string> = {
  yes: "这边也成立",
  no: "这边不成立",
  unclear: "说不清",
};

function Basis({ basis }: { basis: { url: string; title: string; excerpt: string }[] }) {
  if (basis.length === 0) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">原文</summary>
      <ul className="mt-1 space-y-1">
        {basis.map((b, i) => (
          <li key={i} className="text-muted-foreground">
            「{b.excerpt}」
            <a href={b.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary underline-offset-4 hover:underline">
              {b.title || "来源"} ↗
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** 能不能搬过来：点了才查。每个条件这边成不成立、有没有人试过。不打分、不下结论。 */
export function TransferView({
  signalId,
  side,
  here,
  there,
  initial,
}: {
  signalId: string;
  side: GapSide;
  here: string;
  there: string;
  initial: GapTransfer | null;
}) {
  const [analysis, setAnalysis] = useState<GapTransfer | null>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!analysis) {
    return (
      <div className="mt-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-10 px-2 sm:h-8"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await analyzeGapTransferAction(signalId, side);
              if (result.ok) setAnalysis(result.analysis);
              else setError(result.message);
            })
          }
        >
          {pending ? `在查它在${there}靠什么做成、${here}现在怎样……二三十秒` : `能不能搬到${here}？查一查`}
        </Button>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-md bg-muted/50 p-4 text-sm leading-7">
      <p className="font-medium">
        能不能搬到{here}：它在{there}做成，靠这几条
      </p>
      <ul className="mt-2 space-y-3">
        {analysis.conditions.map((c, i) => (
          <li key={i}>
            <p>
              <span className="font-medium">{c.name}</span>
              <span className="ml-2 font-mono text-xs text-muted-foreground">{HOLDS[c.holds]}</span>
            </p>
            <p>
              <span className="text-muted-foreground">{there}：</span>
              {c.there}
            </p>
            <p>
              <span className="text-muted-foreground">{here}：</span>
              {c.here}
            </p>
            <Basis basis={c.basis} />
          </li>
        ))}
      </ul>
      <div className="mt-3">
        {analysis.precedent ? (
          <>
            <p>
              <span className="text-muted-foreground">有人试过：</span>
              {analysis.precedent.text}
            </p>
            <Basis basis={analysis.precedent.basis} />
          </>
        ) : (
          <p className="text-muted-foreground">没查到有人试过把它带到{here}。</p>
        )}
      </div>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">
        不成立的那几条，就是要搬过来得先解决的事；说不清的那几条，值得找懂行的人问一句。{there}那边的情况是 AI 记的，没上网核实；{here}这边的都查过出处。
      </p>
    </div>
  );
}
