"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MY_TIERS, pct } from "@/lib/domains/signals/forecast-shared";
import type { DrillQuestion, DrillReveal } from "@/lib/domains/signals/backtest";
import { answerDrillAction } from "./actions";

const OFFLINE = "没连上服务器（网络断了一下），过一会儿再试。";

const PERSPECTIVE_LABELS = { outside: "同类的事一般怎样", inside: "这件事眼下到哪一步", devil: "专找容易看漏的" } as const;

/**
 * 一道校准练习：假装今天是那一天，先写「这一类事一般几成会发生」，再写这件事几成，马上揭晓。
 * 记得结果的点「我记得结果」，不计分。
 */
export function DrillCard({ q }: { q: DrillQuestion }) {
  const router = useRouter();
  const [base, setBase] = useState<number | null>(null);
  const [baseDone, setBaseDone] = useState(false);
  const [reveal, setReveal] = useState<DrillReveal | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (probability: number | null, knew: boolean) =>
    startTransition(async () => {
      setError(null);
      try {
        const r = await answerDrillAction(q.id, { baseRate: base, probability, knew });
        if (r.ok) setReveal(r.reveal);
        else setError(r.message);
      } catch {
        setError(OFFLINE);
      }
    });

  const tiers = (onPick: (p: number) => void, chosen: number | null) => (
    <div className="mt-1 flex flex-wrap gap-1">
      {MY_TIERS.map((p) => (
        <Button
          key={p}
          size="sm"
          variant={chosen === p ? "secondary" : "outline"}
          className="h-8 px-2 font-mono text-xs"
          disabled={pending || reveal !== null}
          onClick={() => onPick(p)}
        >
          {pct(p)}
        </Button>
      ))}
    </div>
  );

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="font-mono text-xs text-muted-foreground">
        假设今天是 {q.as_of}
        {q.category ? ` · ${q.category}` : ""}
      </p>
      <p className="mt-2 text-base font-medium leading-7">{q.title}</p>
      <p className="mt-1 text-sm leading-7 text-muted-foreground">怎么才算「会」：{q.criteria}</p>

      {q.news.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground">那天以前的新闻（{q.news.length} 条，AI 看到的也是这些）</summary>
          <ul className="mt-2 space-y-1 border-l border-border pl-3">
            {q.news.map((n) => (
              <li key={n.url || n.title} className="text-xs leading-6">
                <span className="mr-2 font-mono text-muted-foreground">{n.date.slice(5)}</span>
                {n.title}
                <span className="ml-1 text-muted-foreground">{n.domain}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {!reveal && (
        <>
          <p className="mt-4 text-xs text-muted-foreground">① 先别看细节：这一类事（同类的公司、同类的政策、类似的期限）一般几成会发生？</p>
          {tiers((p) => {
            setBase(p);
            setBaseDone(true);
          }, base)}
          {!baseDone && (
            <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs" disabled={pending} onClick={() => setBaseDone(true)}>
              想不出同类的，跳过
            </Button>
          )}
          {baseDone && (
            <>
              <p className="mt-4 text-xs text-muted-foreground">② 再看这件事本身：到截止日，你觉得「会」的可能有多大？点了就揭晓。</p>
              {tiers((p) => submit(p, false), null)}
            </>
          )}
          <Button size="sm" variant="ghost" className="mt-3 h-7 px-2 text-xs" disabled={pending} onClick={() => submit(null, true)}>
            我记得结果（这道不计分）
          </Button>
        </>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      {reveal && <Reveal r={reveal} onNext={() => router.refresh()} />}
    </div>
  );
}

function Reveal({ r, onNext }: { r: DrillReveal; onNext: () => void }) {
  const score = r.you !== null ? (r.you - (r.outcome ? 1 : 0)) ** 2 : null;
  return (
    <div className="mt-4 border-t border-border pt-4 text-sm leading-7">
      <p className="text-base font-semibold">{r.outcome ? "结果：发生了" : "结果：没发生"}</p>
      <p className="text-xs text-muted-foreground">市场在 {r.resolvedOn} 结算</p>
      <p className="font-mono text-xs text-muted-foreground">
        {r.knew ? "你记得结果，这道不计分" : `你 ${r.you !== null ? pct(r.you) : "—"}${r.baseRate !== null ? `（基准率写的 ${pct(r.baseRate)}）` : ""}`}
        {r.market !== null ? ` · 那天市场 ${pct(r.market)}` : ""}
        {r.ai ? ` · AI ${pct(r.ai.median)}` : ""}
        {r.aiCalibrated !== null ? `（校准后 ${pct(r.aiCalibrated)}）` : ""}
      </p>
      {score !== null && (
        <p className="text-xs text-muted-foreground">
          这一道你的分 {score.toFixed(2)}（越小越准；永远说五成是 0.25）
        </p>
      )}
      {r.ai && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">AI 当时怎么想的</summary>
          <ul className="mt-1 space-y-2">
            {(["outside", "inside", "devil"] as const).map((k) => {
              const v = r.ai?.[k];
              return v ? (
                <li key={k} className="text-xs leading-6">
                  <span className="font-mono">{PERSPECTIVE_LABELS[k]} {pct(v.p)}</span>：{v.reason}
                </li>
              ) : null;
            })}
          </ul>
        </details>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        原题：{r.originalTitle}
        {r.url && (
          <a href={r.url} target="_blank" rel="noreferrer" className="ml-1 underline-offset-4 hover:underline">
            ↗
          </a>
        )}
      </p>
      <Button size="sm" className="mt-3" onClick={onNext}>
        下一道
      </Button>
    </div>
  );
}
