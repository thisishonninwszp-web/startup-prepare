"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { createEventAction } from "./actions";
import { eventRequest } from "./request-id";

export function NewEventForm() {
  const id = useId(); const router = useRouter();
  const [title, setTitle] = useState(""); const [scope, setScope] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const lock = useRef(false);
  return <details className="mb-6 rounded-lg border bg-card p-4">
    <summary className="cursor-pointer text-sm font-medium">新建事件档案</summary>
    <form className="mt-4 space-y-3" onSubmit={async (e) => {
      e.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError("");
      try {
        const payload = { title, scopeNote: scope };
        const request = await eventRequest("create", payload);
        const result = await createEventAction({ ...payload, requestId: request.requestId });
        if (result.ok) { request.complete(); router.push(`/signals/events/${result.data.id}`); } else setError(result.message);
      } catch { setError("未连上服务器，输入仍在，请重试。"); }
      finally { lock.current = false; setBusy(false); }
    }}>
      <div><label htmlFor={`${id}-title`} className="text-sm">这是什么事</label><Input id={`${id}-title`} className="mt-1" value={title} onChange={(e) => { setTitle(e.target.value); }} maxLength={120} required disabled={busy} placeholder="例如：日银本轮加息及企业融资变化" /></div>
      <div><label htmlFor={`${id}-scope`} className="text-sm">追踪范围（可选）</label><Textarea id={`${id}-scope`} className="mt-1" value={scope} onChange={(e) => { setScope(e.target.value); }} maxLength={1000} disabled={busy} rows={2} placeholder="关注哪一件具体的事，哪些只是同主题、并不属于它？" /></div>
      <Button disabled={busy || !title.trim()} type="submit">{busy ? "正在创建……" : "创建档案"}</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  </details>;
}
