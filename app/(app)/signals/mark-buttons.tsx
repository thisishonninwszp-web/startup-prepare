"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { MARK_LABELS, type MarkKind } from "@/lib/domains/signals/memory-shared";
import { setMarkAction } from "./memory-actions";

/**
 * 看到时点一下：重要 / 跟我有关 / 存疑。点过的就是以后想得起来的钩子 ——
 * 记忆页能翻出来，过一周、一个月、一年会再拿出来给你看一次，连同它后来怎样了。
 */
export function MarkButtons({ signalId, initial, compact }: { signalId: string; initial: MarkKind | null; compact?: boolean }) {
  const [mark, setMark] = useState<MarkKind | null>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const choose = (next: MarkKind) =>
    startTransition(async () => {
      setError(null);
      const value = mark === next ? null : next;
      try {
        const r = await setMarkAction(signalId, value);
        if (r.ok) setMark(value);
        else setError(r.message);
      } catch {
        setError("没连上服务器，过一会儿再试。");
      }
    });

  return (
    <div className={compact ? "inline-flex flex-wrap items-center gap-1" : "flex flex-wrap items-center gap-2"}>
      {!compact && <span className="text-xs text-muted-foreground">标一下：</span>}
      {(Object.keys(MARK_LABELS) as MarkKind[]).map((k) => (
        <Button
          key={k}
          size="sm"
          variant={mark === k ? "secondary" : "ghost"}
          className="h-7 px-2 text-xs"
          disabled={pending}
          aria-pressed={mark === k}
          onClick={() => choose(k)}
        >
          {MARK_LABELS[k]}
        </Button>
      ))}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
