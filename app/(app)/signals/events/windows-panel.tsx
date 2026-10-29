"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ResearchEntry } from "@/lib/domains/signals/events/research-shared";
import { addWindowAction, checkWindowAction } from "./windows-actions";

const inputClass = "w-full rounded-md border bg-background px-3 py-2 text-sm";
const buttonClass = "rounded-md border px-3 py-2 text-sm disabled:opacity-50";
const text = (value: unknown) => typeof value === "string" ? value : "";
const checkedTime = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "时间不详";
const cadenceLabel: Record<string, string> = { manual: "手动", weekly: "每周", monthly: "每月" };

export function WindowsPanel({ eventId, entries, available }: { eventId: string; entries: ResearchEntry[]; available: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [field, setField] = useState("");
  const [cadence, setCadence] = useState<"manual" | "weekly" | "monthly">("manual");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const savingRef = useRef(false);
  const checkingRef = useRef(new Set<string>());
  const checkRequests = useRef(new Map<string, string>());
  const addRequest = useRef<string | null>(null);
  const windows = entries.filter(entry => entry.event_id === eventId && entry.kind === "window");

  async function add() {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setMessage("");
    addRequest.current ??= crypto.randomUUID();
    try {
      const result = await addWindowAction({ eventId, url, field, cadence, requestId: addRequest.current });
      if (!result.ok) { setMessage(result.message); return; }
      setUrl(""); setField(""); addRequest.current = null; router.refresh();
    } catch { setMessage("保存未完成，输入仍在，请重试。"); }
    finally { savingRef.current = false; setSaving(false); }
  }
  async function check(windowId: string) {
    if (checkingRef.current.has(windowId)) return;
    checkingRef.current.add(windowId); setChecking([...checkingRef.current]); setMessage("");
    try {
      const requestId = checkRequests.current.get(windowId) ?? crypto.randomUUID();
      checkRequests.current.set(windowId, requestId);
      const result = await checkWindowAction({ eventId, windowId, requestId });
      if (!result.ok) { setMessage(result.message); return; }
      checkRequests.current.delete(windowId); router.refresh();
    } catch { setMessage("检查结果未保存，请重试。"); }
    finally { checkingRef.current.delete(windowId); setChecking([...checkingRef.current]); }
  }
  function changedInput() { addRequest.current = null; }

  return <section className="space-y-4 rounded-lg border p-4" aria-label="现实观察窗口">
    <div><h2 className="font-medium">现实观察窗口</h2><p className="mt-1 text-xs text-muted-foreground">绑定公开网页并手动读取原文。频率仅作计划提示；不会自动抓取或发送提醒。正文哈希变化需要你核对其含义。</p></div>
    {!available ? <p className="text-sm text-muted-foreground">观察记录所需的数据库结构尚未开启。</p> : <>
      <form className="space-y-2" onSubmit={event => { event.preventDefault(); void add(); }}>
        <label className="block space-y-1 text-sm"><span>公开网页地址</span><input type="url" required maxLength={2000} value={url} disabled={saving} onChange={event => { setUrl(event.target.value); changedInput(); }} className={inputClass} placeholder="https://example.com/pricing" /></label>
        <label className="block space-y-1 text-sm"><span>要查找的原文标记（可选）</span><input value={field} maxLength={200} disabled={saving} onChange={event => { setField(event.target.value); changedInput(); }} className={inputClass} placeholder="例如页面上原本出现的价格、产品名或一句话" /></label>
        <div className="flex flex-wrap items-center gap-2"><label className="text-sm">核对计划 <select className="rounded-md border bg-background p-2" value={cadence} disabled={saving} onChange={event => { setCadence(event.target.value as typeof cadence); changedInput(); }}><option value="manual">手动</option><option value="weekly">每周</option><option value="monthly">每月</option></select></label><button className={buttonClass} disabled={saving || !url.trim()}>{saving ? "保存中…" : "添加观察窗口"}</button></div>
      </form>
      {windows.length === 0 && <p className="text-sm text-muted-foreground">还没有观察窗口。</p>}
      {windows.map(window => {
        const checks = entries.filter(entry => entry.event_id === eventId && entry.kind === "window_check" && entry.subject_id === window.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
        const latest = checks[0];
        const successes = checks.filter(entry => entry.payload.status === "success");
        const previous = latest?.payload.status === "success" ? successes[1] : successes[0];
        return <article key={window.id} className="space-y-2 rounded-md border p-3">
          <p className="break-all text-sm">{text(window.payload.url)}</p>
          <p className="text-xs text-muted-foreground">{text(window.payload.field) ? `原文标记：${text(window.payload.field)}` : "读取正文，比较文本哈希"} · {cadenceLabel[text(window.payload.cadence)] ?? "手动"}核对</p>
          <button type="button" aria-label={`现在检查并记录：${text(window.payload.url)}`} className={buttonClass} disabled={checking.includes(window.id)} onClick={() => void check(window.id)}>{checking.includes(window.id) ? "检查并记录中…" : "现在检查并记录"}</button>
          {latest ? <div className="space-y-1 text-sm" aria-live="polite">
            <p className="text-xs text-muted-foreground">最近检查：{checkedTime(latest.payload.checkedAt || latest.created_at)}（东京）· 来源时区未核实，捕获范围为解析出的网页正文</p>
            {latest.payload.status === "failed" ? <p className="text-destructive">检查失败：{text(latest.payload.error) || "未能读取网页"}。此前成功记录仍保留。</p> : <><p>{text(latest.payload.value)}</p><p className="text-xs text-muted-foreground">{previous ? latest.payload.hash === previous.payload.hash ? "正文哈希未变化；这不代表现实没有变化。" : "正文哈希已变化，请核对前后原文。" : "首次成功读取，已建立文本基线。"}</p><blockquote className="whitespace-pre-wrap border-l-2 pl-3 text-xs">{text(latest.payload.excerpt)}</blockquote>{previous && <details className="text-xs"><summary>上次成功读取的原文</summary><blockquote className="mt-2 whitespace-pre-wrap border-l-2 pl-3">{text(previous.payload.excerpt)}</blockquote></details>}</>}
          </div> : <p className="text-xs text-muted-foreground">尚未检查。</p>}
          {checks.length > 0 && <details className="text-xs"><summary>全部检查记录（{checks.length}）</summary><ol className="mt-2 space-y-3">{checks.map(entry => <li key={entry.id} className="space-y-1"><p>{text(entry.payload.checkedAt) || entry.created_at} · {entry.payload.status === "success" ? "读取成功" : "读取失败"}</p><p>{text(entry.payload.error) || text(entry.payload.value)}</p>{typeof entry.payload.excerpt === "string" && <blockquote className="whitespace-pre-wrap border-l-2 pl-3">{entry.payload.excerpt}</blockquote>}</li>)}</ol></details>}
        </article>;
      })}
    </>}
    {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
  </section>;
}


