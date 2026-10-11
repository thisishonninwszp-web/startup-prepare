"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dismissSignal, keepSignal } from "./actions";

/**
 * 记一笔 / 不看了。列表和详情页共用。
 * 记一笔：写一句为什么在意（可以不写），记成带「外部」标签的观察。
 */
export function SignalActions({
  id,
  onDismissed,
}: {
  id: string;
  onDismissed?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "noting" | "kept" | "dismissed">("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (mode === "kept") {
    return (
      <Link href="/capture" className="text-sm text-primary underline-offset-4 hover:underline">
        已记进观察 →
      </Link>
    );
  }
  if (mode === "dismissed") return <span className="text-sm text-muted-foreground">不看了</span>;

  if (mode === "noting") {
    return (
      <form
        className="flex w-full flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            try {
              await keepSignal(id, note);
              setMode("kept");
            } catch (err) {
              setError(err instanceof Error ? err.message : "没记下来");
            }
          });
        }}
      >
        <Input
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="为什么在意？一句话就够，也可以不写"
          maxLength={200}
        />
        <div className="flex shrink-0 gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "记下中…" : "记下"}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setMode("idle")}>
            取消
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </form>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <Button variant="outline" size="sm" disabled={pending} onClick={() => setMode("noting")}>
        记一笔
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              await dismissSignal(id);
              setMode("dismissed");
              onDismissed?.();
            } catch (err) {
              setError(err instanceof Error ? err.message : "没忽略掉");
            }
          })
        }
      >
        不看了
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
