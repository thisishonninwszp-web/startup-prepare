"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateEventAction } from "./actions";

export function EditEventForm({ eventId, initialTitle, initialScopeNote }: { eventId: string; initialTitle: string; initialScopeNote: string | null }) {
  const id = useId(); const router = useRouter(); const lock = useRef(false);
  const [title, setTitle] = useState(initialTitle); const [scopeNote, setScopeNote] = useState(initialScopeNote ?? "");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  return <details className="mb-5 rounded-md border p-3">
    <summary className="cursor-pointer text-sm">修改事件名称与范围</summary>
    <form className="mt-3 space-y-3" onSubmit={async (event) => {
      event.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setMessage("");
      try {
        const result = await updateEventAction({ eventId, title, scopeNote });
        if (result.ok) { setMessage("名称与范围已保存。"); router.refresh(); } else setMessage(result.message);
      } catch { setMessage("保存未完成，输入仍在，请重试。"); }
      finally { lock.current = false; setBusy(false); }
    }}>
      <div><label htmlFor={`${id}-title`} className="text-sm">事件名称</label><Input id={`${id}-title`} value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={120} disabled={busy} /></div>
      <div><label htmlFor={`${id}-scope`} className="text-sm">追踪范围</label><Textarea id={`${id}-scope`} value={scopeNote} onChange={(event) => setScopeNote(event.target.value)} maxLength={1000} disabled={busy} /></div>
      <Button type="submit" size="sm" disabled={busy || !title.trim()}>{busy ? "保存中……" : "保存名称与范围"}</Button>
      {message && <p role="status" className="text-sm">{message}</p>}
    </form>
  </details>;
}
