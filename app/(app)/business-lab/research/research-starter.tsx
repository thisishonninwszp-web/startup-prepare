'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {ConfirmButton} from '@/components/ui/confirm-button';
import {DIMENSIONS,researchPublicUrl} from '@/lib/domains/business-teardowns/research/presentation';
import type {CaseOption,ResearchKind} from '@/lib/domains/business-teardowns/research/domain';
import type {ResearchStarter} from '@/lib/domains/business-teardowns/research/starter-types';
import {loadResearchStarterAction} from './actions';

export function ResearchStarterPanel({caseIds,kind,disabled,onAdopt,onCompare}:{caseIds:string[];kind:ResearchKind;disabled:boolean;onAdopt:(starter:ResearchStarter,confirmed:string[])=>void;onCompare:(candidate:CaseOption)=>void}){
  const [starter,setStarter]=useState<ResearchStarter|null>(null);
  const [confirmed,setConfirmed]=useState<string[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const sequence=useRef(0);
  const load=useCallback(async()=>{
    const ticket=++sequence.current;
    if(!caseIds.length){setStarter(null);return;}
    setBusy(true);setError('');setStarter(null);setConfirmed([]);
    try{const next=await loadResearchStarterAction({caseIds,kind});if(ticket===sequence.current)setStarter(next);}
    catch(reason){if(ticket===sequence.current)setError(reason instanceof Error?reason.message:'资料读取未确认');}
    finally{if(ticket===sequence.current)setBusy(false);}
  },[caseIds,kind]);
  useEffect(()=>{const requests=sequence;void load();return()=>{requests.current++;};},[load]);

  if(!caseIds.length)return <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">先选择一个案例，程序会带出它的材料、可核对的报告解释与对照入口。</p>;
  return <section aria-label="从案例接着研究" className="space-y-4 rounded-lg border border-dashed p-4">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-medium">从案例接着研究</h3><p className="mt-1 text-xs leading-6 text-muted-foreground">复用已保存材料与已发布报告，不另发 AI 请求。下稿是待核对解释，采用后仍需补自己的假设、反例和下一步。</p></div><Button type="button" variant="outline" size="sm" disabled={busy||disabled} onClick={()=>void load()}>重新读取案例资料</Button></header>
    {busy&&<p role="status" className="text-sm">正在读取所选案例的资料…</p>}
    {error&&<p role="alert" className="text-sm">资料未读取成功：{error}。当前研究表单仍保留，可重新读取。</p>}
    {starter&&<>
      <p className="text-sm">{starter.cases.map(c=>c.name).join(' ↔ ')} · {starter.sources.length} 份可读冻结材料</p>
      {kind==='comparison'&&caseIds.length===1&&<div className="space-y-2"><h4 className="text-sm font-medium">选择另一份案例作对照</h4><p className="text-xs text-muted-foreground">从近期保存的 20 份案例中，列出最多 6 家不同商家，按保存时间排列。</p>{starter.candidates.map(c=><div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"><div className="min-w-0"><p className="break-words text-sm">{c.name} · {c.date}</p><p className="text-xs leading-6 text-muted-foreground">{c.reason}</p></div><Button type="button" variant="outline" size="sm" disabled={disabled} onClick={()=>onCompare(c)}>用此案例作右案</Button></div>)}{!starter.candidates.length&&<p className="text-sm text-muted-foreground">近期还没有另一家商家的案例，可从上方案例列表选择。</p>}</div>}
      <details><summary className="cursor-pointer text-sm font-medium">查看下稿与待补内容</summary><div className="mt-3 space-y-3 text-sm"><p>{starter.draft.title}</p>{kind==='comparison'&&(starter.draft.payload.dimensions as Record<string,unknown>[]).map(d=><div key={String(d.key)} className="space-y-1 rounded-md border p-3"><p className="font-medium">{DIMENSIONS.find(([key])=>key===d.key)?.[1]}</p><p className="whitespace-pre-wrap break-words">左案：{String(d.left)||'尚无依据，留空待核对'}</p><p className="whitespace-pre-wrap break-words">右案：{String(d.right)||'尚无依据，留空待核对'}</p></div>)}{kind==='apprenticeship'&&<p className="whitespace-pre-wrap break-words">{String(starter.draft.payload.mechanism)||'经营机制尚无可核对解释，留空。'}</p>}<ul className="list-disc space-y-1 pl-5 text-muted-foreground">{starter.gaps.map((gap,index)=><li key={index}>{gap}</li>)}</ul></div></details>
      {starter.hints.map(hint=>{const source=starter.sources.find(s=>s.id===hint.snapshotId);return <div key={hint.id} className="space-y-2 rounded-md border p-3"><p className="text-xs text-muted-foreground">{hint.caseName} · 报告版本 {hint.reportRevision} · {hint.section}</p><blockquote className="whitespace-pre-wrap break-words border-l-2 pl-3 text-sm">{hint.quote}</blockquote>{source&&researchPublicUrl(source.url)&&<a href={researchPublicUrl(source.url)!} target="_blank" rel="noreferrer" className="text-xs underline">打开原始出处</a>}<label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={disabled} checked={confirmed.includes(hint.id)} onChange={e=>setConfirmed(previous=>e.target.checked?[...previous,hint.id]:previous.filter(id=>id!==hint.id))}/>我已核对这段引文公开且已去除身份信息，采用时附上此出处</label></div>;})}
      <details><summary className="cursor-pointer text-sm font-medium">查看这次带入的冻结原文</summary><div className="mt-3 space-y-3">{starter.sources.map(source=><details key={source.id} className="rounded-md border p-3 text-sm"><summary className="cursor-pointer">{source.title} · {source.date??'日期未知'}</summary><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-6">{source.text}</pre></details>)}{!starter.sources.length&&<p className="text-sm text-muted-foreground">没有可读正文，可继续使用下方来源检索。</p>}</div></details>
      <div className="space-y-2"><p className="text-xs leading-6 text-muted-foreground">带入将替换当前未保存的研究标题、正文和附上出处；不会修改已有研究。已确认 {confirmed.length} 段引文，其余保持未附出处。</p><ConfirmButton type="button" variant="outline" disabled={disabled} confirmLabel="确认带入并替换当前未保存输入" onClick={()=>onAdopt(starter,confirmed)}>带入下稿和案例资料</ConfirmButton></div>
    </>}
  </section>;
}
