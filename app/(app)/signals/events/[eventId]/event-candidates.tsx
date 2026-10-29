"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { loadCandidatesAction } from "../actions";
import { EventPicker } from "../event-picker";
import { ExcludeMemberButton } from "../member-controls";

export function EventCandidates({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<{ id: string; title: string | null; source: string; url: string | null; fetched_at: string; reason: string }[] | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const lock = useRef(false);
  async function load() {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try {
      const result = await loadCandidatesAction(eventId);
      if (!result.ok) setError(result.message);
      else if (result.data.status !== "ready") setError(result.data.message);
      else setItems(result.data.items);
    } catch { setError("候选暂不可用；已保存的时间线不受影响。"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="mt-8 rounded-lg border border-dashed p-4" aria-label="可能相关的报道">
    <h2 className="text-base font-semibold">可能相关，等你确认</h2>
    <p className="mt-1 text-xs leading-6 text-muted-foreground">优先按已加入报道检索相似材料；没有报道时按事件名称查找。每项列出匹配依据，确认后才进入正式时间线。</p>
    <Button type="button" size="sm" variant="outline" className="mt-3" disabled={busy} onClick={() => void load()}>{busy ? "查找中……" : items ? "重新查找候选" : "查找可能相关的报道"}</Button>
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    {items?.length === 0 && <p className="mt-3 text-sm text-muted-foreground">没有找到新的候选；这不代表事件没有新进展。</p>}
    {items && items.length > 0 && <ul className="mt-4 space-y-5">{items.map((item) => <li key={item.id} className="border-t pt-3"><Link href={`/signals/${item.id}`} className="text-sm font-medium hover:text-primary">{item.title || "无标题报道"}</Link><p className="mt-1 text-xs text-muted-foreground">{item.source} · 系统收录 {item.fetched_at.slice(0, 10)}</p><p className="mt-2 text-xs leading-6 text-muted-foreground">{item.reason}</p><EventPicker signalId={item.id} defaultTitle={item.title || "事件报道"} initialEventId={eventId} onSaved={() => setItems((old) => old?.filter((row) => row.id !== item.id) ?? null)} /><ExcludeMemberButton eventId={eventId} signalId={item.id} candidate onRemoved={() => setItems((old) => old?.filter((row) => row.id !== item.id) ?? null)} /></li>)}</ul>}
  </section>;
}
