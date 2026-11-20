import Link from 'next/link';
import {notFound} from 'next/navigation';
import {PageContainer} from '@/components/ui/page-container';
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {confirmationUuid,type ConfirmationNodeKey} from '@/lib/domains/business-teardowns/history/domain';
import {listConfirmationHistory,getConfirmationNode} from '@/lib/domains/business-teardowns/history/transport';
import {ConfirmationHistoryPanel} from './confirmation-history-panel';

export const dynamic='force-dynamic';
type Search=Record<string,string|string[]|undefined>;
export default async function ConfirmationHistoryPage({searchParams}:{searchParams:Search}){
 if(!businessTeardownsEnabled())notFound();
 const {data:{user}}=await createClient().auth.getUser();
 if(!user)notFound();
 if(Object.keys(searchParams).some(key=>!['caseId','nodeKind','nodeId','nodeRevision'].includes(key)))notFound();
 let caseId:string|undefined;
 if(searchParams.caseId!==undefined){const parsed=confirmationUuid.safeParse(searchParams.caseId);if(!parsed.success)notFound();caseId=parsed.data;}
 let key:ConfirmationNodeKey|undefined;
 if(['nodeKind','nodeId','nodeRevision'].some(name=>searchParams[name]!==undefined)){
  const id=confirmationUuid.safeParse(searchParams.nodeId);
  if(!id.success)notFound();
  if(searchParams.nodeKind==='plan'){
   const raw=searchParams.nodeRevision;
   if(typeof raw!=='string'||!/^([1-9]\d*)$/.test(raw))notFound();
   const revision=Number(raw);
   if(!Number.isSafeInteger(revision)||revision>2147483647)notFound();
   key={kind:'plan',id:id.data,revision};
  }else if(searchParams.nodeKind==='result'&&searchParams.nodeRevision===undefined){key={kind:'result',id:id.data};}
  else notFound();
 }
 const state=await listConfirmationHistory(user.id,caseId?{caseId}:{});
 const node=state.available&&key?await getConfirmationNode(user.id,key):null;
 if(state.available&&key&&(!node||node.kind!==key.kind||node.id!==key.id||(key.kind==='plan'&&node.revision!==key.revision)||(caseId&&node.caseId!==caseId)))notFound();
 return <PageContainer width="default"><div className="min-w-0 space-y-8"><header className="space-y-3"><Link href={caseId?`/business-lab/workspace?caseId=${caseId}`:'/business-lab/workspace'} className="text-sm text-muted-foreground underline">返回研究工作台</Link><h1 className="text-2xl font-semibold">确认履历</h1><p className="text-sm leading-7 text-muted-foreground">把本人保存的确认计划版本与实际调查记录放在一起，回看当时写下的条件。保存时间与本人填写的调查日期各自保留，不据此推断因果或结论。</p></header><ConfirmationHistoryPanel key={`${caseId??'all'}:${key?`${key.kind}:${key.id}:${key.kind==='plan'?key.revision:1}`:'list'}`} initialState={state} initialNode={node} caseId={caseId}/></div></PageContainer>;
}
