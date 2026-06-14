"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { findRecurringSignals, type RecurringSignal } from "./actions";
import { promoteObservationToIdea } from "../ideas/actions";

export function RecurringSignals() {
  const [signals, setSignals] = useState<RecurringSignal[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoted, setPromoted] = useState<Record<string, boolean>>({});

  async function scan() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await findRecurringSignals();
      setSignals(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "扫描失败");
    } finally {
      setLoading(false);
    }
  }

  async function promote(repId: string) {
    try {
      await promoteObservationToIdea(repId);
      setPromoted((p) => ({ ...p, [repId]: true }));
    } catch {
      setError("提升失败，请重试");
    }
  }

  return (
    <section className="mx-auto mt-10 max-w-2xl border-t pt-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">反复信号</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            你的大脑会忽略自己的重复模式。让 AI 把反复出现的主题找出来。
          </p>
        </div>
        <Button variant="outline" onClick={scan} disabled={loading}>
          {loading ? "扫描中…" : signals ? "重新扫描" : "找出反复信号"}
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {signals && signals.length === 0 && !loading && (
        <p className="mt-4 text-sm text-muted-foreground">
          暂时没有反复出现的信号。继续记录，模式会慢慢浮现。
        </p>
      )}

      {signals && signals.length > 0 && (
        <ul className="mt-4 space-y-2">
          {signals.map((s) => (
            <li
              key={s.repId}
              className="rounded-lg border bg-card p-4 transition-colors hover:border-foreground/20"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium">{s.theme}</span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {s.count} 次
                  </span>
                </div>
                {promoted[s.repId] ? (
                  <span className="shrink-0 text-xs text-green-600">已提升 ✓</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => promote(s.repId)}
                    className="shrink-0 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
                  >
                    提升为想法
                  </button>
                )}
              </div>
              {s.sampleText && (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                  例：{s.sampleText}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
