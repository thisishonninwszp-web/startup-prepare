import Link from 'next/link';
import {notFound} from 'next/navigation';
import {PageContainer} from '@/components/ui/page-container';
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {cashUuid} from '@/lib/domains/business-teardowns/cash/domain';
import {explanationAnchorSchema,type ExplanationAnchor} from '@/lib/domains/business-teardowns/explanations/domain';
import {listExplanationPlans,getExplanationPlan,getExplanationSource} from '@/lib/domains/business-teardowns/explanations/transport';
import {ExplanationPlansPanel} from './explanation-plans-panel';
export const dynamic='force-dynamic';
export default async function ExplanationPlansPage({searchParams}:{searchParams:Record<string,string|string[]|undefined>}){
 if(!businessTeardownsEnabled())notFound();const {data:{user}}=await createClient().auth.getUser();if(!user)notFound();
 const q=searchParams,keys=Object.keys(q),allowed=['caseId','recordId','revision','kind','reportId','reportRevision','section','index','manifestHash','lessonId','lessonRevision'];
 if(keys.some(k=>!allowed.includes(k)||typeof q[k]!=='string'))notFound();
 const parseId=(name:string)=>{if(q[name]===undefined)return undefined;const p=cashUuid.safeParse(q[name]);if(!p.success)notFound();return p.data;};
 const caseId=parseId('caseId'),recordId=parseId('recordId');
 const integer=(name:string)=>{const value=q[name];if(typeof value!=='string'||!(/^(0|[1-9][0-9]*)$/).test(value)||!Number.isSafeInteger(Number(value)))notFound();return Number(value);};
 let revision:number|undefined,anchor:ExplanationAnchor|undefined;
 if(q.revision!==undefined){if(!recordId)notFound();revision=integer('revision');if(revision<1||revision>2147483647)notFound();}
 if(recordId&&keys.some(k=>!['recordId','revision','caseId'].includes(k)))notFound();
 if(q.kind!==undefined){
  const candidate=Object.fromEntries(keys.filter(k=>k!=='caseId').map(k=>[k,['index','reportRevision','lessonRevision'].includes(k)?integer(k):q[k]]));
  const parsed=explanationAnchorSchema.safeParse(candidate);if(!parsed.success)notFound();anchor=parsed.data;
 }else if(!recordId&&keys.some(k=>k!=='caseId'))notFound();
 const state=await listExplanationPlans(user.id,caseId?{caseId}:{});
 const record=state.available&&recordId?await getExplanationPlan(user.id,recordId,revision):null;
 if(state.available&&recordId&&(!record||record.id!==recordId||(revision!==undefined&&record.revision!==revision)||(caseId&&record.caseId!==caseId)))notFound();
 const source=state.available&&anchor?await getExplanationSource(user.id,anchor):record?.source??null;
 if(source&&caseId&&source.caseId!==caseId)notFound();
 return <PageContainer width="default"><div className="min-w-0 space-y-8"><header className="space-y-3"><Link href="/business-lab" className="text-sm text-muted-foreground underline">返回每日一门生意</Link><h1 className="text-2xl font-semibold">同一个观察，哪种解释站得住？</h1><p className="text-sm leading-7 text-muted-foreground">先把不同解释会带来的观察写下来，再去核对。两种解释都可能不成立；现在的材料也可能无法区分。</p></header><ExplanationPlansPanel key={record?`${record.id}:${revision??'current'}`:JSON.stringify(anchor??{})} initialState={state} initialRecord={record} initialSource={source} anchor={anchor} caseId={caseId} exactRevision={revision}/></div></PageContainer>;
}
