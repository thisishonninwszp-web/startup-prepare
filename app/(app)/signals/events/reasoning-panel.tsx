"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConnectedForm, Field, Choice } from "@/app/(app)/workbench/connected-form";
import { loadReasoningAction, saveReasoningAction } from "./reasoning-actions";
import { ReasoningSourcePicker } from "./source-picker";
import { dimensions, reasoningKinds, reasoningPayload, type QuoteRef } from "./reasoning-fields";

type Row = { id: string; revision: number; kind: string; payload: Record<string, unknown> };
type Impact = { id: string; subject_kind: string; subject_id: string; old_conclusion: Record<string, unknown>; acknowledged: boolean; correction?: Row };
const labels: Record<string, string> = { ...Object.fromEntries(reasoningKinds), text: "我的判断", refs: "引用原话", snapshotId: "快照", quote: "原话", claimIds: "显式依赖", baseline: "基准材料", addition: "新材料", increment: "新增事实", independence: "来源独立性", independenceBasis: "独立性依据", independent: "独立", shared: "共享来源 / 转载", unknown: "未知", sample: "样本", population: "群体范围", denominator: "分母", omittedGroups: "遗漏群体", dimensions: "比较口径", ...Object.fromEntries(dimensions), left: "左侧", right: "右侧", verdict: "可比结论", comparable: "可比", not_comparable: "不可比", reason: "原因", cause: "分歧原因", fact: "事实", definition: "定义", time: "时间", mechanism: "机制", value: "价值", checkQuestion: "可核对问题", links: "传导各环", counterexample: "反例", conditions: "适用条件", invalidators: "失效条件", followUp: "后续核对", oldSnapshotId: "更正前快照", newSnapshotId: "更正后快照", impactId: "影响提示", ack: "已查看影响" };
const enumLabels: Record<string, Record<string, string>> = {
  independence: { independent: "独立", shared: "共享来源 / 转载", unknown: "未知" },
  verdict: { comparable: "可比", not_comparable: "不可比" },
  cause: { fact: "事实", definition: "定义", time: "时间", mechanism: "机制", value: "价值" },
};
function DetailsValue({ data, field }: { data: unknown; field?: string }) {
  if (data === null || data === undefined || data === "") return <span>未填写 / 未知</span>;
  if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") return <span className="whitespace-pre-wrap break-words">{(field ? enumLabels[field]?.[String(data)] : undefined) ?? String(data)}</span>;
  if (Array.isArray(data)) return <ul className="space-y-2 border-l pl-3">{data.map((item, index) => <li key={index}><DetailsValue data={item} field={field} /></li>)}</ul>;
  return <dl className="space-y-1">{Object.entries(data as Record<string, unknown>).map(([key, item]) => <div key={key}><dt className="text-muted-foreground">{labels[key] ?? key}</dt><dd className="pl-3"><DetailsValue data={item} field={key} /></dd></div>)}</dl>;
}
export function ReasoningRecord({ row }: { row: Row }) {
  return <article className="mt-3 rounded-md border p-3 text-xs leading-6"><h3 className="font-medium">#{row.revision} · {labels[row.kind] ?? row.kind}</h3><DetailsValue data={row.payload} /></article>;
}
function QuotePicker({ eventId, index, onChange }: { eventId: string; index: number; onChange: (ref: QuoteRef | null) => void }) {
  const [snapshot, setSnapshot] = useState<{ id: string; captured_text: string } | null>(null);
  const [quote, setQuote] = useState("");
  return <div className="space-y-2 rounded-md border p-3"><ReasoningSourcePicker eventId={eventId} label={index === 0 ? "选择基准 / 左侧 / 更正前材料" : "选择新材料 / 右侧 / 更正后材料"} onSelect={source => { setSnapshot(source); setQuote(""); onChange(null); }} />{snapshot && <><p className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs leading-6">{snapshot.captured_text}</p><label className="block text-xs">第 {index + 1} 份材料逐字引用<textarea className="mt-1 w-full rounded-md border bg-background p-2" name={`quote${index}`} value={quote} onChange={e => { setQuote(e.target.value); onChange(e.target.value.trim() ? { snapshotId: snapshot.id, quote: e.target.value.trim() } : null); }} /></label><input type="hidden" name={`snapshot${index}`} value={snapshot.id} /></>}</div>;
}
function ReasoningInner({ eventId }: { eventId: string }) {
  const [loaded, setLoaded] = useState(false), [available, setAvailable] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [entries, setEntries] = useState<Row[]>([]), [impacts, setImpacts] = useState<Impact[]>([]), [kind, setKind] = useState("increment");
  const [refs, setRefs] = useState<(QuoteRef | null)[]>([null, null]);
  const [warning, setWarning] = useState(""); const loading = useRef(false), writeLock = useRef(false); const [writing, setWriting] = useState(false);
  async function write(input: Parameters<typeof saveReasoningAction>[1]) { if (writeLock.current) return { ok: false as const, message: "请等当前保存完成后再操作。" }; writeLock.current = true; setWriting(true); try { const result = await saveReasoningAction(eventId, input); if (result.ok && result.refreshWarning) setWarning("已保存，但页面缓存刷新未完成。当前记录将重新读取。"); if (!result.ok) { writeLock.current = false; setWriting(false); } return result; } catch (error) { writeLock.current = false; setWriting(false); throw error; } }
  async function saved() { try { await refresh(); } finally { writeLock.current = false; setWriting(false); } }
  async function refresh() {
    const all: Row[] = []; let after = 0; let allImpacts: Impact[] = [];
    do {
      const result = await loadReasoningAction(eventId, after);
      if (!result.ok) throw new Error("推理记录读取未完成，请重试。");
      if (!result.data.available) { if (loaded) throw new Error("功能暂不可用"); setAvailable(false); setLoaded(true); return; }
      all.push(...result.data.entries); allImpacts = result.data.impacts;
      if (result.data.nextRevision === null) break;
      if (result.data.nextRevision <= after) throw new Error("读取游标未推进，请重试。");
      after = result.data.nextRevision;
    } while (true);
    setEntries(all); setImpacts(allImpacts); setLoaded(true); setAvailable(true);
  }
  async function read() { if (loading.current) return; loading.current = true; setBusy(true); setError(""); try { await refresh(); } catch { setError("推理记录读取未完成，请重试。已有输入保留。"); } finally { loading.current = false; setBusy(false); } }
  const expectedRevision = Math.max(0, ...entries.map(row => row.revision));
  return <section className="mt-6 rounded-lg border p-4"><h2 className="font-semibold">推理与来源更正</h2><p className="mt-1 text-xs leading-6 text-muted-foreground">从已保存原文出发，检查新增事实、比较口径和传导链。更正只追加影响提示，旧快照与旧结论保留。</p><Button className="mt-3" size="sm" variant="outline" disabled={busy || writing} onClick={read}>{busy ? "正在读取……" : loaded ? "重新读取推理记录" : "主动读取推理记录"}</Button>{error && <p role="status">{error}</p>}{warning && <p role="status" className="mt-2 text-xs">{warning}</p>}{loaded && !available && <p className="mt-3 text-xs">推理功能尚未启用，请先完成数据库更新。</p>}{loaded && available && <>
    {impacts.filter(impact => !impact.acknowledged).map(impact => <aside key={impact.id} className="mt-4 rounded-md border p-3 text-xs leading-6"><p className="font-medium">来源已更正，请复查原结论 · {impact.subject_kind} {impact.subject_id.slice(0, 8)}</p><DetailsValue data={impact.old_conclusion} />{typeof impact.old_conclusion.event_id === "string" && impact.old_conclusion.event_id !== eventId && <a className="underline" href={`/signals/events/${impact.old_conclusion.event_id}`}>打开受影响的事件档案</a>}{impact.correction && <details><summary>查看更正前后原话</summary><ReasoningRecord row={impact.correction} /></details>}<ConnectedForm operation={`reasoning-ack:${eventId}:${impact.id}:${expectedRevision}`} label="确认已查看此影响" onSaved={saved} submit={async (_, requestId) => { const result = await write({ requestId, expectedRevision, kind: "ack", payload: { text: "已查看，原结论保留", refs: [], claimIds: [], impactId: impact.id } }); return result.ok ? { ok: true } : { ok: false, message: "确认未保存，请重试。" }; }}><p>确认只记录已查看；需要修正时请另写判断。</p></ConnectedForm></aside>)}
    <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">追加一次人工核对</summary><label className="mt-3 block text-xs">核对内容<select aria-label="核对内容" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={kind} disabled={writing} onChange={e => { setKind(e.target.value); setRefs([null, null]); }}>{reasoningKinds.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <ConnectedForm key={kind} operation={`reasoning:${eventId}:${kind}:${expectedRevision}`} label="保存推理记录" onSaved={saved} submit={async (data, requestId) => { const result = await write({ requestId, expectedRevision, kind: kind as Parameters<typeof saveReasoningAction>[1]["kind"], payload: reasoningPayload(kind, data, refs.filter((ref): ref is QuoteRef => !!ref)) }); return result.ok ? { ok: true } : { ok: false, message: "未保存，请检查原话、必填条件与依赖记录后重试。输入已保留。" }; }}>
    <Field name="text" label="我的判断 / 这次学到了什么" multiline required />
    <QuotePicker eventId={eventId} index={0} onChange={ref => setRefs(old => [ref, old[1]])} /><QuotePicker eventId={eventId} index={1} onChange={ref => setRefs(old => [old[0], ref])} />
    {kind === "increment" && <><Field name="increment" label="新材料增加了什么具体事实" multiline required /><Choice name="independence" label="来源独立性（与是否有新增事实分别判断）" options={[["unknown", "未知"], ["shared", "共享来源 / 转载"], ["independent", "独立来源"]]} /><Field name="independenceBasis" label="独立性依据 / 为什么仍未知" multiline required /></>}
    {kind === "denominator" && <>{[["sample", "样本是什么"], ["population", "覆盖的群体范围"], ["denominator", "分母（不知道请写未知）"], ["omittedGroups", "遗漏的群体（不知道请写未知）"]].map(([name, label]) => <Field key={name} name={name} label={label} required multiline />)}</>}
    {kind === "comparability" && <>{dimensions.map(([name, label]) => <div key={name} className="grid gap-3 sm:grid-cols-2"><Field name={`${name}.left`} label={`左侧${label}（缺失写未知）`} required /><Field name={`${name}.right`} label={`右侧${label}（缺失写未知）`} required /></div>)}<Choice name="verdict" label="按以上定义能否比较" options={[["not_comparable", "不可比 / 关键定义未知"], ["comparable", "可比"]]} /><Field name="reason" label="可比依据 / 不可比原因" multiline required /></>}
    {kind === "disagreement" && <><Choice name="cause" label="分歧发生在哪里" options={[["fact", "事实"], ["definition", "定义"], ["time", "时间"], ["mechanism", "机制"], ["value", "价值取舍"]]} /><Field name="checkQuestion" label="什么问题可以核对这处分歧" multiline required /></>}
    {kind === "mechanism" && <><p className="text-xs leading-6">起点有据不代表终点已发生。每环分别附上当前所选引用、反例或未知；只填写需要的环。</p>{[1, 2, 3, 4, 5].map(i => <details key={i} open={i === 1} className="rounded-md border p-3"><summary className="text-xs">第 {i} 环</summary><Field name={`link${i}.text`} label={`第 ${i} 环发生了什么 / 如何传导`} multiline /><Choice name={`link${i}.ref`} label={`第 ${i} 环是否引用上方所选原话`} options={[["no", "不引用"], ["yes", "引用所选原话"]]} /><Field name={`link${i}.counterexample`} label={`第 ${i} 环反例`} multiline /><Field name={`link${i}.unknown`} label={`第 ${i} 环仍未知什么`} multiline /></details>)}</>}
    {kind === "applicability" && <>{[["conditions", "跨地区 / 行业类比成立的关键条件"], ["invalidators", "什么变化会使类比失效"], ["followUp", "接下来如何核对适用条件"]].map(([name, label]) => <Field key={name} name={name} label={label} required multiline />)}</>}
    {kind === "correction" && <p className="text-xs">上方第一份选更正前快照，第二份选更正后快照，分别引用具体原文。系统为直接引用和显式依赖保留复查提示。</p>}
    {kind !== "correction" && <details><summary className="text-xs">这次判断显式依赖哪些旧记录{kind === "review" ? "（至少一条）" : "（可选）"}</summary>{entries.filter(row => row.kind !== "ack" && row.kind !== "correction").map(row => <label key={row.id} className="mt-2 flex items-start gap-2 text-xs"><input type="checkbox" name="claimIds" value={row.id} /><span>#{row.revision} {String(row.payload.text ?? "")}</span></label>)}</details>}
    </ConnectedForm></details><details className="mt-4"><summary className="cursor-pointer text-sm">查看全部推理与更正历史（{entries.length}）</summary>{entries.map(row => <ReasoningRecord key={row.id} row={row} />)}</details></>}</section>;
}
export function ReasoningPanel({ eventId }: { eventId: string }) { return <ReasoningInner key={eventId} eventId={eventId} />; }
