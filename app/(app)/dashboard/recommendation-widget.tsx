"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { getRecommendation } from "./actions";
import { Button } from "@/components/ui/button";

export function RecommendationWidget() {
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        setRecommendation(await getRecommendation());
      } catch (err) {
        setError(err instanceof Error ? err.message : "获取建议失败，请重试");
      }
    });
  }

  return (
    <section className="mb-8 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">今日建议</h2>
        </div>
        <Button
          type="button"
          onClick={handleClick}
          disabled={pending}
          className="shrink-0 rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          {pending ? "思考中…" : recommendation ? "换一个角度" : "获取今日建议"}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      {recommendation && (
        <p className="mt-3 text-sm leading-relaxed">{recommendation}</p>
      )}
    </section>
  );
}
