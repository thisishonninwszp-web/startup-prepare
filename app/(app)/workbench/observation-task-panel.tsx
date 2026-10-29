"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ObservationTask, TaskConfig, TaskVersion, ObservationRun } from "@/lib/domains/observations/domain";
import { createObservationTask, updateObservationTask, saveObservationRun, attachObservationRun, loadObservationTasks, loadObservationTask } from "./observation-actions";
import { Choice, ConnectedForm, Field, lines, nullableNumber, value } from "./connected-form";
import { SearchImportPanel } from "./search-import-panel";
import { SearchComparisonPanel } from "./search-comparison-panel";

const runStatus = { success: "已记录", partial: "部分返回", failed: "采集未完成", unavailable: "来源不可用" };
const origins = { manual: "人工记录", public: "公开原文", synthetic: "合成输入", ai_seed: "AI 待查词" };

export function ObservationRunView({ run }: { run: ObservationRun }) {
  const p = run.payload;
  return <article className="space-y-2 rounded-md border p-3 text-xs leading-6">
    <p className="font-medium">{runStatus[p.status]} · {run.created_at.slice(0, 10)}</p>
    <p className="text-muted-foreground">配置版本 {run.task_version_id.slice(0, 8)} · 返回范围：{p.returnedScope} · {p.truncated ? "原文有截断" : "未标记截断"}</p>
    <p>数据期：{p.dataPeriod || "未知"} · 解析器：{p.parserVersion} · 实际费用：{p.costMinor === null ? "未记录" : `${p.costMinor} ${p.currency}（最小货币单位）`}</p>
    {p.resultState === "zero" && <p>本次口径下返回零条；不代表没有需求。</p>}
    {p.error && <p>{p.error}</p>}
    {p.records.map((r, i) => <details key={i} className="border-t pt-2"><summary className="cursor-pointer break-words">{r.title} · {origins[r.origin]}{r.metric ? ` · ${r.metric}：${r.value === null ? "数值未知" : `${r.value} ${r.unit || ""}`}` : ""}</summary><blockquote className="mt-2 whitespace-pre-wrap break-words border-l-2 pl-3">{r.text}</blockquote>{r.sourceUrl && <a className="break-all text-primary underline" href={r.sourceUrl} rel="noopener noreferrer" target="_blank">查看原出处 ↗</a>}<p className="text-muted-foreground">{r.data?.observedOrigin === "provider_export" && <>供应商导出中的实测词 · 用途：{({ problem: "问题表述", solution: "解决办法", alternative: "替代方案", purchase: "询价 / 购买" } as Record<string, string>)[String(r.data.purpose)] || "未记录"} · 采集集合：{r.data.collectionSet === "fixed" ? "固定词组" : r.data.collectionSet === "exploratory" ? "探索词组" : "尚未分配"} · 种子由来：{Array.isArray(r.data.seedOrigins) && r.data.seedOrigins.length ? r.data.seedOrigins.map(String).map(s => s === "ai" ? "AI 待查建议" : s === "source" ? "来源摘取" : "用户输入").join("、") : "不是已登记种子"}。种子和词组计划本身不是观测。</>}</p><p className="text-muted-foreground">发布于：{r.publishedAt || "未知"} · 地区：{r.region || "未记录"} · 时段：{r.time || "未记录"}</p>{r.data && Object.keys(r.data).length > 0 && <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(r.data, null, 2)}</pre>}</details>)}
    {p.rawSnapshot && <details><summary className="cursor-pointer">完整已存原始输入</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words">{p.rawSnapshot}</pre></details>}
    <details><summary className="cursor-pointer text-muted-foreground">本次条件与来源口径</summary><pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify({ requestConditions: p.requestConditions, providerMetadata: p.providerMetadata, pagination: p.pagination }, null, 2)}</pre></details>
  </article>;
}

