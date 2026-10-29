"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConnectedForm, Field, Choice, value } from "@/app/(app)/workbench/connected-form";
import { attentionStateAction, saveAttentionAction } from "./attention-actions";
import { ReasoningSourcePicker } from "./source-picker";

type Entry = { id: string; revision: string; kind: string; version_id: string | null; payload: Record<string, unknown> };
type WriteKind = Parameters<typeof saveAttentionAction>[1]["kind"];
const text = (value: unknown) => typeof value === "string" ? value : "";
const choiceLabels: Record<string, string> = { open: "打开", skip: "跳过", pending: "待判断", seen: "看到" };
export function AttentionBlindMaterial({ material }: { material: { body: string; sourceUrl?: string } }) {
  return <div className="mt-3 space-y-2"><h4 className="text-xs font-medium">冻结材料 · 先读原文</h4><p className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm leading-7">{material.body}</p><p className="text-xs text-muted-foreground">此处只展示冻结正文。你可以随时退出，原页面和全部材料仍可直接访问。</p></div>;
}
function AttentionInner({ eventId }: { eventId: string }) {
  const [entries, setEntries] = useState<Entry[]>([]), [loaded, setLoaded] = useState(false), [available, setAvailable] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [snapshotId, setSnapshotId] = useState("");
  const [warning, setWarning] = useState(""); const reading = useRef(false), writeLock = useRef(false); const [writing, setWriting] = useState(false);
  async function saved() { try { await refresh(); } finally { writeLock.current = false; setWriting(false); } }
  async function refresh() {
    const all: Entry[] = []; let after: string | undefined;
    do {
      const result = await attentionStateAction(eventId, after);
      if (!result.ok) throw new Error("阅读约定读取未完成，请重试。");
      if (!result.data.available) { if (loaded) throw new Error("功能暂不可用"); setAvailable(false); setLoaded(true); return; }
      all.push(...result.data.entries);
      if (result.data.nextCursor === null) break;
      if (result.data.nextCursor === after) throw new Error("读取游标未推进，请重试。");
      after = result.data.nextCursor;
    } while (true);
    setEntries(all); setLoaded(true); setAvailable(true);
  }
  async function read() { if (reading.current) return; reading.current = true; setBusy(true); setError(""); try { await refresh(); } catch { setError("阅读约定读取未完成，请重试。已有输入保留。"); } finally { reading.current = false; setBusy(false); } }
  const lastVersion = entries.filter(row => row.kind === "contract" || row.kind === "contract_exit").at(-1);
  const current = lastVersion?.kind === "contract" ? lastVersion : null;
  const registrations = entries.filter(row => row.kind === "register");
  const save = async (kind: WriteKind, requestId: string, payload: Record<string, unknown>, versionId?: string | null) => {
    if (writeLock.current) return { ok: false, message: "请等当前保存完成后再操作。" };
    writeLock.current = true; setWriting(true);
    try {
    const result = await saveAttentionAction(eventId, { kind, requestId, versionId, payload });
    if (result.ok && result.refreshWarning) setWarning("已保存，但页面缓存刷新未完成。当前记录将重新读取。");
    if (!result.ok) { writeLock.current = false; setWriting(false); }
    return result.ok ? { ok: true } : { ok: false, message: "未保存，请检查当前版本和输入后重试。输入已保留。" };
    } catch (error) { writeLock.current = false; setWriting(false); throw error; }
  };
  return <section className="mt-6 rounded-lg border p-4"><h2 className="font-semibold">阅读约定与固定留样</h2><p className="mt-1 text-xs leading-6 text-muted-foreground">全部材料始终可看；未匹配和尚未判断的材料也不会被隐藏。只有你主动登记才计入约定，读取页面不代表实际看到。</p><a href={`/signals/events/${eventId}`} className="mt-2 inline-block text-xs text-primary underline">回到事件全部材料</a><div><Button className="mt-3" size="sm" variant="outline" disabled={busy || writing} onClick={read}>{busy ? "正在读取……" : loaded ? "重新读取阅读约定" : "主动读取阅读约定"}</Button></div>{error && <p role="status" className="mt-2 text-xs">{error}</p>}{warning && <p role="status" className="mt-2 text-xs">{warning}</p>}{loaded && !available && <p className="mt-3 text-xs">阅读约定尚未启用，请先完成数据库更新。</p>}{loaded && available && <>
    <p className="mt-3 text-xs leading-6">{current ? `当前约定：每 ${String(current.payload.everyNth)} 次登记留 1 条，从第 1 条开始，包含跳过项。` : "目前没有进行中的阅读约定。"}</p>
    {current && <div className="mt-3 rounded-md border p-3 text-xs leading-6"><p>值得提醒的变化：{text(current.payload.triggers)}</p><p>不能忽略的反例：{text(current.payload.counterevidence)}</p><ConnectedForm operation={`attention-exit:${eventId}:${current.id}`} label="退出这版阅读约定" onSaved={saved} submit={(_, requestId) => save("contract_exit", requestId, {}, current.id)}><p>历史登记和固定样本仍保留。</p></ConnectedForm></div>}
    <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">{current ? "改版阅读约定" : "建立新的阅读约定"}</summary><ConnectedForm key={`contract:${lastVersion?.id ?? "initial"}`} operation={`attention-contract:${eventId}:${lastVersion?.id ?? "initial"}`} label="保存为新版本" onSaved={saved} submit={(data, requestId) => save("contract", requestId, { triggers: value(data, "triggers"), counterevidence: value(data, "counterevidence"), everyNth: Number(value(data, "everyNth")) }, lastVersion?.id ?? null)}><Field name="triggers" label="什么可观察的变化值得提醒" multiline required /><Field name="counterevidence" label="什么反例不能忽略" multiline required /><Field name="everyNth" label="固定规则：每 N 次主动登记留 1 条（N 为正整数）" type="number" initial="3" required /><p className="text-xs leading-6">规则保存后从首次登记起固定；改版只作用于新登记，旧样本和旧规则保留，不回填过去曝光。</p></ConnectedForm></details>
    {current && <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">主动登记一份材料（包括跳过）</summary><ConnectedForm operation={`attention-register:${eventId}:${current.id}`} label="登记我的选择" onSaved={saved} submit={(data, requestId) => save("register", requestId, { snapshotId, choice: value(data, "choice"), contractMatch: value(data, "contractMatch"), matchReason: value(data, "matchReason") }, current.id)}><ReasoningSourcePicker eventId={eventId} label="选择实际看到 / 跳过的材料" onSelect={snapshot => setSnapshotId(snapshot.id)} /><input type="hidden" name="snapshotId" value={snapshotId} /><Choice name="choice" label="我对这份材料的实际选择" options={[["pending", "待判断"], ["seen", "看到"], ["skip", "跳过"], ["open", "打开"]]} /><Choice name="contractMatch" label="我核对后是否匹配约定" options={[["unknown", "尚未判断 / 未知"], ["matched", "匹配"], ["not_matched", "不匹配"]]} /><Field name="matchReason" label="匹配 / 未匹配的核对依据（可选）" multiline /><p className="text-xs leading-6">服务器按固定序号留样，每份快照每版只登记一次。跳过也计入序号；重复登记保留首次选择，不会更新原选择。</p></ConnectedForm></details>}
    <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">查看全部登记与冻结留样（{registrations.length}）</summary>{registrations.map(row => {
      const contract = entries.find(item => item.id === row.version_id);
      const frozenRule = row.payload.rule && typeof row.payload.rule === "object" ? row.payload.rule as Record<string, unknown> : contract?.payload;
      const snapshot = row.payload.snapshot && typeof row.payload.snapshot === "object" ? row.payload.snapshot as Record<string, unknown> : {};
      const sampled = row.payload.sampled === true;
      const starts = entries.filter(item => item.kind === "blind_start" && item.payload.registrationId === row.id);
      const start = starts.at(-1);
      const judgment = start && entries.find(item => item.kind === "blind_judge" && item.payload.sessionId === start.id);
      const terminal = start && entries.find(item => (item.kind === "blind_exit" || item.kind === "blind_reveal") && item.payload.sessionId === start.id);
      return <article key={row.id} className="mt-4 rounded-md border p-3 text-xs leading-6"><h3 className="font-medium">登记 #{String(row.payload.ordinal ?? row.revision)} · {choiceLabels[text(row.payload.choice)] ?? text(row.payload.choice)} · {sampled ? "固定留样" : "普通登记"}</h3><p>冻结规则：每 {String(frozenRule?.everyNth ?? "未知")} 次登记留 1 条，从第 1 条开始。</p><p>人工核对：{({ matched: "匹配", not_matched: "不匹配", unknown: "尚未判断 / 未知" } as Record<string, string>)[text(row.payload.contractMatch)] ?? "尚未判断 / 未知"} · {text(row.payload.matchReason)}</p><p>当时提醒条件：{text(frozenRule?.triggers)}</p><p>当时不可忽略的反例：{text(frozenRule?.counterevidence)}</p>
      {entries.filter(item => item.kind === "review" && item.payload.registrationId === row.id).map(review => <p key={review.id}>复查备注：{text(review.payload.note)}</p>)}
      <details><summary className="cursor-pointer">查看登记时冻结原文</summary><p className="whitespace-pre-wrap break-words">{text(snapshot.body)}</p><p>捕获范围：{text(snapshot.captureScope) || "以来源快照为准"}</p>{text(snapshot.snapshotId) && <a className="underline" href={`/signals/events/${eventId}/sources/${text(snapshot.snapshotId)}`}>打开登记时冻结快照</a>}</details>
      <details><summary className="cursor-pointer">追加复查备注</summary><ConnectedForm operation={`attention-review:${eventId}:${row.id}`} label="保存复查备注" onSaved={saved} submit={(data, requestId) => save("review", requestId, { registrationId: row.id, note: value(data, "note") })}><Field name="note" label="回看这次选择，学到了什么 / 还未知什么" multiline required /></ConnectedForm></details>
      {sampled && !start && <ConnectedForm operation={`attention-blind-start:${eventId}:${row.id}`} label="自愿先读正文再看标题" onSaved={saved} submit={(_, requestId) => save("blind_start", requestId, { registrationId: row.id })}><p>这是自愿练习。你可能已经见过标题，这只练习先读材料，不证明从未见过标题；可以直接退出，原事件页面仍可直接访问。</p></ConnectedForm>}
      {start && !terminal && <><AttentionBlindMaterial material={{ body: text(start.payload.body) || text(snapshot.body), sourceUrl: text(start.payload.sourceUrl) }} />{!judgment && <ConnectedForm operation={`attention-blind-judge:${eventId}:${start.id}`} label="先保存我的判断" onSaved={saved} submit={(data, requestId) => save("blind_judge", requestId, { sessionId: start.id, judgment: value(data, "judgment") })}><Field name="judgment" label="只读上述正文，我自己的判断 / 仍未知什么" multiline required /></ConnectedForm>}{judgment && <><p className="mt-2">揭晓前记录的判断：{text(judgment.payload.judgment)}</p><ConnectedForm operation={`attention-blind-reveal:${eventId}:${start.id}`} label="揭晓标题" onSaved={saved} submit={(_, requestId) => save("blind_reveal", requestId, { sessionId: start.id })}><p>先前判断已冻结。</p></ConnectedForm></>}<ConnectedForm operation={`attention-blind-exit:${eventId}:${start.id}`} label="直接退出先判实验" onSaved={saved} submit={(_, requestId) => save("blind_exit", requestId, { sessionId: start.id })}><p>无需填写判断，退出后不能补写揭晓前判断。</p></ConnectedForm></>}
      {terminal && <div className="mt-3"><p>{terminal.kind === "blind_exit" ? "已退出先判实验" : "已揭晓标题"}：{text(terminal.payload.title)}</p>{judgment && <p>揭晓前判断：{text(judgment.payload.judgment)}</p>}<p className="whitespace-pre-wrap break-words">{text(terminal.payload.body)}</p>{text(terminal.payload.sourceUrl) && <a className="underline" href={text(terminal.payload.sourceUrl)} target="_blank" rel="noreferrer">打开原页面</a>}</div>}
      </article>;
    })}</details><details className="mt-4 text-xs leading-6"><summary className="cursor-pointer">阅读约定版本历史</summary>{entries.filter(row => row.kind === "contract" || row.kind === "contract_exit").map(row => <div key={row.id} className="mt-3 border-t pt-2"><p>#{row.revision} · {row.kind === "contract_exit" ? "退出约定" : `每 ${String(row.payload.everyNth)} 次登记留 1 条`}</p><p>{text(row.payload.triggers)}</p><p>{text(row.payload.counterevidence)}</p></div>)}</details>
    </>}</section>;
}
export function AttentionPanel({ eventId }: { eventId: string }) { return <AttentionInner key={eventId} eventId={eventId} />; }
