"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { runIdeaCollision } from "@/app/(app)/ideas/actions";
import type { IdeaCollisionResult } from "@/app/(app)/ideas/types";

export function CollideForm({
  options,
}: {
  options: { id: string; title: string }[];
}) {
  const [ideaIdA, setIdeaIdA] = useState("");
  const [ideaIdB, setIdeaIdB] = useState("");
  const [result, setResult] = useState<IdeaCollisionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canSubmit = ideaIdA && ideaIdB && ideaIdA !== ideaIdB;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        setResult(await runIdeaCollision(ideaIdA, ideaIdB));
      } catch (err) {
        setError(err instanceof Error ? err.message : "对撞失败，请重试");
      }
    });
  }

  if (options.length < 2) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        至少需要 2 个想法才能对撞。
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <select
            value={ideaIdA}
            onChange={(e) => setIdeaIdA(e.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">选想法 A</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
          <select
            value={ideaIdB}
            onChange={(e) => setIdeaIdB(e.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">选想法 B</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={!canSubmit || pending}>
          {pending ? "对撞中…" : "开始对撞"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>

      {result && (
        <div className="space-y-4">
          {result.shared_assumptions.length > 0 && (
            <div className="rounded-lg border p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                共享假设
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {result.shared_assumptions.map((s, i) => (
                  <li key={i}>· {s}</li>
                ))}
              </ul>
            </div>
          )}

          {result.resource_conflict && (
            <div className="rounded-lg border border-orange-300 bg-orange-50 p-4 dark:border-orange-700 dark:bg-orange-950/20">
              <p className="text-xs font-medium uppercase tracking-wider text-orange-700 dark:text-orange-400">
                资源冲突
              </p>
              <p className="mt-2 text-sm text-orange-900 dark:text-orange-200">
                {result.resource_conflict}
              </p>
            </div>
          )}

          {result.contradictory_theories && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-950/20">
              <p className="text-xs font-medium uppercase tracking-wider text-red-700 dark:text-red-400">
                矛盾的判断
              </p>
              <p className="mt-2 text-sm text-red-900 dark:text-red-200">
                {result.contradictory_theories}
              </p>
            </div>
          )}

          <div className="rounded-lg border p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              没想过的联系
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              {result.unexplored_connection}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
