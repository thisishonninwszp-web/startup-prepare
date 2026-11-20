'use client';

import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {ConfirmButton} from '@/components/ui/confirm-button';
import type {ResultMethodList,ResultMethodRecord,ResultMethodSource} from '@/lib/domains/business-teardowns/result-methods/domain';
import type {RealityResultList} from '@/lib/domains/business-teardowns/reality-results/domain';
import {ResultBody} from '../simulation/checks/results/reality-results-views';
import {MethodFields,MethodBody} from './method-views';
import {useResultMethods} from './use-result-methods';

export type ResultMethodsPanelProps={initialState:ResultMethodList;initialSources:RealityResultList;initialRecord?:ResultMethodRecord|null;initialSource?:ResultMethodSource|null;caseId?:string;resultId?:string};
export function ResultMethodsPanel(props:ResultMethodsPanelProps){
 const w=useResultMethods(props);
 if(!w.state.available)return <p role="status" className="rounded-lg border p-5 text-sm leading-7">这里还没准备好，暂时无法读取或保存方法。稍后请重新打开。</p>;
 const returnCase=w.active?.caseId??w.source?.caseId??props.caseId;
 const returnHref=`/business-lab/simulation/checks/results?${new URLSearchParams({...(returnCase?{caseId:returnCase}:{}),...(w.sourceId?{recordId:w.sourceId}:{})}).toString()}`;
 return <div className="min-w-0 space-y-8">
  <section className="min-w-0 space-y-3"><h2 className="text-lg font-semibold">根据调查写下的方法</h2>
   {!w.state.items.length&&<p className="text-sm leading-7 text-muted-foreground">这里还没有方法。先选一条自己保存的调查结果，再写清你会怎样做，以及它在哪些条件下不适用。</p>}
   <div className="flex flex-wrap gap-2">{w.state.items.map(record=>w.dirty?<ConfirmButton key={record.id} disabled={w.blocked} variant="outline" confirmLabel="确认切换并舍弃未保存输入" className="h-auto max-w-full whitespace-normal break-words text-left" onClick={()=>void w.open(record.id)}>{record.draft.method}</ConfirmButton>:<Button key={record.id} disabled={w.blocked} variant="outline" className="h-auto max-w-full whitespace-normal break-words text-left" onClick={()=>void w.open(record.id)}>{record.draft.method}</Button>)}</div>
   <div className="flex flex-wrap gap-2"><Button disabled={w.blocked} variant="outline" onClick={()=>void w.refresh()}>重新读取列表与原调查</Button>{w.state.nextCursor&&<Button disabled={w.blocked} variant="outline" onClick={()=>void w.more('methods')}>更多方法</Button>}{w.dirty?<ConfirmButton disabled={w.blocked} variant="outline" confirmLabel="确认另写并清空未保存输入" onClick={()=>void w.newDraft()}>另写一份方法</ConfirmButton>:<Button disabled={w.blocked} variant="outline" onClick={()=>void w.newDraft()}>另写一份方法</Button>}</div>
  </section>
  {w.message&&<p role="status" className="whitespace-pre-wrap break-words rounded-lg border p-4 text-sm leading-7">{w.message}</p>}
  {w.pending&&<section className="space-y-3 rounded-lg border p-4 text-sm leading-7"><p>本次请求尚待核对，当前输入保持锁定。重试使用原来的内容，不会另写一份方法。</p><div className="flex flex-wrap gap-2"><Button disabled={w.busy} onClick={()=>void w.execute(w.pending!)}>重试本次请求</Button>{w.pending.operation==='append'&&<Button disabled={w.busy} variant="outline" onClick={()=>void w.reconcilePending()}>核对本次请求的保存状态</Button>}{w.releasable&&<ConfirmButton disabled={w.busy} variant="outline" confirmLabel="确认结束请求并保留输入" onClick={w.releasePending}>结束本次请求并保留输入</ConfirmButton>}</div></section>}
  <div className="grid min-w-0 gap-8 lg:grid-cols-2">
   <section aria-label="原调查结果" className="min-w-0 space-y-4 rounded-lg border p-5"><h2 className="text-lg font-semibold">对照这次查到的结果</h2>
    <label className="block space-y-2 text-sm"><span>本人保存的调查结果</span><select name="source" disabled={w.blocked||!!w.active||!!props.resultId} className="min-h-11 w-full min-w-0 rounded-md border bg-background p-2" value={w.sourceId} onChange={event=>void w.chooseSource(event.target.value)}><option value="">请选择调查结果</option>{w.sourceId&&!w.sources.items.some(item=>item.id===w.sourceId)&&<option value={w.sourceId}>指定的本人调查结果</option>}{w.sources.items.filter(item=>!props.resultId||item.id===props.resultId).map(item=><option key={item.id} value={item.id}>{item.createdAt} · 调查 {item.id.slice(0,8)}…{item.id.slice(-8)}</option>)}</select></label>
    {!w.active&&!props.resultId&&w.sources.nextCursor&&<Button disabled={w.blocked} variant="outline" onClick={()=>void w.more('sources')}>更多调查来源</Button>}
    {w.requestedSource!==null&&<div className="space-y-3 rounded-md border p-3 text-sm leading-7"><p>切换来源会重新核对调查结果，你独立填写的五项内容会保留。</p><ConfirmButton disabled={w.blocked} variant="outline" confirmLabel="确认切换调查来源并保留独立输入" onClick={()=>void w.chooseSource(w.requestedSource!,true)}>确认切换调查来源</ConfirmButton><Button disabled={w.blocked} variant="ghost" onClick={()=>w.setRequestedSource(null)}>保留当前来源</Button></div>}
    {w.source?<><p className="text-sm leading-7 text-muted-foreground">这是你保存的调查原文，只供对照。方法的五项内容需要你另行填写。</p><ResultBody body={w.source.body}/></>:<p className="text-sm leading-7 text-muted-foreground">{w.sourceId?'原调查结果目前不可读取，来源文字保持隐藏。已经保存的独立方法仍可阅读、寻找反例或擦除。':'先选择一条自己保存的调查结果，再写下自己的方法。'}</p>}
   </section>
   <section aria-label="独立方法" className="min-w-0 space-y-4 rounded-lg border p-5"><h2 className="text-lg font-semibold">{w.active?'你保存的方法':'亲手写清做法和适用条件'}</h2>
    {w.active?<><p className="text-sm leading-7 text-muted-foreground">保存时间：{w.active.createdAt}。这份方法保留当时的原文；补充或修正请另写一份。</p><MethodBody draft={w.active.draft}/><ConfirmButton disabled={w.blocked} variant="outline" confirmLabel="确认永久擦除这份方法的五项文字" onClick={w.erase}>擦除这份方法</ConfirmButton><p className="text-sm leading-7 text-muted-foreground">擦除后无法恢复五项文字。原调查结果和你另外写下的记录会保留。</p></>:<form onSubmit={event=>{event.preventDefault();w.makePreview();}} className="space-y-5"><fieldset disabled={w.blocked} className="min-w-0 space-y-5"><MethodFields draft={w.draft} onChange={w.change} disabled={w.blocked}/><Button type="submit" disabled={w.blocked||!w.canCreate}>先预览方法</Button></fieldset></form>}
   </section>
  </div>
  {w.preview&&<section className="space-y-4 rounded-lg border p-5"><h2 className="text-lg font-semibold">保存前逐项核对</h2><p className="text-sm leading-7 text-muted-foreground">以下五项由你亲手填写。保存表示你确认这份文字；它是否成立，还要继续找反例。</p><MethodBody draft={w.preview}/><div className="flex flex-wrap gap-2"><Button disabled={w.blocked||!w.canCreate} onClick={w.append}>确认保存这份方法</Button><Button disabled={w.blocked} variant="outline" onClick={()=>w.setPreview(null)}>返回修改</Button></div></section>}
  {w.active&&!w.blocked&&<Button asChild variant="outline"><Link href={`/business-lab/counterexamples?methodId=${w.active.id}&methodKind=learning`}>拿这份方法寻找反例</Link></Button>}
  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">{w.sourceId&&<Link href={returnHref} className="underline">返回这条原调查结果</Link>}<Link href={`/business-lab/history${returnCase?`?caseId=${returnCase}`:''}`} className="underline">查看确认经过</Link></div>
 </div>;
}
