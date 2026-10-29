"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ObservationRun } from "@/lib/domains/observations/domain";
import { compareSearchImports, parseSearchImport, type SearchImportPreview, type SearchPoint } from "@/lib/domains/observations/search/imports";

export function previewSearchRun(run: ObservationRun): SearchImportPreview | null {
  const c = run.payload.requestConditions;
  if (!run.payload.rawSnapshot || (c.provider !== "trends_web" && c.provider !== "ads_planner") || typeof c.region !== "string" || typeof c.language !== "string" || typeof c.timeframe !== "string") return null;
  return parseSearchImport(c.provider, run.payload.rawSnapshot, { region: c.region, language: c.language, timeframe: c.timeframe });
}
const display = (p?: SearchPoint) => p ? p.state === "missing" ? "缺失 / 未知" : p.state === "below_threshold" ? "低于阈值 <1" : p.rawValue : "本份导出没有这一项";

export function SearchComparisonPanel({ runs }: { runs: ObservationRun[] }) {
  const imports = runs.filter(r => r.payload.parserVersion === "search-csv-v1" && r.payload.rawSnapshot);
  const [result, setResult] = useState<{ left: SearchImportPreview; right: SearchImportPreview; comparable: boolean; reason: string } | null>(null);
  const [message, setMessage] = useState("");
  if (imports.length < 2) return <p className="text-xs text-muted-foreground">读取至少两次搜索导入后，可检查口径是否允许比较。</p>;
  return <details className="text-xs"><summary className="cursor-pointer">核对两次搜索导出的口径与原始值</summary><form className="mt-3 space-y-3" onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); const a = imports.find(r => r.id === d.get("left")), b = imports.find(r => r.id === d.get("right")); setResult(null); setMessage(""); if (!a || !b || a.id === b.id) { setMessage("请选择两次不同运行。"); return; } const left = previewSearchRun(a), right = previewSearchRun(b); if (!left || !right) { setMessage("原始导出或口径字段缺失，不能比较。"); return; } setResult({ left, right, ...compareSearchImports(left, right) }); }}>
    {[["left", "第一份"], ["right", "第二份"]].map(([name, label]) => <label className="block space-y-1" key={name}><span>{label}</span><select name={name} className="h-10 w-full rounded-md border bg-background px-3" defaultValue={name === "right" ? imports[1].id : imports[0].id} onChange={() => setResult(null)}>{imports.map(r => <option value={r.id} key={r.id}>{r.created_at.slice(0, 10)} · {r.id.slice(0, 8)} · {String(r.payload.requestConditions.provider)}</option>)}</select></label>)}<Button variant="outline" size="sm" type="submit">先检查是否可比</Button></form>{message && <p role="status" className="mt-2">{message}</p>}{result && <div className="mt-3 space-y-3"><p className="font-medium">{result.comparable ? "口径一致" : "不可直接比较"}：{result.reason}</p><p className="text-muted-foreground">即使口径一致，也只比较原始返回值；不推出需求、人数或市场规模。</p>{result.comparable ? <div className="max-h-80 overflow-auto rounded border"><table className="w-full text-left"><thead><tr><th className="p-2">词组 / 日期</th><th className="p-2">第一份原始值</th><th className="p-2">第二份原始值</th></tr></thead><tbody>{result.left.points.map((p, i) => <tr key={i} className="border-t"><td className="break-words p-2">{p.term} · {p.period || "未提供"}</td><td className="p-2">{display(p)}</td><td className="p-2">{display(result.right.points.find(q => q.term === p.term && q.period === p.period))}</td></tr>)}</tbody></table></div> : <div className="grid gap-3 sm:grid-cols-2">{[result.left, result.right].map((p, i) => <div className="rounded border p-3" key={i}><p>第 {i + 1} 份：{p.provider}</p><p>{p.context.region} · {p.context.language} · {p.context.timeframe}</p><p>{p.points.length} 项原始观测。请回到各自运行查看，不合并数值。</p></div>)}</div>}</div>}</details>;
}
