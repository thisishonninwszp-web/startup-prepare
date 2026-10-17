"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { THERE_KINDS, type GapThere, type ThereFact, type ThereKind } from "@/lib/domains/signals/deep-shared";
import type { GapSide } from "@/lib/domains/signals/gaps-shared";
import { runThereAction } from "../../actions";

function FactList({ facts }: { facts: ThereFact[] }) {
  return (
    <ul className="space-y-2">
      {facts.map((f, i) => (
        <li key={i} className="text-sm leading-7">
          {f.text}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">原文</summary>
            <p className="mt-1 text-muted-foreground">
              「{f.excerpt}」
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary underline-offset-4 hover:underline">
                {f.title || "来源"} ↗
              </a>
            </p>
          </details>
        </li>
      ))}
    </ul>
  );
}

/** ① 那边查一查：谁在做、做到多大、怎么收钱、哪年开始。每条附原文。disabled 是迁移没跑时的那句话。 */
export function ThereView({
  signalId,
  side,
  there,
  initial,
  disabled,
}: {
  signalId: string;
  side: GapSide;
  there: string;
  initial: GapThere | null;
  disabled?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = () =>
    startTransition(async () => {
      setError(null);
      const result = await runThereAction(signalId, side);
      if (result.ok) router.refresh();
      else setError(result.message);
    });
  return (
    <div className="space-y-3">
      {initial?.name && (
        <p className="text-xs leading-6 text-muted-foreground">
          按「{initial.name}」{initial.parent ? `（属于 ${initial.parent}）` : ""}去{there}的商业媒体上查的。
        </p>
      )}
      {initial && initial.facts.length > 0 && (
        <div className="space-y-3">
          {(Object.keys(THERE_KINDS) as ThereKind[]).map((kind) => {
            const facts = initial.facts.filter((f) => f.kind === kind);
            return (
              <div key={kind}>
                <p className="text-xs text-muted-foreground">{THERE_KINDS[kind]}</p>
                {facts.length > 0 ? <FactList facts={facts} /> : <p className="text-sm leading-7 text-muted-foreground">没查到。</p>}
              </div>
            );
          })}
          {initial.facts.some((f) => !f.kind) && (
            <div>
              <p className="text-xs text-muted-foreground">没分格的（早先查的）</p>
              <FactList facts={initial.facts.filter((f) => !f.kind)} />
            </div>
          )}
        </div>
      )}
      {initial && initial.facts.length === 0 && (
        <p className="text-sm leading-7 text-muted-foreground">
          {initial.searched.pages === 0 ? "上次一篇都没搜到。" : `上次读了 ${initial.searched.pages} 篇，没有一句能和原文对上，所以一条都没留。`}
          过几天再查，或者拿这几个词自己去搜：{initial.queries.map((q) => `「${q}」`).join("")}
        </p>
      )}
      {initial && (
        <p className="font-mono text-xs text-muted-foreground">
          {initial.checked_at.slice(0, 10)} 查的 · 读了 {initial.searched.pages} 篇
        </p>
      )}
      {disabled ? (
        <p className="text-sm leading-7 text-muted-foreground">{disabled}</p>
      ) : (
        <Button size="sm" variant="outline" disabled={pending} onClick={run}>
          {pending ? `在${there}那边查（三四十秒）…` : initial ? "重查一遍" : `去${there}那边查一查`}
        </Button>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
