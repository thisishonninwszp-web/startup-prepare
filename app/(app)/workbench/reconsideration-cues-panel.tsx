"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ReconsiderationEntry } from "@/lib/domains/observations/feedback/reconsideration-domain";
import { acknowledgeReconsiderationAction, loadReconsiderationCuesAction } from "../ideas/reconsideration-actions";
import { ConnectedForm } from "./connected-form";

export type ReconsiderationCuesData = { status: "ready" | "missing-schema"; items: ReconsiderationEntry[]; nextCursor: string | null };
export function ReconsiderationCuesPanel({ initialData }: { initialData: ReconsiderationCuesData | null }) {
  const [data, setData] = useState(initialData), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const lock = useRef(false);
  const load = async (cursor?: string, propagate = false) => { if (lock.current) { if (propagate) throw new Error("请重新读取提示"); return; } lock.current = true; setBusy(true); try { const r = await loadReconsiderationCuesAction(cursor); if (!r.ok || r.data.status !== "ready") throw new Error(); setData(old => ({ ...r.data, items: cursor ? [...new Map([...(old?.items || []), ...r.data.items].map(e => [e.id, e])).values()] : r.data.items })); setMessage(""); } catch { setMessage("复查提示暂不可用，请重新读取。"); if (propagate) throw new Error("提示刷新未完成"); } finally { lock.current = false; setBusy(false); } };
  return <section className="space-y-3 rounded-lg border bg-card p-4" aria-label="归档复查提示"><h2 className="text-sm font-medium">归档条件 · 待复查</h2><p className="text-xs text-muted-foreground">只显示仍归档且经人工核对满足的条件；每版提示一次。查看回执不改变想法状态。</p>{(!data || data.status !== "ready" || message) && <p role="status" className="text-xs">{message || "归档复查提示暂不可用。"} <button disabled={busy} className="underline" onClick={() => void load()}>重新读取</button></p>}{data?.status === "ready" && !data.items.length && <p className="text-xs text-muted-foreground">没有待查看的归档复查提示。</p>}{data?.items.map(cue => <article key={cue.id} className="space-y-2 border-l pl-3 text-xs"><Link className="text-primary underline" href={`/ideas/${cue.idea_id}#reconsideration`}>打开归档想法与条件出处 →</Link><p>{cue.coverage || "请查看条件版本及人工核对材料。"}</p><ConnectedForm operation={`reconsideration-ack:${cue.id}`} label="确认已查看此条件" onSaved={() => load(undefined, true)} submit={async (_, requestId) => { try { const r = await acknowledgeReconsiderationAction({ ideaId: cue.idea_id, requestId, expectedVersionId: cue.condition_version_id, cueId: cue.id }); return r.ok ? { ok: true } : { ok: false, message: "提示或条件已变化，请重新读取。" }; } catch { return { ok: false, message: "回执未保存，请重试。" }; } }}><p>仅记录已查看；是否重新推进由你决定。</p></ConnectedForm></article>)}{data?.nextCursor && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void load(data.nextCursor || undefined)}>读取更多待复查条件</Button>}</section>;
}
