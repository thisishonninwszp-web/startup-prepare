"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MY_TIERS, pct } from "@/lib/domains/signals/forecast-shared";
import type { Proposal } from "@/lib/domains/signals/experiments-shared";
import type { ExperimentForecast } from "@/lib/domains/signals/experiments";
import { saveExperimentForecastAction } from "../memory-actions";

const OFFLINE = "没连上服务器（网络断了一下），过一会儿再试。";

/** 一道可以先猜的：题目和门槛是代码出的，他点几成。 */
export function ProposalCard({ p }: { p: Proposal }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pick = (probability: number) =>
    startTransition(async () => {
      setError(null);
      try {
        const r = await saveExperimentForecastAction({ kind: p.kind, targetId: p.targetId, platform: p.platform }, probability);
        if (r.ok) router.refresh();
        else setError(r.message);
      } catch {
        setError(OFFLINE);
      }
    });
  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-medium leading-7">{p.question}</p>
      <p className="text-xs text-muted-foreground">
        {p.dueOn} 对账 · 门槛按你以前同类实验的中位数定{p.baseline > 0 ? `，从现在的 ${p.baseline} 往后算` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {MY_TIERS.map((x) => (
          <Button key={x} size="sm" variant="outline" className="h-8 px-2 font-mono text-xs" disabled={pending} onClick={() => pick(x)}>
            {pct(x)}
          </Button>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </li>
  );
}

/** 猜过的一道：还没到期、等他填数、或者对过账。 */
export function ExperimentRow({ f, waiting }: { f: ExperimentForecast; waiting?: boolean }) {
  return (
    <li className="text-sm leading-7">
      <span>{f.question}</span>
      <span className="ml-2 font-mono text-xs text-muted-foreground">你 {pct(f.probability)}</span>
      {f.status === "resolved" ? (
        <span className="ml-2 text-xs">
          <span className="font-medium">{f.outcome ? "到了" : "没到"}</span>
          <span className="text-muted-foreground">（实际 {f.observed}，门槛 {f.threshold}）</span>
        </span>
      ) : waiting ? (
        <span className="ml-2 text-xs text-primary">到期了，去周刊页填一下这个平台的数就能对账</span>
      ) : (
        <span className="ml-2 text-xs text-muted-foreground">{f.due_on} 对账</span>
      )}
    </li>
  );
}
