'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {loadBusinessReportDiagnosticsAction} from './report-actions';
import {REPORT_SECTION_LABELS} from './report-view';
import {REPORT_RULE_LABELS,REPORT_FIELD_LABELS} from '@/lib/domains/business-teardowns/report-rule-labels';
type DiagnosticState=Awaited<ReturnType<typeof loadBusinessReportDiagnosticsAction>>;
export function BusinessReportDiagnostics({caseId,reportId}:{caseId:string;reportId:string}){
 const [data,setData]=useState<DiagnosticState>(),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(){if(busy)return;setBusy(true);setError('');try{setData(await loadBusinessReportDiagnosticsAction({caseId,reportId}));setOpen(true);}catch{setError('拦截记录读取未完成。请检查连接后重新读取；不会重新生成报告。');}finally{setBusy(false);}}
 return <section className="space-y-3 rounded border p-4 text-xs leading-6" aria-label="拦截诊断"><h3 className="font-medium">拦截诊断（不属于报告结论）</h3><p>主动读取后可查看被剔除片段、规则及生成版本，用于分析误伤或改进生成。诊断片段未经验证，不能作为事实依据；来源或报告清除后相关片段也会清除。</p><Button size="sm" variant="outline" disabled={busy} onClick={()=>{if(open)setOpen(false);else if(data)setOpen(true);else void load();}}>{busy?'正在读取拦截记录…':open?'收起拦截记录':'查看拦截记录'}</Button>{error&&<p role="status">{error}</p>}
 {open&&data&&<div className="space-y-3"><p>报告版本 {data.revision} · 材料版本 {data.materialRevision} · 生成提示词 {data.promptVersion??'未记录'} · 模型 {data.model??'未记录'} · 生成时间 {data.createdAt}</p>{!data.sections.length&&<p>{data.erased?'正文已清除，相关诊断不再保留。':'这份报告没有留存可回看的原片段。此前未启用留存的片段无法追回。'}</p>}{data.sections.map(section=><div key={section.key} className="space-y-3"><h4 className="font-medium">{REPORT_SECTION_LABELS[section.key]}</h4>{section.items.map((item,index)=><div key={index} className="rounded border p-3"><p>{REPORT_FIELD_LABELS[item.detailField]} · 原条目 {item.itemIndex+1} · {REPORT_RULE_LABELS[item.rule]}</p><p className="text-muted-foreground">规则：{item.rule} · 校验版本：{item.validatorVersion}</p><pre className="mt-2 whitespace-pre-wrap break-words font-sans">{item.rejectedText}</pre>{item.truncated&&<p>因留存容量限制，此条原文已截短；仅当前可见部分被保留。</p>}</div>)}</div>)}</div>}
 </section>;
}