function ConfigFields({ config }: { config?: TaskConfig }) {
  return <><Field name="question" label="要核对的问题" required initial={config?.question} /><Field name="decision" label="它能改变哪个决定" required initial={config?.decisionToChange} /><Field name="sources" label="允许的来源（每行一个）" multiline required initial={config?.sources.join("\n")} /><div className="grid gap-3 sm:grid-cols-2"><Field name="region" label="地区" initial={config?.region} /><Field name="language" label="语言" initial={config?.language} /></div><Field name="timeRange" label="观察时间范围" initial={config?.timeRange} /><Field name="fixed" label="固定词组（每行一个）" multiline initial={config?.fixedPhrases.join("\n")} /><Field name="exploratory" label="探索词组（每行一个，只是待查词）" multiline initial={config?.exploratoryPhrases.join("\n")} /><Field name="newSeeds" label="追加待查种子（每行一个，本身不是观测）" multiline /><Choice name="seedOrigin" label="这次追加种子的由来" options={[["user", "自己提出的待查词"], ["source", "从来源摘取的待查词"], ["ai", "粘贴的 AI 建议，尚未核对"]]} /><Field name="seedUrl" label="种子的出处 URL（可空）" type="url" /><Field name="stop" label="何时停止继续收集" required initial={config?.stopCondition} /></>;
}
function configFrom(data: FormData, prior?: TaskConfig): TaskConfig {
  return { question: value(data, "question"), decisionToChange: value(data, "decision"), sources: lines(data, "sources"), region: value(data, "region"), language: value(data, "language"), timeRange: value(data, "timeRange"), fixedPhrases: lines(data, "fixed"), exploratoryPhrases: lines(data, "exploratory"), stopCondition: value(data, "stop"), mode: "manual", seeds: [...(prior?.seeds ?? []), ...lines(data, "newSeeds").map(text => ({ text, origin: value(data, "seedOrigin") as "user" | "source" | "ai", sourceUrl: value(data, "seedUrl") || null }))], filters: prior?.filters ?? {}, resources: prior?.resources ?? null };
}

