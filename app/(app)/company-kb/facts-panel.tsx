"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { addCompanyKbFact, archiveCompanyKbFact } from "./actions";
import type { CompanyKbFact } from "./types";

export function FactsPanel({ initialFacts }: { initialFacts: CompanyKbFact[] }) {
  const [facts, setFacts] = useState(initialFacts);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = await addCompanyKbFact(value);
      setFacts((prev) => [{ id, fact: value, created_at: new Date().toISOString() }, ...prev]);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "添加失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive(factId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await archiveCompanyKbFact(factId);
      setFacts((prev) => prev.filter((f) => f.id !== factId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {facts.length > 0 && (
        <ul className="space-y-2">
          {facts.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-2 rounded-lg border bg-card p-3 text-sm"
            >
              <span className="min-w-0 flex-1 leading-relaxed">{f.fact}</span>
              <Button
                type="button"
                onClick={() => void handleArchive(f.id)}
                disabled={busy}
                className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                删除
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleAdd();
            }
          }}
          maxLength={1000}
          placeholder="例：我们目前有 3 名全职工程师，产品还没有正式定价"
          className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleAdd()}
          disabled={busy || !text.trim()}
        >
          记下事实
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
