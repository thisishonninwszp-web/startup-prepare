"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RECALL_LABELS, type RecallResult } from "@/lib/domains/signals/recall-shared";
import type { RecallItem, RecallReveal } from "@/lib/domains/signals/recall";
import { rateRecallAction, recallRevealAction } from "./memory-actions";

const OFFLINE = "没连上服务器（网络断了一下），过一会儿再试。";

/**
 * 一条回想：先只给标题，让他自己想「当时为什么在意？后来怎样了？」，想过再看答案（他写的为什么、后来的消息），
 * 然后说记得 / 模糊 / 忘了 —— 记得的越隔越久再问。
 */
export function RecallCard({ item }: { item: RecallItem }) {
  const [reveal, setReveal] = useState<RecallReveal | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const show = () =>
    startTransition(async () => {
      setError(null);
      try {
        const r = await recallRevealAction(item.signal_id);
        if (r.ok) setReveal(r.reveal);
        else setError(r.message);
      } catch {
        setError(OFFLINE);
      }
    });
  const rate = (result: RecallResult) =>
    startTransition(async () => {
      setError(null);
      try {
        const r = await rateRecallAction(item.signal_id, result);
        if (r.ok) setNext(r.next);
        else setError(r.message);
      } catch {
        setError(OFFLINE);
      }
    });

  return (
    <div className="rounded-lg border border-border bg-card p-4 text-sm leading-7">
      <p className="text-xs text-muted-foreground">
        {item.fetched_at.slice(0, 10)} · {item.reason}
      </p>
      <p className="font-medium">{item.title ?? "（没有标题）"}</p>
      {!reveal ? (
        <>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">先别看答案：当时你为什么在意它？你觉得后来怎样了？在心里说一遍。</p>
          <Button size="sm" variant="outline" className="mt-2" disabled={pending} onClick={show}>
            想好了，看答案
          </Button>
        </>
      ) : (
        <div className="mt-2 border-t border-border pt-2">
          <p className="text-xs text-muted-foreground">{reveal.note ? `你当时写的：${reveal.note}` : "你当时没写为什么。"}</p>
          {reveal.later.length > 0 ? (
            <ul className="mt-1 space-y-1">
              <li className="text-xs text-muted-foreground">后来：</li>
              {reveal.later.map((h) => (
                <li key={h.id} className="text-xs leading-6">
                  <span className="mr-2 font-mono text-muted-foreground">{h.fetched_at.slice(0, 10)}</span>
                  <Link href={`/signals/${h.id}`} className="transition-colors duration-150 hover:text-primary">
                    {h.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">存档里还没有它后来的消息。</p>
          )}
          {next ? (
            <p className="mt-2 text-xs text-primary">记上了，{next} 再问你一次。</p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">刚才你想起来了吗？</span>
              {(Object.keys(RECALL_LABELS) as RecallResult[]).map((r) => (
                <Button key={r} size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={pending} onClick={() => rate(r)}>
                  {RECALL_LABELS[r]}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
