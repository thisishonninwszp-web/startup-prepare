"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { exportCoreDecisionData } from "./actions";

export function ExportButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleExport() {
    setError(null);
    startTransition(async () => {
      try {
        const json = await exportCoreDecisionData();
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const date = new Date().toISOString().slice(0, 10);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ideaos-export-${date}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "导出失败，请重试");
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={handleExport} disabled={pending}>
        {pending ? "导出中…" : "导出为 JSON"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
