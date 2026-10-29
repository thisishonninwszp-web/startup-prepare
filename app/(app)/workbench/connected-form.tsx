"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { eventRequest } from "@/app/(app)/signals/events/request-id";

export function value(data: FormData, key: string) { return String(data.get(key) ?? "").trim(); }
export function lines(data: FormData, key: string) { return value(data, key).split(/\r?\n/).map(s => s.trim()).filter(Boolean); }
export function nullableNumber(data: FormData, key: string) { return value(data, key) === "" ? null : Number(value(data, key)); }

export function Field({ name, label, multiline, required = false, maxLength = 2000, type = "text", initial = "" }: { name: string; label: string; multiline?: boolean; required?: boolean; maxLength?: number; type?: string; initial?: string }) {
  return <label className="block space-y-1 text-xs leading-6"><span>{label}{required ? " *" : ""}</span>{multiline ? <Textarea name={name} defaultValue={initial} required={required} maxLength={maxLength} rows={3} /> : <Input name={name} defaultValue={initial} required={required} maxLength={maxLength} type={type} min={type === "number" ? 0 : undefined} step={type === "number" ? "any" : undefined} />}</label>;
}

export function Choice({ name, label, options, initial }: { name: string; label: string; options: readonly (readonly [string, string])[]; initial?: string }) {
  return <label className="block space-y-1 text-xs leading-6"><span>{label}</span><select aria-label={label} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" name={name} defaultValue={initial ?? options[0]?.[0]}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
}

export type ConnectedResult = { ok: boolean; message?: string };
export async function refreshSavedView(refresh?: () => void | Promise<void>) {
  try { await refresh?.(); return { message: "已保存。", refreshFailed: false }; }
  catch { return { message: "已保存，但列表刷新未完成。请重新读取，勿重复保存。", refreshFailed: true }; }
}
export function ConnectedForm({ operation, submit, label, children, resetOnSuccess = false, onSaved }: { operation: string; submit: (data: FormData, requestId: string) => Promise<ConnectedResult>; label: string; children: ReactNode; resetOnSuccess?: boolean; onSaved?: () => void | Promise<void> }) {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [refreshFailed, setRefreshFailed] = useState(false);
  return <form className="mt-3 space-y-3" aria-busy={busy} onSubmit={async event => {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage(""); setRefreshFailed(false);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const request = await eventRequest(operation, Array.from(data.entries()));
      const result = await submit(data, request.requestId);
      if (!result.ok) { setMessage(result.message || "未保存，请重试。输入已保留。"); return; }
      request.complete();
      if (resetOnSuccess) form.reset();
      const refreshed = await refreshSavedView(onSaved);
      setMessage(refreshed.message); setRefreshFailed(refreshed.refreshFailed);
    } catch (error) { setMessage(`${error instanceof Error ? error.message : "没有完成保存"}。输入与请求身份已保留，请重试。`); }
    finally { inFlight.current = false; setBusy(false); }
  }}><fieldset className="space-y-3" disabled={busy || refreshFailed}>{children}<Button size="sm" variant="outline" type="submit" disabled={busy || refreshFailed}>{busy ? "正在保存……" : label}</Button></fieldset>{message && <p role="status" className="text-xs leading-6 text-muted-foreground">{message}</p>}{refreshFailed && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={async () => { setBusy(true); const r = await refreshSavedView(onSaved); setMessage(r.message); setRefreshFailed(r.refreshFailed); setBusy(false); }}>重新读取</Button>}</form>;
}

