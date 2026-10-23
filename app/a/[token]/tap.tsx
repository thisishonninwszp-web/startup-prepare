"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { RECALL_LABELS, type RecallResult } from "@/lib/domains/signals/recall-shared";
import type { RecallReveal } from "@/lib/domains/signals/recall";
import { confirmTapAction, rateByTokenAction, revealByTokenAction } from "./actions";

const OFFLINE = "没连上服务器（网络断了一下），过一会儿再试。";

/** 标新闻、给预测题点一档：按了才记（邮箱的安全扫描会先打开链接，所以打开不算）。 */
export function ConfirmTap({ token, label }: { token: string; label: string }) {
  const [done, setDone] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return done ? (
    <p className={done.ok ? "text-sm leading-7 text-primary" : "text-sm leading-7 text-destructive"}>{done.message}</p>
  ) : (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            setDone(await confirmTapAction(token));
          } catch {
            setDone({ ok: false, message: OFFLINE });
          }
        })
      }
    >
      {label}
    </Button>
  );
}

/** 回想：想好了看答案，再说记得 / 模糊 / 忘了。 */
export function RecallTap({ token }: { token: string }) {
  const [reveal, setReveal] = useState<RecallReveal | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      setError(null);
      try {
        await fn();
      } catch {
        setError(OFFLINE);
      }
    });
  return (
    <div className="space-y-3 text-sm leading-7">
      {!reveal ? (
        <Button
          disabled={pending}
          onClick={() =>
            run(async () => {
              const r = await revealByTokenAction(token);
              if (r.ok) setReveal(r.reveal);
              else setError(r.message);
            })
          }
        >
          想好了，看答案
        </Button>
      ) : (
        <>
          <p className="text-muted-foreground">{reveal.note ? `你当时写的：${reveal.note}` : "你当时没写为什么。"}</p>
          {reveal.later.length > 0 ? (
            <ul className="space-y-1">
              <li className="text-xs text-muted-foreground">后来：</li>
              {reveal.later.map((h) => (
                <li key={h.id}>
                  <span className="mr-2 font-mono text-xs text-muted-foreground">{h.fetched_at.slice(0, 10)}</span>
                  {h.title}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">存档里还没有它后来的消息。</p>
          )}
          {next ? (
            <p className="text-primary">记上了，{next} 再问你一次。</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">刚才你想起来了吗？</span>
              {(Object.keys(RECALL_LABELS) as RecallResult[]).map((r) => (
                <Button
                  key={r}
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      const x = await rateByTokenAction(token, r);
                      if (x.ok) setNext(x.next);
                      else setError(x.message);
                    })
                  }
                >
                  {RECALL_LABELS[r]}
                </Button>
              ))}
            </div>
          )}
        </>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
