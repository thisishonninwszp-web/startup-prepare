"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createEventAction, includeSignalAction, listEventsAction } from "./actions";
import { eventRequest } from "./request-id";
import { OccurrenceFields, emptyOccurrence, occurrenceInput, type OccurrenceDraft } from "./occurrence-fields";
import type { EventRecord } from "@/lib/domains/signals/events/domain";
import type { TimelineEntry } from "@/lib/domains/signals/events/domain";

export function EventPicker({ signalId, defaultTitle, initialEventId, initialSnapshotId, initialNote = "", initialOccurred = null, onSaved }: { signalId: string; defaultTitle: string; initialEventId?: string; initialSnapshotId?: string; initialNote?: string | null; initialOccurred?: TimelineEntry["occurred"]; onSaved?: () => void }) {
  const id = useId(); const router = useRouter();
  const [items, setItems] = useState<EventRecord[]>([]); const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState(initialEventId ?? ""); const [search, setSearch] = useState("");
  const [title, setTitle] = useState(defaultTitle.slice(0, 120)); const [note, setNote] = useState(initialNote ?? "");
  const [occurred, setOccurred] = useState<OccurrenceDraft>(initialOccurred ? { enabled: true, ...initialOccurred, to: initialOccurred.to ?? "" } : emptyOccurrence());
  const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false);
  const [error, setError] = useState(""); const [savedEvent, setSavedEvent] = useState<string | null>(null);
  const loadLock = useRef(false); const saveLock = useRef(false); const created = useRef<string | null>(null);
  async function load() {
    if (loadLock.current) return; loadLock.current = true; setLoading(true); setError("");
    try {
      const result = await listEventsAction(search);
      if (!result.ok) setError(result.message);
      else if (result.data.status !== "ready") setError("事件档案尚未启用，请联系维护者完成数据库更新。");
      else { setItems(result.data.items); setLoaded(true); }
    } catch { setError("没能读取你的档案，请重试。"); }
    finally { loadLock.current = false; setLoading(false); }
  }
  return <details className="mt-3 rounded-md border p-3" onToggle={(e) => { if (e.currentTarget.open && !initialEventId && !loaded && !loadLock.current) void load(); }}>
    <summary className="cursor-pointer text-sm font-medium">{initialEventId ? "补充这条报道的时间与备注" : "加入事件档案"}</summary>
    <p className="mt-2 text-xs leading-6 text-muted-foreground">只归入同一件具体的事。相同主题不一定是同一事件；原文快照会保留。</p>
    {!initialEventId && <div className="mt-3 flex gap-2"><Input aria-label="搜索已有事件" value={search} maxLength={120} onChange={(e) => setSearch(e.target.value)} placeholder="搜索已有事件" disabled={loading || saving} /><Button type="button" variant="outline" disabled={loading || saving} onClick={() => void load()}>{loading ? "读取中……" : "查找"}</Button></div>}
    <form className="mt-3 space-y-3" onSubmit={async (e) => {
      e.preventDefault(); if (saveLock.current) return; saveLock.current = true; setSaving(true); setError("");
      try {
        const createRequest = await eventRequest("picker-create", { signalId, title, scopeNote: "" });
        let eventId = initialEventId || (selected !== "new" ? selected : "") || created.current;
        if (!eventId) {
          const result = await createEventAction({ title, scopeNote: "", requestId: createRequest.requestId });
          if (!result.ok) { setError(result.message); return; }
          eventId = result.data.id; created.current = eventId;
        }
        const payload = { eventId, signalId, note, occurred: occurrenceInput(occurred), ...(initialSnapshotId ? { snapshotId: initialSnapshotId } : {}) };
        const includeRequest = await eventRequest("include", payload);
        const result = await includeSignalAction({ ...payload, requestId: includeRequest.requestId });
        if (!result.ok) { setError(created.current ? `档案已创建，报道尚未加入：${result.message}` : result.message); return; }
        includeRequest.complete(); createRequest.complete();
        setSavedEvent(eventId); created.current = null; onSaved?.(); router.refresh();
      } catch { setError("保存未完成，输入仍在，请重试。"); }
      finally { saveLock.current = false; setSaving(false); }
    }}>
      {!initialEventId && <>
        <div><label htmlFor={`${id}-event`} className="text-xs">归入哪里</label><select id={`${id}-event`} value={selected} disabled={saving || !!created.current} onChange={(e) => { setSelected(e.target.value); setSavedEvent(null); }} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="">请选择已有事件或新建</option>{items.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}<option value="new">新建一个事件</option></select></div>
        {(selected === "new" || created.current) && <div><label htmlFor={`${id}-title`} className="text-xs">事件名称</label><Input id={`${id}-title`} className="mt-1" value={title} onChange={(e) => { setTitle(e.target.value); }} required maxLength={120} disabled={saving || !!created.current} /></div>}
      </>}
      <div><label htmlFor={`${id}-note`} className="text-xs">为什么属于这件事 / 备注（可选）</label><Textarea id={`${id}-note`} className="mt-1" rows={2} maxLength={1000} value={note} disabled={saving} onChange={(e) => { setNote(e.target.value); setSavedEvent(null); }} /></div>
      <OccurrenceFields value={occurred} disabled={saving} onChange={(value) => { setOccurred(value); setSavedEvent(null); }} />
      <Button type="submit" variant="outline" size="sm" disabled={saving || !!savedEvent || (!initialEventId && !selected && !created.current) || (selected === "new" && !title.trim())}>{saving ? "正在保存……" : savedEvent ? "已保存" : initialEventId ? "追加这次补充" : "确认加入"}</Button>
      {savedEvent && <p className="text-sm">已保存。<Link className="text-primary hover:underline" href={`/signals/events/${savedEvent}`}>查看事件时间线 →</Link></p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </form>
  </details>;
}
