"use client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ResearchKind, ResearchSnapshot } from "@/lib/domains/signals/events/research-shared";
import { addResearchAction, connectionSourcesAction } from "./research-actions";
import { eventRequest } from "./request-id";

export type ResearchField = { name: string; label: string; type?: "text" | "date" | "select" | "textarea"; choices?: { value: string; label: string }[]; optional?: boolean };
export function ResearchForm({ eventId, kind, subjectId, fields, sources, label = "追加记录", needsRefs = false }: {
  eventId: string; kind: ResearchKind; subjectId?: string; fields: ResearchField[]; sources: ResearchSnapshot[]; label?: string; needsRefs?: boolean;
}) {
  const id = useId(); const router = useRouter(); const lock = useRef(false); const request = useRef<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({}); const [refs, setRefs] = useState([{ snapshotId: "", quote: "" }, { snapshotId: "", quote: "" }]);
  const [extra, setExtra] = useState<ResearchSnapshot[]>([]); const [loadingSources, setLoadingSources] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState(false);
  const choices = [...sources, ...extra.filter((row) => !sources.some((source) => source.id === row.id))];
  function resetRequest() { request.current = null; setSuccess(false); }
  return <form className="mt-3 space-y-3 rounded-md border bg-background p-3" onSubmit={async (e) => {
    e.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError(""); setSuccess(false); request.current ??= crypto.randomUUID();
    try {
      const payload: Record<string, unknown> = Object.fromEntries(fields.map((field) => [field.name, values[field.name] ?? ""]));
      payload.refs = refs.filter((ref) => ref.snapshotId || ref.quote);
      const identity = await eventRequest("research", { eventId, kind, subjectId, payload });
      const result = await addResearchAction(eventId, { kind, subjectId, requestId: identity.requestId, payload });
      if (result.ok) { identity.complete(); setSuccess(true); request.current = null; router.refresh(); } else setError(result.message);
    } catch { setError("没能保存，输入仍在，请重试。"); }
    finally { lock.current = false; setBusy(false); }
  }}>
    {fields.map((field) => <div key={field.name}><label className="text-xs font-medium" htmlFor={`${id}-${field.name}`}>{field.label}{field.optional ? "（可选）" : ""}</label>
      {field.type === "select" ? <select id={`${id}-${field.name}`} required={!field.optional} value={values[field.name] ?? ""} disabled={busy || loadingSources} className="mt-1 min-h-9 w-full rounded-md border bg-background px-2 text-sm" onChange={async (e) => {
        const value = e.target.value; setValues((old) => ({ ...old, [field.name]: value })); resetRequest();
        if (field.name === "targetEventId" && value) {
          setLoadingSources(true); setExtra([]);
          try { const result = await connectionSourcesAction(value); if (result.ok) setExtra(result.data); else setError(result.message); }
          catch { setError("另一个事件的来源未能读取，请重选。"); }
          finally { setLoadingSources(false); }
        }
      }}><option value="">请选择</option>{field.choices?.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select>
        : field.type === "date" || field.type === "text" ? <Input id={`${id}-${field.name}`} type={field.type === "date" ? "date" : "text"} className="mt-1" value={values[field.name] ?? ""} disabled={busy} required={!field.optional} maxLength={2000} onChange={(e) => { setValues((old) => ({ ...old, [field.name]: e.target.value })); resetRequest(); }} />
          : <Textarea id={`${id}-${field.name}`} rows={2} className="mt-1" value={values[field.name] ?? ""} disabled={busy} required={!field.optional} maxLength={2000} onChange={(e) => { setValues((old) => ({ ...old, [field.name]: e.target.value })); resetRequest(); }} />}
    </div>)}
    <details open={needsRefs ? true : undefined}><summary className="cursor-pointer text-xs text-muted-foreground">引用已保存的原文{needsRefs ? "（需要依据）" : "（可选）"}</summary><p className="mt-1 text-xs leading-6 text-muted-foreground">选择来源并粘贴逐字摘录；另一个事件的来源会在选择它后出现。来源目录可在页面下方查阅。</p>
      {refs.map((ref, index) => <div key={index} className="mt-2 grid gap-2 sm:grid-cols-2"><select aria-label={`引用${index + 1}的来源`} className="min-h-9 w-full min-w-0 rounded-md border bg-background px-2 text-xs" disabled={busy || loadingSources} value={ref.snapshotId} onChange={(e) => { setRefs((old) => old.map((item, at) => at === index ? { ...item, snapshotId: e.target.value } : item)); resetRequest(); }}><option value="">选择来源</option>{choices.map((source) => <option key={source.id} value={source.id}>{source.title.slice(0, 70)} · {source.id.slice(0, 6)}</option>)}</select><Textarea aria-label={`引用${index + 1}的逐字摘录`} rows={2} maxLength={2000} disabled={busy} value={ref.quote} onChange={(e) => { setRefs((old) => old.map((item, at) => at === index ? { ...item, quote: e.target.value } : item)); resetRequest(); }} /></div>)}
    </details>
    <Button type="submit" variant="outline" size="sm" disabled={busy || loadingSources || success}>{busy ? "保存中……" : success ? "已追加" : label}</Button>
    {success && <p role="status" className="text-xs text-muted-foreground">新记录已保存；原记录和历史保留。</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </form>;
}
