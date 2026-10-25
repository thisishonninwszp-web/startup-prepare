"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { opposingEvidence, type JudgmentUpdate } from "@/lib/domains/signals/judgment-updates-shared";
import type { OutcomeEvidence } from "@/lib/domains/signals/practice-shared";
import { appendJudgmentUpdateAction, checkJudgmentEvidenceAction, loadJudgmentUpdatesAction } from "./judgment-updates-actions";
import { EvidenceList } from "./inference-tree";

const DATE = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" });

export async function runJudgmentTask(gate: { current: boolean }, setBusy: (busy: boolean) => void, task: () => Promise<void>): Promise<void> {
  if (gate.current) return;
  gate.current = true;
  setBusy(true);
  try {
    await task();
  } finally {
    gate.current = false;
    setBusy(false);
  }
}

export function JudgmentUpdatesPanel({ judgmentId, originalDate, initialEvidence }: {
  judgmentId: string;
  originalDate: string;
  initialEvidence?: OutcomeEvidence | null;
}) {
  const id = useId();
  const [updates, setUpdates] = useState<JudgmentUpdate[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState(initialEvidence ?? null);
  const [judgment, setJudgment] = useState("");
  const [reason, setReason] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const loadingGate = useRef(false);
  const savingGate = useRef(false);
  const checkingGate = useRef(false);
  const against = opposingEvidence(evidence?.evidence ?? []);

  const load = () => { void runJudgmentTask(loadingGate, setLoading, async () => {
    setHistoryError(null);
    try {
      const result = await loadJudgmentUpdatesAction(judgmentId);
      if (result.ok) setUpdates(result.updates);
      else setHistoryError(result.message);
    } catch {
      setHistoryError("没连上服务器，历史尚未读取，请重试。");
    }
  }); };

  return (
    <div className="mt-5 space-y-4 border-t pt-4 text-sm">
      <section aria-labelledby={`${id}-counter`}>
        <h3 id={`${id}-counter`} className="font-medium">与原判断相反的证据</h3>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">
          按当时的原判断查正反两面。AI 的挑刺是推理，下面有原文和出处的材料才是查到的证据；立场仍是 AI 对原文的解读，需要你核对。
        </p>
        {against.length > 0 && (
          <ul className="mt-2 space-y-3 border-l-2 border-border pl-3">
            {against.map((item, index) => (
              <li key={`${item.url}-${index}`} className="leading-7">
                <p>{item.fact}</p>
                <p className="text-xs text-muted-foreground">原文：「{item.excerpt}」</p>
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline-offset-4 hover:underline">{item.title || "核对原文"} ↗</a>
              </li>
            ))}
          </ul>
        )}
        {evidence && against.length === 0 && !evidenceError && <p className="mt-2 text-xs leading-6 text-muted-foreground">上次完整查询没有得到有出处的相反证据，不代表原判断正确。</p>}
        {evidence && <EvidenceList evidence={evidence.evidence} />}
        {evidence && <p className="mt-1 text-xs text-muted-foreground">{evidenceError ? "以下保留的是旧证据，本次更新失败。上次查询：" : "查询时间："}{DATE.format(new Date(evidence.checked_at))}</p>}
        <Button type="button" size="sm" variant="outline" className="mt-2" disabled={checking} onClick={() => { void runJudgmentTask(checkingGate, setChecking, async () => {
          setEvidenceError(null);
          try {
            const result = await checkJudgmentEvidenceAction(judgmentId);
            if (result.ok) setEvidence(result.evidence);
            else setEvidenceError(result.message);
          } catch {
            setEvidenceError("没连上服务器，证据尚未更新，请重试。");
          }
        }); }}>
          {checking ? "正在查正反两面的原文…" : evidence ? "重新查支持与反对证据" : "查支持与反对证据"}
        </Button>
        {evidenceError && <p role="alert" className="mt-2 text-xs text-destructive">{evidenceError}</p>}
      </section>

      <details onToggle={(event) => { if (event.currentTarget.open && updates === null && !loading && !historyError) load(); }}>
        <summary className="cursor-pointer font-medium">判断有变化？追加记录 / 查看历史</summary>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          原判断写于 {DATE.format(new Date(originalDate))}，会一直保留。后来的修正按时间追加，不改变原判断的对账期限或结果。
        </p>
        {loading && <p className="mt-2 text-xs text-muted-foreground">正在读取历史…</p>}
        {historyError && <div className="mt-2"><p role="alert" className="text-xs text-destructive">{historyError}</p><Button type="button" size="sm" variant="ghost" disabled={loading} onClick={load}>重新读取</Button></div>}
        {updates?.length === 0 && <p className="mt-2 text-xs text-muted-foreground">还没有追加记录。</p>}
        {updates && updates.length > 0 && (
          <ol className="mt-3 space-y-4 border-l-2 border-border pl-3">
            {updates.map((update) => (
              <li key={update.id} className="leading-7">
                <p className="text-xs text-muted-foreground">{DATE.format(new Date(update.created_at))}</p>
                <p className="font-medium">后来判断：{update.judgment}</p>
                <p>改变的原因：{update.reason}</p>
                {update.source_url && <a href={update.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline-offset-4 hover:underline">我记录的来源（尚未核实） ↗</a>}
              </li>
            ))}
          </ol>
        )}
        {updates !== null && (
          <form className="mt-4 space-y-3" onSubmit={(event) => {
            event.preventDefault();
            void runJudgmentTask(savingGate, setSaving, async () => {
              setSaveError(null);
              try {
                const result = await appendJudgmentUpdateAction(judgmentId, { judgment, reason, sourceUrl });
                if (!result.ok) { setSaveError(result.message); return; }
                setUpdates((current) => [...(current ?? []), result.update]);
                setJudgment(""); setReason(""); setSourceUrl("");
              } catch {
                setSaveError("没连上服务器，输入还在，请重试。");
              }
            });
          }}>
            <div><label htmlFor={`${id}-judgment`} className="text-xs font-medium">现在的判断</label><Textarea id={`${id}-judgment`} className="mt-1" value={judgment} onChange={(event) => setJudgment(event.target.value)} maxLength={500} minLength={4} required rows={2} placeholder="现在我认为会发生什么？" /></div>
            <div><label htmlFor={`${id}-reason`} className="text-xs font-medium">什么信息改变了判断</label><Textarea id={`${id}-reason`} className="mt-1" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} minLength={4} required rows={2} placeholder="写清新增的事实或改变的前提。" /></div>
            <div><label htmlFor={`${id}-source`} className="text-xs font-medium">来源链接（可选）</label><Input id={`${id}-source`} type="url" className="mt-1" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} maxLength={2000} placeholder="https://…" /></div>
            <Button type="submit" size="sm" disabled={saving || judgment.trim().length < 4 || reason.trim().length < 4}>{saving ? "正在追加…" : "追加这次修正"}</Button>
            {saveError && <p role="alert" className="text-xs text-destructive">{saveError}</p>}
          </form>
        )}
      </details>
    </div>
  );
}
