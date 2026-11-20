import Link from 'next/link';
import {Button} from '@/components/ui/button';
import type {ConfirmationNode,ConfirmationNodeKey} from '@/lib/domains/business-teardowns/history/domain';
import {PlanSnapshot,ResultBody,TimingNote} from '../simulation/checks/results/reality-results-views';

export function confirmationIdentity(node:ConfirmationNode|ConfirmationNodeKey):string{return `${node.kind}:${node.id}:${node.kind==='plan'?node.revision:1}`;}
export function confirmationKey(node:ConfirmationNode):ConfirmationNodeKey{return node.kind==='plan'?{kind:'plan',id:node.id,revision:node.revision}:{kind:'result',id:node.id};}
export function confirmationHref(node:ConfirmationNode):string{return `/business-lab/history?caseId=${node.caseId}&nodeKind=${node.kind}&nodeId=${node.id}${node.kind==='plan'?`&nodeRevision=${node.revision}`:''}`;}
function parentHref(node:ConfirmationNode):string{
 const parent=node.parent;
 if(parent.kind==='plan')return `/business-lab/history?caseId=${node.caseId}&nodeKind=plan&nodeId=${parent.id}&nodeRevision=${parent.revision}`;
 return `/business-lab/${parent.kind==='result'?'simulation/checks/results':'simulation'}?caseId=${node.caseId}&recordId=${parent.id}`;
}
const parentLabel={plan:'确认计划',result:'调查结果',simulation:'经营模拟'};
export function ConfirmationNodeView({node,visible,selected,busy,onOpen,planErased=false}:{node:ConfirmationNode;visible:boolean;selected:boolean;busy:boolean;onOpen:(key:ConfirmationNodeKey)=>void;planErased?:boolean}){
 return <article className="min-w-0 space-y-5 rounded-lg border p-5 sm:p-6" aria-label={`${node.kind==='plan'?'确认计划':'调查结果'} ${node.id} 第 ${node.revision} 版`} aria-current={selected?'true':undefined}>
  <header className="min-w-0 space-y-2"><h3 className="text-lg font-medium">{node.kind==='plan'?'本人保存的确认计划':'本人保存的调查结果'} · 第 {node.revision} 版</h3><p className="break-all text-xs leading-6 text-muted-foreground">记录标识：{node.id}<br/>服务器保存时间：<time dateTime={node.at}>{node.at}</time></p><div className="flex flex-wrap items-center gap-3 text-sm"><Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>onOpen(confirmationKey(node))}>打开这一条</Button><Link href={confirmationHref(node)} className="underline">在固定地址打开{node.kind==='plan'?'这一版':'这条结果'}</Link></div></header>
  <div className="space-y-2 border-l-2 pl-4 text-sm leading-7"><p>{parentLabel[node.parent.kind]}来源 · 第 {node.parent.revision} 版</p><p className="break-all text-xs text-muted-foreground">来源标识：{node.parent.id}</p>{node.parent.available&&!(node.parent.kind==='plan'&&planErased)?<Link href={parentHref(node)} className="underline">打开{parentLabel[node.parent.kind]}原记录</Link>:<p className="text-muted-foreground">原记录目前不可读取，仅保留来源标识与版本，不恢复来源文字。</p>}</div>
  {visible?<div className="min-w-0 space-y-5">{node.kind==='plan'?<PlanSnapshot plan={node.plan} revision={node.revision} savedAt={node.at} selected erased={false} caseUnavailable={false}/>:<><div className="grid min-w-0 gap-6 lg:grid-cols-2"><section className="min-w-0 space-y-4"><h4 className="font-medium">这次保存的原计划条件</h4><PlanSnapshot plan={planErased?null:node.planSnapshot} revision={node.parent.revision} savedAt={node.planSavedAt??undefined} selected erased={planErased||node.snapshotErasedAt!==null} caseUnavailable={false}/></section><section className="min-w-0 space-y-4"><h4 className="font-medium">独立调查正文</h4>{node.body&&<ResultBody body={node.body}/>}</section></div>{node.body&&node.planSavedAt&&<TimingNote checkedOn={node.body.checkedOn} savedAt={node.planSavedAt}/>}<section className="space-y-2 border-t pt-4 text-sm leading-7"><h4 className="font-medium">考えを変えた理由（本人填写）</h4><p className="whitespace-pre-wrap break-words">{node.body?.learned}</p><p className="text-muted-foreground">这里只显示本人写下的改变，不由前后记录推断原因或成立与否。</p></section><div className="flex flex-wrap gap-3 text-sm"><Link href={`/business-lab/simulation/checks/next?caseId=${node.caseId}&resultId=${node.id}`} className="underline">根据这条结果写下一份确认计划</Link><Link href={`/business-lab/methods?caseId=${node.caseId}&resultId=${node.id}`} className="underline">把这条调查整理为本人方法</Link></div></>}</div>:<p className="text-sm leading-7 text-muted-foreground">文字保持隐藏。重新读取后，再查看本人原文与现存来源。</p>}
 </article>;
}
