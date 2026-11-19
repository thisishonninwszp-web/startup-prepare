'use client';

import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {ConfirmButton} from '@/components/ui/confirm-button';
import type {FollowupCheckList,FollowupCheckRecord,FollowupCheckSource} from '@/lib/domains/business-teardowns/followup-checks/domain';
import type {RealityResultList} from '@/lib/domains/business-teardowns/reality-results/domain';
import {PlanFields,PlanPreview} from '../reality-checks-views';
import {ResultBody} from '../results/reality-results-views';
import {useFollowupChecks} from './use-followup-checks';

export type FollowupChecksPanelProps={initialState:FollowupCheckList;initialSources:RealityResultList;initialRecord?:FollowupCheckRecord|null;initialSource?:FollowupCheckSource|null;caseId?:string;resultId?:string;today:string};
export function FollowupChecksPanel(props:FollowupChecksPanelProps){
 const w=useFollowupChecks(props);
 if(!w.state.available)return <p role="status" className="rounded-lg border p-5 text-sm leading-7">根据调查继续写计划的功能尚未就绪。请先执行数据库迁移 141，再重新读取。</p>;
 const returnCase=w.active?.caseId??w.source?.caseId??props.caseId;
 const returnHref=`/business-lab/simulation/checks/results?${new URLSearchParams({...(returnCase?{caseId:returnCase}:{}),...(w.sourceId?{recordId:w.sourceId}:{})}).toString()}`;
 return <div className="min-w-0 space-y-8">
  <section className="min-w-0 space-y-3"><h2 className="text-lg font-semibold">根据调查写下的确认计划</h2>
   {!w.state.items.length&&<p className="text-sm leading-7 text-muted-foreground">这里还没有计划。先选一条自己保存的调查结果，再写下一次要怎样去确认。</p>}
   <div className="flex flex-wrap gap-2">{w.state.items.map(record=>w.dirty?<ConfirmButton key={record.id} disabled={w.blocked} variant="outline" confirmLabel="确认切换并舍弃未保存输入" className="h-auto max-w-full whitespace-normal break-words text-left" onClick={()=>void w.open(record.id)}>{record.plan.question}</ConfirmButton>:<Button key={record.id} disabled={w.blocked} variant="outline" className="h-auto max-w-full whitespace-normal break-words text-left" onClick={()=>void w.open(record.id)}>{record.plan.question}</Button>)}</div>
   <div className="flex flex-wrap gap-2"><Button disabled={w.blocked} variant="outline" onClick={()=>void w.refresh()}>重新读取列表与原调查</Button>{w.state.nextCursor&&<Button disabled={w.blocked} variant="outline" onClick={()=>void w.more('plans')}>更多计划</Button>}{w.dirty?<ConfirmButton disabled={w.blocked} variant="outline" confirmLabel="确认新建并清空未保存输入" onClick={()=>void w.newDraft()}>新建确认计划</ConfirmButton>:<Button disabled={w.blocked} variant="outline" onClick={()=>void w.newDraft()}>新建确认计划</Button>}</div>
  </section>
  {w.message&&<p role="status" className="whitespace-pre-wrap break-words rounded-lg border p-4 text-sm leading-7">{w.message}</p>}
  {w.pending&&<section className="space-y-3 rounded-lg border p-4 text-sm leading-7"><p>本次请求尚待核对，当前输入保持锁定。重试使用原来的内容和请求标识，不会另建一份计划。</p><div className="flex flex-wrap gap-2"><Button disabled={w.busy} onClick={()=>void w.execute(w.pending!)}>重试本次请求</Button><Button disabled={w.busy} variant="outline" onClick={()=>void w.comparePending()}>读取最新保存内容作比较</Button>{w.pending.operation==='save'&&w.pending.expectedRevision===0&&<Button disabled={w.busy} variant="outline" onClick={()=>void w.reconcilePending()}>核对本次请求的保存状态</Button>}{w.releasable&&<ConfirmButton disabled={w.busy} variant="outline" confirmLabel="确认结束请求并保留输入" onClick={w.releasePending}>结束本次请求并保留输入</ConfirmButton>}</div></section>}
  <div className="grid min-w-0 gap-8 lg:grid-cols-2">
   <section aria-label="原调查结果" className="min-w-0 space-y-4 rounded-lg border p-5"><h2 className="text-lg font-semibold">对照这次查到的结果</h2>
    <label className="block space-y-2 text-sm"><span>本人保存的调查结果</span><select name="source" disabled={w.blocked||!!w.active||!!props.resultId} className="min-h-11 w-full min-w-0 rounded-md border bg-background p-2" value={w.sourceId} onChange={event=>void w.chooseSource(event.target.value)}><option value="">请选择调查结果</option>{w.sourceId&&!w.sources.items.some(item=>item.id===w.sourceId)&&<option value={w.sourceId}>指定的本人调查结果</option>}{w.sources.items.filter(item=>!props.resultId||item.id===props.resultId).map(item=><option key={item.id} value={item.id}>{item.body.checkedOn} · 调查 {item.id.slice(0,8)}…{item.id.slice(-8)}</option>)}</select></label>
    {!w.active&&!props.resultId&&w.sources.nextCursor&&<Button disabled={w.blocked} variant="outline" onClick={()=>void w.more('sources')}>更多调查来源</Button>}
    {w.requestedSource!==null&&<div className="space-y-3 rounded-md border p-3 text-sm leading-7"><p>切换来源会重新核对调查结果，你独立填写的四项内容会保留。</p><ConfirmButton disabled={w.blocked} variant="outline" confirmLabel="确认切换调查来源并保留独立输入" onClick={()=>void w.chooseSource(w.requestedSource!,true)}>确认切换调查来源</ConfirmButton><Button disabled={w.blocked} variant="ghost" onClick={()=>w.setRequestedSource(null)}>保留当前来源</Button></div>}
    {w.source?<><p className="text-sm leading-7 text-muted-foreground">这是你保存的调查原文，只供对照。下一份计划不会自动填入这里的内容。</p><ResultBody body={w.source.body}/></>:<p className="text-sm leading-7 text-muted-foreground">{w.sourceId?'原调查结果目前不可读取，来源文字保持隐藏。已经保存的独立计划仍可编辑和删除。':'先选择一条自己保存的调查结果，再独立写下一份计划。'}</p>}
   </section>
   <section aria-label="独立确认计划" className="min-w-0 space-y-4 rounded-lg border p-5"><h2 className="text-lg font-semibold">亲手写下下一次要确认的事</h2>
    {w.active&&<p className="text-sm leading-7 text-muted-foreground">这份计划的调查来源已固定。你可以修改下面四项，也可以删除计划。删除会擦除结果中保留的计划正文，独立调查记录仍会保留。</p>}
    <form onSubmit={event=>{event.preventDefault();w.makePreview();}} className="space-y-5"><fieldset disabled={w.blocked} className="min-w-0 space-y-5"><PlanFields plan={w.draft} onChange={w.change}/>{w.draft.dueDate&&<p className="text-sm leading-7 text-muted-foreground">{w.draft.dueDate<props.today?'已过截止日期':'截止日期'}：{w.draft.dueDate}（东京日期）。日期只作提醒，计划不会自动完成。</p>}<div className="flex flex-wrap gap-2"><Button type="submit" disabled={!w.canSave}>先预览确认计划</Button>{w.active&&<ConfirmButton type="button" disabled={w.conflict} variant="outline" confirmLabel="确认删除这份独立计划" onClick={()=>w.submit('erase')}>删除这份计划</ConfirmButton>}</div></fieldset></form>
   </section>
  </div>
  {w.preview&&<section className="space-y-4 rounded-lg border p-5"><h2 className="text-lg font-semibold">保存前逐项核对</h2><p className="text-sm leading-7 text-muted-foreground">以下四项由你亲手填写，原调查结果只供对照。保存不会改写先前的计划或调查记录，也不代表想法已经成立。</p><PlanPreview plan={w.preview}/><div className="flex flex-wrap gap-2"><Button disabled={w.blocked||!w.canSave} onClick={()=>w.submit('save')}>确认保存这份计划</Button><Button disabled={w.blocked} variant="outline" onClick={()=>w.setPreview(null)}>返回修改</Button></div></section>}
  {w.remote&&<section className="space-y-4 rounded-lg border p-5"><h2 className="text-lg font-semibold">最新保存内容 · 第 {w.remote.revision} 版</h2><PlanPreview plan={w.remote.plan}/><ConfirmButton disabled={w.busy} variant="outline" confirmLabel={w.pending?'确认结束本次重试并替换为最新保存内容':'确认替换当前输入并采用最新保存内容'} onClick={w.adoptRemote}>采用最新保存内容</ConfirmButton></section>}
  {w.active&&!w.dirty&&!w.blocked&&!w.remote&&!w.conflict&&<Button asChild variant="outline"><Link href={`/business-lab/simulation/checks/results?caseId=${w.active.caseId}&planId=${w.active.id}&planRevision=${w.active.revision}`}>记录这版计划的核对结果</Link></Button>}
  {w.sourceId&&<p className="text-sm text-muted-foreground"><Link href={returnHref} className="underline">返回这条原调查结果</Link></p>}
 </div>;
}
