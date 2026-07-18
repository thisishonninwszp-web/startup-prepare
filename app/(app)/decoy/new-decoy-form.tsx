"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createDecoySession } from "./actions";
import { DECOY_STYLES, DEFAULT_DECOY_STYLE, type DecoyStyle } from "./types";

export function NewDecoyForm({ ideaId }: { ideaId: string | null }) {
  const router = useRouter();
  const [problem, setProblem] = useState("");
  const [style, setStyle] = useState<DecoyStyle>(DEFAULT_DECOY_STYLE);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="text-sm font-medium">你卡在什么问题上？</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        写下来就行，不用想清楚。AI 会先给你一份埋了雷的假方案。
      </p>
      <Textarea
        className="mt-3"
        rows={4}
        value={problem}
        onChange={(e) => setProblem(e.target.value)}
        placeholder="例如：不知道第一批种子用户去哪找"
        disabled={pending}
      />

      <p className="mt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        假方案的画风
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {DECOY_STYLES.map((s) => (
          <Button
            key={s.style}
            type="button"
            variant={style === s.style ? "secondary" : "outline"}
            disabled={pending}
            onClick={() => setStyle(s.style)}
            className="h-auto flex-col items-start gap-1 px-3 py-2.5 text-left"
          >
            <span className="text-sm">{s.label}</span>
            <span className="whitespace-normal text-xs font-normal text-muted-foreground">
              {s.description}
            </span>
          </Button>
        ))}
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <div className="mt-3 flex justify-end">
        <Button
          disabled={pending || !problem.trim()}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                const { sessionId } = await createDecoySession({ problem, ideaId, style });
                router.push(`/decoy?session=${sessionId}`);
              } catch (e) {
                setError(e instanceof Error ? e.message : "生成失败，请重试");
              }
            });
          }}
        >
          {pending ? "正在生成假方案…" : "生成假方案"}
        </Button>
      </div>
    </section>
  );
}