function TaskDetail({ task, versions, runs, reload, versionsNextBefore, runsNextCursor, historyBusy, moreHistory }: { task: ObservationTask; versions: TaskVersion[]; runs: ObservationRun[]; reload: () => Promise<void>; versionsNextBefore: number | null; runsNextCursor: string | null; historyBusy: boolean; moreHistory: (kind: "versions" | "runs") => Promise<void> }) {
  const current = [...versions].sort((a, b) => b.revision - a.revision)[0];
  if (!current) return <p className="text-xs">这个任务还没有可读的配置版本。</p>;
  return <div className="mt-4 space-y-4 border-t pt-4">
    <p className="text-sm font-medium">{current.config.question}</p><p className="text-xs text-muted-foreground">当前配置 v{current.revision} · {current.config.decisionToChange}。人工执行；保存不会联系任何人、调用 AI 或记录真实验证。</p>
    <details className="text-xs"><summary className="cursor-pointer">修改配置，保存为新版本</summary><ConnectedForm key={current.id} operation={`observation-config:${task.id}`} submit={async (data, requestId) => { await updateObservationTask({ taskId: task.id, config: configFrom(data, current.config), requestId }); return { ok: true }; }} onSaved={reload} label="追加配置版本"><ConfigFields config={current.config} /></ConnectedForm></details>
    <details className="text-xs"><summary className="cursor-pointer">记一次人工观察</summary><ConnectedForm key={current.id} operation={`observation-run:${current.id}`} onSaved={reload} resetOnSuccess label="保存本次原始记录" submit={async (data, requestId) => {
      const status = value(data, "status") as "success" | "partial" | "failed" | "unavailable";
      const failed = status === "failed" || status === "unavailable";
      const state = failed ? "failed" : value(data, "state") as "observed" | "zero" | "unknown" | "suppressed";
      await saveObservationRun({ taskId: task.id, taskVersionId: current.id, requestId, run: { status, resultState: state, records: failed || state === "zero" ? [] : [{ title: value(data, "title"), text: value(data, "text"), origin: value(data, "origin") as "public" | "manual" | "synthetic", sourceUrl: value(data, "url") || null, publishedAt: value(data, "publishedAt") ? new Date(value(data, "publishedAt")).toISOString() : null, metric: value(data, "metric") || null, value: nullableNumber(data, "metricValue"), unit: value(data, "unit") || null }], dataPeriod: value(data, "period") || null, returnedScope: value(data, "scope"), truncated: data.get("truncated") === "on", error: value(data, "error") || null } });
      return { ok: true };
    }}><Choice name="status" label="本次获取情况" options={[["success", "取得记录"], ["partial", "只取得部分"], ["failed", "未完成，保留失败记录"], ["unavailable", "来源不可用"]]} /><Choice name="state" label="结果口径（失败时固定为采集失败）" options={[["observed", "有记录"], ["zero", "明确返回零条"], ["unknown", "未知"], ["suppressed", "供应商隐藏数值"]]} /><Field name="title" label="记录名称（有记录时填写）" /><Field name="text" label="实际原文（有记录时填写）" multiline maxLength={30000} /><Choice name="origin" label="原文性质" options={[["public", "公开原文，须填出处"], ["manual", "自己记下的观察"], ["synthetic", "合成输入，不能当真人反馈"]]} /><Field name="url" label="来源 URL" type="url" /><Field name="publishedAt" label="原文发布时间（未知留空）" type="datetime-local" /><Field name="period" label="数据覆盖时段" /><Field name="scope" label="实际返回范围和覆盖限制" required /><label className="flex items-center gap-2"><input type="checkbox" name="truncated" />原文或返回结果有截断</label><div className="grid gap-3 sm:grid-cols-3"><Field name="metric" label="原始指标名（可空）" /><Field name="metricValue" label="数值（未知留空）" type="number" /><Field name="unit" label="单位" /></div><Field name="error" label="缺失、未完成或不可用原因" multiline /></ConnectedForm></details>
    <SearchImportPanel configuredTerms={[...current.config.fixedPhrases, ...current.config.exploratoryPhrases, ...current.config.seeds.map(seed => seed.text)]} key={current.id} taskId={task.id} versionId={current.id} context={{ region: current.config.region, language: current.config.language, timeframe: current.config.timeRange }} onSaved={reload} />
    <SearchComparisonPanel runs={runs} />
    <div className="text-xs leading-6"><p className="text-muted-foreground">准备向真人核对：{current.config.question}。带上具体原文、运行编号与仍未知的问题。</p><Link className="text-primary underline" href="/outreach/new?use_case=startup">根据这次观察准备接触 →</Link><p className="text-muted-foreground">进入已有触达画布后自行填写，不会自动发送消息。</p></div>
    <details className="text-xs"><summary className="cursor-pointer">配置历史（已读取 {versions.length}）</summary>{versions.map(v => <article key={v.id} className="mt-2 border-l pl-3"><p>v{v.revision} · {v.created_at.slice(0, 10)} · {v.config.question}</p><p>改变：{v.config.decisionToChange} · 停止：{v.config.stopCondition}</p><pre className="max-h-60 overflow-auto whitespace-pre-wrap">{JSON.stringify({ config: v.config, decisionSnapshot: v.decision_snapshot, gapSnapshot: v.gap_snapshot }, null, 2)}</pre></article>)}{versionsNextBefore !== null && <Button type="button" size="sm" variant="outline" disabled={historyBusy} onClick={() => void moreHistory("versions")}>读取更早配置</Button>}</details>
    <div className="space-y-3"><h3 className="text-sm font-medium">运行与原始记录</h3>{runs.length === 0 && <p className="text-xs text-muted-foreground">还没有运行；先执行人工观察，再把实际取得的内容记下。</p>}{runs.map(run => <div key={run.id}><ObservationRunView run={run} /><Link className="mt-2 inline-block text-xs text-primary underline" href={run.payload.parserVersion === "search-csv-v1" && run.payload.status === "success" ? `/outreach/new?use_case=startup&observation_run_id=${run.id}` : "/outreach/new?use_case=startup"}>{run.payload.parserVersion === "search-csv-v1" && run.payload.status === "success" ? "带上这次搜索观察准备接触 →" : "手动准备接触（不自动带入材料） →"}</Link>{task.gap_id && <ConnectedForm operation={`observation-attach:${run.id}`} label="确认把这次运行引用补回原缺口" onSaved={reload} submit={async (_, requestId) => { await attachObservationRun({ gapId: task.gap_id!, runId: run.id, requestId }); return { ok: true }; }}><p className="text-xs text-muted-foreground">只追加引用，不把缺口改成“拿到了”。</p></ConnectedForm>}</div>)}</div>
    {runsNextCursor && <Button type="button" size="sm" variant="outline" disabled={historyBusy} onClick={() => void moreHistory("runs")}>读取更早运行</Button>}
  </div>;
}

