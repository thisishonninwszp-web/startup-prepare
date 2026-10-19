"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { SlowThen } from "@/lib/domains/signals/slow-then-shared";
import { thinkSlowThenAction } from "../actions";

/**
 * 知道这个之后呢（and then?）：点了才推（二三十秒），一周推一次。
 * 两三条"如果这个势头继续"的链，每条带对生意的意思、去哪看、什么情况下会断；
 * 这一周报告里它的表面、差距清单里靠它撑着的。
 */
export function SlowThenView({ variableKey, initial }: { variableKey: string; initial: SlowThen | null }) {
  const [then, setThen] = useState<SlowThen | null>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = () =>
    startTransition(async () => {
      setError(null);
      const r = await thinkSlowThenAction(variableKey);
      if (r.ok) setThen(r.then);
      else setError(r.message);
    });

  if (!then) {
    return (
      <div className="mt-2">
        <Button variant="ghost" size="sm" className="h-10 px-2 sm:h-8" disabled={pending} onClick={run}>
          {pending ? "在往下想……二三十秒" : "知道这个之后呢？往下推一推"}
        </Button>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md bg-muted/50 p-4 text-sm leading-7">
      <p className="font-medium">如果这个势头继续</p>
      <p className="text-xs text-muted-foreground">拿来推的数字：{then.summary}</p>
      <ol className="mt-3 space-y-4">
        {then.chains.map((c, i) => (
          <li key={i}>
            <p className="font-medium">{c.steps.join(" → ")}</p>
            <p>
              <span className="text-muted-foreground">对生意：</span>
              {c.meaning}
            </p>
            <p>
              <span className="text-muted-foreground">去哪看是不是真的在走：</span>
              {c.watch}
            </p>
            <p>
              <span className="text-muted-foreground">什么情况下会断：</span>
              {c.breaks}
            </p>
          </li>
        ))}
      </ol>

      {then.surfaces.length > 0 && (
        <div className="mt-4">
          <p className="font-medium">这一周的报告里，它的表面</p>
          <ul className="mt-1 space-y-1">
            {then.surfaces.map((s) => (
              <li key={s.signal_id}>
                <Link href={`/signals/${s.signal_id}`} className="text-primary underline-offset-4 hover:underline">
                  {s.title}
                </Link>
                <span className="ml-1 text-muted-foreground">—— {s.how}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {then.gaps.length > 0 && (
        <div className="mt-4">
          <p className="font-medium">你的差距清单里，靠它撑着的</p>
          <ul className="mt-1 space-y-1">
            {then.gaps.map((g) => (
              <li key={g.signal_id}>
                <Link href="/signals/gaps" className="text-primary underline-offset-4 hover:underline">
                  {g.headline}
                </Link>
                <span className="ml-1 text-muted-foreground">—— {g.how}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">这个势头要是变了，这几条的机会也跟着变。</p>
        </div>
      )}

      <p className="mt-3 text-xs leading-6 text-muted-foreground">
        链是 AI 顺着推的，不是预测：只说「如果继续，会推着什么」，不说会不会继续。用到的十以上的数字都核对过在上面那句里；新闻和清单的标题核对过对得上。一周推一次。
      </p>
      <Button variant="ghost" size="sm" className="mt-1 h-8 px-2 text-xs" disabled={pending} onClick={run}>
        {pending ? "在重新推……二三十秒" : "重新推一次"}
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
