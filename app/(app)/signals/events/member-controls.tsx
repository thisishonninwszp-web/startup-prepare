"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { excludeSignalAction, loadEventHistoryAction } from "./actions";
import { eventRequest } from "./request-id";

export function ExcludeMemberButton({ eventId, signalId, candidate = false, onRemoved }: { eventId: string; signalId: string; candidate?: boolean; onRemoved?: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [done, setDone] = useState(false);
  const lock = useRef(false); const router = useRouter();
  return <div>
    <Button type="button" variant="ghost" size="sm" disabled={busy || done} onClick={async () => {
      if (lock.current) return; lock.current = true; setBusy(true); setError("");
      try {
        const payload = { eventId, signalId, note: candidate ? "用户确认候选不属于这件事" : "用户从当前事件移出，来源和历史保留" };
        const request = await eventRequest("exclude", payload);
        const result = await excludeSignalAction({ ...payload, requestId: request.requestId });
        if (result.ok) { request.complete(); setDone(true); onRemoved?.(); router.refresh(); } else setError(result.message);
      } catch { setError("未完成移出，请重试。原记录仍保留。"); }
      finally { lock.current = false; setBusy(false); }
    }}>{busy ? "保存中……" : done ? "已移出，历史保留" : candidate ? "不属于这件事" : "从此事件移出"}</Button>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}

export function EventHistory({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<{ signal_id: string; action: string; revision: number; note: string | null; created_at: string }[] | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const lock = useRef(false);
  async function load() {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { const result = await loadEventHistoryAction(eventId); if (result.ok) setRows(result.data); else setError(result.message); }
    catch { setError("没能读取归属修订记录，请重试。"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <details className="mt-8 rounded-lg border p-4" onToggle={(e) => { if (e.currentTarget.open && rows === null && !error) void load(); }}>
    <summary className="cursor-pointer text-sm font-medium">查看加入、补充和移出历史</summary>
    <p className="mt-2 text-xs leading-6 text-muted-foreground">移出只改变当前归属，来源快照和过去修订保留。</p>
    {busy && <p className="mt-2 text-sm">读取中……</p>}
    {error && <div className="mt-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void load()}>重新读取</Button></div>}
    {rows?.length === 0 && <p className="mt-3 text-sm text-muted-foreground">还没有归属变更。</p>}
    {rows && rows.length > 0 && <ol className="mt-3 space-y-3">{rows.map((row) => <li key={row.revision} className="text-sm leading-7"><p className="font-mono text-xs text-muted-foreground">修订 {row.revision} · {new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" }).format(new Date(row.created_at))}</p><p>{row.action === "include" ? "加入 / 补充报道" : "移出 / 排除候选"} · <a href={`/signals/${row.signal_id}`} className="text-primary hover:underline">查看原报道</a></p>{row.note && <p>{row.note}</p>}</li>)}</ol>}
  </details>;
}
