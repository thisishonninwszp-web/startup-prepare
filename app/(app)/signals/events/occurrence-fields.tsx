"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TimelineEntry } from "@/lib/domains/signals/events/domain";

export type OccurrenceDraft = { enabled: boolean; precision: "day" | "month" | "year"; from: string; to: string; quote: string };
export function emptyOccurrence(): OccurrenceDraft { return { enabled: false, precision: "day", from: "", to: "", quote: "" }; }
export function occurrenceInput(draft: OccurrenceDraft): TimelineEntry["occurred"] {
  return draft.enabled ? { from: draft.from.trim(), to: draft.to.trim() || null, precision: draft.precision, quote: draft.quote.trim() } : null;
}

export function OccurrenceFields({ value, onChange, disabled }: { value: OccurrenceDraft; onChange: (value: OccurrenceDraft) => void; disabled: boolean }) {
  const id = useId();
  const patch = (input: Partial<OccurrenceDraft>) => onChange({ ...value, ...input });
  const placeholder = value.precision === "year" ? "2026" : value.precision === "month" ? "2026-10" : "2026-10-25";
  return (
    <fieldset className="space-y-3 rounded-md border p-3" disabled={disabled}>
      <legend className="px-1 text-xs text-muted-foreground">发生时间（可选，有原文依据再记）</legend>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />这篇报道明确说了事情何时发生</label>
      {value.enabled && <>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label htmlFor={`${id}-precision`} className="text-xs">原文时间精度</label><select id={`${id}-precision`} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={value.precision} onChange={(e) => patch({ precision: e.target.value as OccurrenceDraft["precision"] })}><option value="day">具体日期</option><option value="month">只到月份</option><option value="year">只到年份</option></select></div>
          <div><label htmlFor={`${id}-from`} className="text-xs">发生时间 / 区间开始</label><Input id={`${id}-from`} className="mt-1" required maxLength={10} placeholder={placeholder} value={value.from} onChange={(e) => patch({ from: e.target.value })} /></div>
          <div><label htmlFor={`${id}-to`} className="text-xs">区间结束（可选）</label><Input id={`${id}-to`} className="mt-1" maxLength={10} placeholder={placeholder} value={value.to} onChange={(e) => patch({ to: e.target.value })} /></div>
        </div>
        <div><label htmlFor={`${id}-quote`} className="text-xs">说明这个时间的原文摘录</label><Textarea id={`${id}-quote`} className="mt-1" required rows={2} maxLength={2000} value={value.quote} onChange={(e) => patch({ quote: e.target.value })} placeholder="照原文粘贴。只知道发布日期时，不填写发生时间。" /></div>
      </>}
    </fieldset>
  );
}
