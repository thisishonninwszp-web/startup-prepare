"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { EventDraft, EventDraftTask } from "@/lib/ai/signal-events";
import type { ResearchEntry, ResearchSnapshot } from "@/lib/domains/signals/events/research-shared";
import { generateResearchAction } from "./research-ai-actions";
import { connectionSourcesAction } from "./research-actions";
import { ResearchQuickAction } from "./research-quick-action";
import { eventRequest } from "./request-id";
const tasks: { value: EventDraftTask; label: string }[] = [{ value: "dossier", label: "整理档案" }, { value: "unknowns", label: "找出未知" }, { value: "explanations", label: "竞争解释" }, { value: "perspectives", label: "换位追问" }, { value: "connections", label: "跨事件暗线" }, { value: "understanding", label: "理解如何变化" }];
export function AIResearchPanel({ eventId, entries, sources, otherEvents, available, memberRevision }: { eventId: string; entries: ResearchEntry[]; sources: ResearchSnapshot[]; otherEvents: { id: string; title: string }[]; available: boolean; memberRevision?: number }) {
  const [task, setTask] = useState<EventDraftTask>("dossier"), [sourceIds, setSources] = useState<string[]>([]), [noteIds, setNotes] = useState<string[]>([]), [consent, setConsent] = useState(false);
  const [targetEventId, setTarget] = useState(""), [targetSources, setTargetSources] = useState<ResearchSnapshot[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false), targetVersion = useRef(0); const router = useRouter();
  const notes = entries.filter((entry) => ["note", "explanation"].includes(entry.kind) && typeof entry.payload.text === "string");
  const drafts = entries.filter((entry) => entry.kind === "dossier").slice().reverse();
  const allSources = [...sources, ...(task === "connections" ? targetSources : [])];
  function toggle(id: string, values: string[], update: (v: string[]) => void, max: number) { setConsent(false); update(values.includes(id) ? values.filter((v) => v !== id) : values.length < max ? [...values, id] : values); }
  async function generate() {
    if (lock.current || !consent) return; lock.current = true; setBusy(true); setError("");
    try {
      const payload = { task, sourceIds, noteIds, consent, ...(task === "connections" ? { targetEventId } : {}) };
      const identity = await eventRequest("event-ai-research", { eventId, ...payload });
      const result = await generateResearchAction(eventId, { ...payload, requestId: identity.requestId });
      if (!result.ok) setError(result.message); else { identity.complete(); router.refresh(); }
    } catch { setError("这次未能生成，先前草稿仍保留；可以重试。"); } finally { lock.current = false; setBusy(false); }
  }
  return <section className="space-y-4 rounded-lg border p-4" aria-label="AI事件研究">
    <div><h2 className="font-semibold">让 AI 找出推理缺口</h2><p className="mt-1 text-sm text-muted-foreground">草稿需要逐条核对，建议只有在你点击采纳后才会加入研究记录。</p></div>
    {!available ? <p>请先完成事件研究数据库更新。</p> : <fieldset disabled={busy} className="space-y-4">
      <label className="block text-sm">研究任务<select className="ml-3 rounded border bg-background p-2" value={task} onChange={(e) => { setTask(e.target.value as EventDraftTask); setSources([]); setConsent(false); }}>{tasks.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
      {task === "connections" && <label className="block text-sm">另一个事件<select className="ml-3 rounded border bg-background p-2" value={targetEventId} onChange={async (e) => {
        const id = e.target.value, version = ++targetVersion.current; setTarget(id); setTargetSources([]); setSources(sourceIds.filter((sid) => sources.some((s) => s.id === sid))); setConsent(false); setError("");
        if (id) { try { const result = await connectionSourcesAction(id); if (version !== targetVersion.current) return; if (result.ok) setTargetSources(result.data); else setError(result.message); } catch { if (version === targetVersion.current) setError("目标事件材料读取失败，请重新选择。"); } }
      }}><option value="">请选择</option>{otherEvents.filter((e) => e.id !== eventId).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select></label>}
      <div className="space-y-2"><p className="text-sm font-medium">明确选择发送的来源（最多12份）</p>{allSources.map((source) => <details key={source.id} className="rounded border p-2 text-sm"><summary><label onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sourceIds.includes(source.id)} onChange={() => toggle(source.id, sourceIds, setSources, 12)} /> <span>{targetSources.some((s) => s.id === source.id) ? "另一个事件 · " : "本事件 · "}{source.title}</span></label></summary><p className="mt-2 whitespace-pre-wrap break-words text-xs">{source.captured_text.slice(0, 10000)}</p><p className="text-xs text-muted-foreground">发送标题、发布时间、捕捉时间及上方最多10000字符；较长原文会截断。</p></details>)}</div>
      <details className="rounded border p-3"><summary className="cursor-pointer text-sm">可选：逐条附带自己的笔记或解释（最多10条）</summary><p className="my-2 text-xs text-muted-foreground">默认不附带。理解变化至少选择两条带时间记录；每条仅发送下方前1000字符及记录时间。</p>{notes.map((note) => <label key={note.id} className="my-3 block text-xs"><input type="checkbox" checked={noteIds.includes(note.id)} onChange={() => toggle(note.id, noteIds, setNotes, 10)} /> {note.created_at}<span className="mt-1 block whitespace-pre-wrap break-words">{String(note.payload.text).slice(0, 1000)}</span></label>)}</details>
      <div className="space-y-2 rounded bg-muted/40 p-3 text-xs"><p>接收方：Google Gemini。仅发送本次勾选的 {sourceIds.length} 份来源标题和摘录，以及 {noteIds.length} 条自选笔记及时间。事件私人标题和范围不会自动附带。</p><ul>{allSources.filter((s) => sourceIds.includes(s.id)).map((s) => <li key={s.id}>{s.title} · {s.captured_text.slice(0, 10000).length} 字符</li>)}{notes.filter((n) => noteIds.includes(n.id)).map((n) => <li key={n.id}>笔记 · {n.created_at} · {String(n.payload.text).slice(0, 1000).length} 字符</li>)}</ul><label className="block"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> 我同意本次将以上所选内容发送给 Google Gemini。</label></div>
      <Button type="button" disabled={!consent || (task === "understanding" ? noteIds.length < 2 : sourceIds.length === 0) || (task === "connections" && !targetEventId)} onClick={generate}>{busy ? "正在核对材料……" : "生成待核对草稿"}</Button>
    </fieldset>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="space-y-3">{drafts.map((entry) => <details key={entry.id} className="rounded border p-3"><summary className="cursor-pointer text-sm">{tasks.find((t) => t.value === entry.payload.task)?.label ?? "AI草稿"} · {entry.created_at} · 材料版本 {String(entry.payload.memberRevision)}{memberRevision != null && entry.payload.memberRevision !== memberRevision ? " · 材料已变化，请重新核对" : ""}</summary><p className="mt-2 text-xs text-muted-foreground">输入指纹 {String(entry.payload.inputHash).slice(0, 12)} · 仅覆盖当时明确选中的材料。</p>{(entry.payload.sections as EventDraft["sections"] ?? []).map((section, i) => <article key={i} className="mt-4 space-y-2 text-sm"><h3 className="font-medium">{section.heading}</h3><p className="whitespace-pre-wrap">{section.text}</p>{section.refs.map((ref, j) => <blockquote key={j} className="border-l-2 pl-3 text-xs">「{ref.quote}」 <Link className="underline" href={`/signals/events/sources/${ref.snapshotId}`}>核对冻结原文</Link></blockquote>)}{section.noteRefs?.map((ref, j) => <blockquote key={j} className="border-l-2 pl-3 text-xs">笔记原话：「{ref.quote}」 · {entries.find((n) => n.id === ref.recordId)?.created_at ?? "原记录"}</blockquote>)}{section.proposal && <div className="space-y-2 rounded border p-3"><p className="text-xs font-medium">采纳时将保存以下建议</p>{Object.entries(section.proposal.payload).filter(([key, value]) => !["refs", "noteRefs", "targetEventId"].includes(key) && typeof value === "string").map(([key, value]) => <p key={key} className="whitespace-pre-wrap text-xs"><span className="font-medium">{({ question: "问题", criterion: "回答判据", text: "内容", assumptions: "假设前提", distinguish: "区分证据", role: "处境角色", questions: "追问", assumption: "必要假设", counter: "反证", alternative: "替代解释" } as Record<string, string>)[key] ?? key}：</span>{String(value)}</p>)}<ResearchQuickAction eventId={eventId} kind={section.proposal.kind} payload={section.proposal.payload} label="核对后采纳这条建议" /></div>}</article>)}</details>)}</div>
  </section>;
}


