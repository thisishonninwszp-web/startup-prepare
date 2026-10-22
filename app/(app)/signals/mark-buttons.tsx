"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MARK_LABELS, type MarkKind } from "@/lib/domains/signals/memory-shared";
import { setMarkAction } from "./memory-actions";

/**
 * 看到时点一下：重要 / 跟我有关 / 存疑。点过的就是以后想得起来的钩子 ——
 * 记忆页能翻出来，过一周、一个月、一年会再拿出来给你看一次，连同它后来怎样了。
 * 点完可以顺手写一句为什么在意（可以不写）：记忆页「你最近在意什么」列的就是这些原话。
 */
export function MarkButtons({
  signalId,
  initial,
  initialNote,
  compact,
}: {
  signalId: string;
  initial: MarkKind | null;
  initialNote?: string | null;
  compact?: boolean;
}) {
  const [mark, setMark] = useState<MarkKind | null>(initial);
  const [note, setNote] = useState(initialNote ?? "");
  const [savedNote, setSavedNote] = useState(initialNote ?? "");
  const [writing, setWriting] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const save = (value: MarkKind | null, text: string, after: () => void) =>
    startTransition(async () => {
      setError(null);
      try {
        const r = await setMarkAction(signalId, value, text);
        if (r.ok) after();
        else setError(r.message);
      } catch {
        setError("没连上服务器，过一会儿再试。");
      }
    });

  const choose = (next: MarkKind) => {
    const value = mark === next ? null : next;
    save(value, value ? savedNote : "", () => {
      setMark(value);
      if (value === null) {
        setNote("");
        setSavedNote("");
      }
      setWriting(value !== null && !savedNote);
    });
  };

  const saveNote = () =>
    save(mark, note, () => {
      setSavedNote(note.trim());
      setWriting(false);
    });

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
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
        {mark && !writing && savedNote && (
          <button type="button" className="text-left text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground" onClick={() => setWriting(true)}>
            —— {savedNote}（改）
          </button>
        )}
        {mark && !writing && !savedNote && !compact && (
          <button type="button" className="text-xs text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline" onClick={() => setWriting(true)}>
            写一句为什么在意
          </button>
        )}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
      {mark && writing && (
        <form
          className="flex max-w-xl items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            saveNote();
          }}
        >
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="一句：为什么在意（可以不写）"
            className="h-8 text-xs"
            aria-label="为什么在意"
          />
          <Button type="submit" size="sm" variant="secondary" className="h-8 shrink-0 px-3 text-xs" disabled={pending}>
            记下
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 shrink-0 px-2 text-xs" disabled={pending} onClick={() => setWriting(false)}>
            不写了
          </Button>
        </form>
      )}
    </div>
  );
}
