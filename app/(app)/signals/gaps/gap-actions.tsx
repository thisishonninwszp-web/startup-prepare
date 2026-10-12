"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { gapToIdeaAction, recordJapanGapAction } from "../actions";
import type { GapSide } from "@/lib/domains/signals/gaps-shared";

/** 记成观察：写一句为什么想琢磨这条（可以不写）。已经记过的直接给去捕捉页的链接。 */
export function GapActions({
  signalId,
  observed,
  side = "japan",
}: {
  signalId: string;
  observed: boolean;
  side?: GapSide;
}) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "noting" | "kept">(observed ? "kept" : "idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (mode === "kept") {
    return (
      <Link href="/capture" className="text-sm text-primary underline-offset-4 hover:underline">
        已记进观察 →
      </Link>
    );
  }

  if (mode === "noting") {
    return (
      <form
        className="flex w-full flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            try {
              await recordJapanGapAction(signalId, note, side);
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
          placeholder="为什么想琢磨这条？一句话就够，也可以不写"
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
    <span className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" className="h-10 sm:h-8" onClick={() => setMode("noting")}>
        记成观察
      </Button>
      <ToIdeaButton signalId={signalId} side={side} />
    </span>
  );
}

/** 一步到位：变成想法模块里的一个想法，打开它去补目标用户、痛点、愿付多少。 */
function ToIdeaButton({ signalId, side }: { signalId: string; side: GapSide }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-10 sm:h-8"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await gapToIdeaAction(signalId, side);
            if (r.ok) router.push(`/ideas/${r.id}`);
            else setError(r.message);
          })
        }
      >
        {pending ? "在建…" : "变成一个想法 →"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </>
  );
}
