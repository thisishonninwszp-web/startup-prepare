"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { addResearchAction } from "./research-actions";
import type { ResearchKind } from "@/lib/domains/signals/events/research-shared";
export function ResearchQuickAction({ eventId, kind, subjectId, payload, label }: { eventId: string; kind: ResearchKind; subjectId?: string; payload: Record<string, unknown>; label: string }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [done, setDone] = useState(false); const lock = useRef(false); const request = useRef<string | null>(null); const router = useRouter();
  return <div><Button size="sm" variant="ghost" type="button" disabled={busy || done} onClick={async () => {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); request.current ??= crypto.randomUUID();
    try { const result = await addResearchAction(eventId, { kind, subjectId, payload, requestId: request.current }); if (result.ok) { setDone(true); router.refresh(); } else setError(result.message); }
    catch { setError("操作未保存，请重试。"); } finally { lock.current = false; setBusy(false); }
  }}>{busy ? "保存中……" : done ? "已追加更正" : label}</Button>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</div>;
}