export function ObservationTaskPanel({ ideaId, gapId, question }: { ideaId?: string; gapId?: string; question?: string }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [tasks, setTasks] = useState<ObservationTask[]>([]);
  const [available, setAvailable] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ task: ObservationTask; versions: TaskVersion[]; runs: ObservationRun[]; versionsNextBefore: number | null; runsNextCursor: string | null } | null>(null);
  const loading = useRef(false);
  const load = async (taskId?: string, cursor?: string, propagate = false) => {
    if (loading.current) return;
    loading.current = true; setBusy(true); setMessage("");
    try {
      const result = await loadObservationTasks({ ...(ideaId ? { objectType: "idea", objectId: ideaId } : {}), ...(cursor ? { cursor } : {}) });
      if (result.status === "missing-schema") { setAvailable(false); setMessage("观察任务暂不可用；现有记录与信息缺口仍可使用。"); if (propagate) throw new Error("观察任务暂不可用"); return; }
      setAvailable(true); setNextCursor(result.nextCursor);
      const items = result.items.filter(t => !gapId || t.gap_id === gapId);
      setTasks(old => cursor ? [...new Map([...old, ...items].map(t => [t.id, t])).values()] : items);
      const selected = taskId || detail?.task.id;
      if (selected) {
        const d = await loadObservationTask(selected);
        if (d.status === "ready" && d.task) setDetail({ task: d.task, versions: d.versions, runs: d.runs, versionsNextBefore: d.versionsNextBefore, runsNextCursor: d.runsNextCursor });
      }
    } catch (error) { setMessage("未能读取观察任务，请重试。"); if (propagate) throw error; }
    finally { loading.current = false; setBusy(false); }
  };
  const moreHistory = async (kind: "versions" | "runs") => {
    if (!detail || loading.current) return;
    loading.current = true; setBusy(true); setMessage("");
    try {
      const r = await loadObservationTask(detail.task.id, kind === "versions" ? { versionBefore: detail.versionsNextBefore ?? undefined } : { runCursor: detail.runsNextCursor ?? undefined });
      if (r.status !== "ready") { setMessage("历史暂不可用，请重试。"); return; }
      setDetail(old => old ? { ...old, ...(kind === "versions" ? { versions: [...new Map([...old.versions, ...r.versions].map(v => [v.id, v])).values()], versionsNextBefore: r.versionsNextBefore } : { runs: [...new Map([...old.runs, ...r.runs].map(v => [v.id, v])).values()], runsNextCursor: r.runsNextCursor }) } : old);
    } catch { setMessage("更早历史未能读取，请重试。"); }
    finally { loading.current = false; setBusy(false); }
  };
  return <section className="rounded-lg border bg-card p-4" aria-label="观察任务"><button type="button" className="w-full text-left text-sm font-medium" aria-expanded={open} onClick={() => { setOpen(!open); if (!open) void load(); }}>观察任务 · 人工记录与搜索导入 <span aria-hidden>{open ? "−" : "+"}</span></button>{open && <div className="mt-3 space-y-3"><p className="text-xs leading-6 text-muted-foreground">本期只支持想法。每个任务保留配置与运行原文；搜索和公开材料只能提出问题，痛点与付费仍需真实接触。</p>{busy && <p role="status" className="text-xs">正在读取……</p>}{message && <p role="status" className="text-xs">{message} <button onClick={() => void load()} className="underline">重试</button></p>}<ul className="space-y-2">{tasks.map(task => <li key={task.id} className="flex flex-wrap gap-3 text-xs"><button className="text-left text-primary underline" disabled={busy} onClick={() => void load(task.id)}>{task.versions?.[0]?.config.question || `观察任务 · ${task.created_at.slice(0, 10)}`}</button>{!ideaId && <Link className="text-muted-foreground underline" href={`/ideas/${task.object_id}#gaps`}>打开关联想法</Link>}</li>)}</ul>{nextCursor && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void load(undefined, nextCursor)}>读取更多任务</Button>}{ideaId && available && <details className="text-xs"><summary className="cursor-pointer">为{gapId ? "这个缺口" : "这个想法"}建立观察任务</summary><ConnectedForm operation={`observation-create:${ideaId}:${gapId || ""}`} onSaved={() => load(undefined, undefined, true)} resetOnSuccess label="保存人工观察任务" submit={async (data, requestId) => { const config = configFrom(data); await createObservationTask({ objectType: "idea", objectId: ideaId, gapId, requestId, config }); return { ok: true }; }}><ConfigFields config={question ? { question, decisionToChange: "", sources: [], region: "", language: "", timeRange: "", fixedPhrases: [], exploratoryPhrases: [], seeds: [], filters: {}, stopCondition: "", mode: "manual", resources: null } : undefined} /></ConnectedForm></details>}{detail && <TaskDetail key={detail.task.id} {...detail} historyBusy={busy} moreHistory={moreHistory} reload={() => load(detail.task.id, undefined, true)} />}</div>}</section>;
}





