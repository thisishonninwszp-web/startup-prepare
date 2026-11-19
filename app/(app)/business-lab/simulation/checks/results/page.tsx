import Link from 'next/link';
import {notFound} from 'next/navigation';
import {PageContainer} from '@/components/ui/page-container';
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {realityResultUuid} from '@/lib/domains/business-teardowns/reality-results/domain';
import {listRealityResults,getRealityResult,listRealityResultPlans,listRealityResultVersions,getRealityResultVersion} from '@/lib/domains/business-teardowns/reality-results/transport';
import {RealityResultsPanel} from './reality-results-panel';
import {tokyoDay} from './reality-results-views';

export const dynamic='force-dynamic';
type Search={caseId?:string|string[];planId?:string|string[];recordId?:string|string[];planRevision?:string|string[]};
export default async function RealityResultsPage({searchParams}:{searchParams:Search}){
 if(!businessTeardownsEnabled())notFound();
 const {data:{user}}=await createClient().auth.getUser();
 if(!user)notFound();
 const ids:Partial<Record<'caseId'|'planId'|'recordId',string>>={};
 for(const name of ['caseId','planId','recordId'] as const){
  if(searchParams[name]===undefined)continue;
  const parsed=realityResultUuid.safeParse(searchParams[name]);if(!parsed.success)notFound();ids[name]=parsed.data;
 }
 let revision:number|undefined;
 if(searchParams.planRevision!==undefined){const raw=searchParams.planRevision;if(typeof raw!=='string'||!/^([1-9]\d*)$/.test(raw))notFound();revision=Number(raw);if(!Number.isSafeInteger(revision)||revision>2147483647||(!ids.planId&&!ids.recordId))notFound();}
 const state=await listRealityResults(user.id,{...(ids.caseId?{caseId:ids.caseId}:{}),...(ids.planId?{planId:ids.planId}:{})});
 const today=tokyoDay(new Date());
 let panel;
 if(!state.available){panel=<RealityResultsPanel initialState={state} initialPlans={{items:[],nextCursor:null}} initialVersions={{items:[],nextCursor:null}} today={today}/>;}
 else{
  const record=ids.recordId?await getRealityResult(user.id,ids.recordId):null;
  if(ids.recordId&&(!record||record.id!==ids.recordId))notFound();
  if(record&&((ids.caseId&&record.caseId!==ids.caseId)||(ids.planId&&record.planId!==ids.planId)||(revision&&record.planRevision!==revision)))notFound();
  const selectedPlan=record?.planId??ids.planId,selectedRevision=record?.planRevision??revision;
  const source=selectedPlan?await getRealityResultVersion(user.id,{planId:selectedPlan,...(selectedRevision?{revision:selectedRevision}:{})}):null;
  if(!record&&selectedPlan&&!source)notFound();
  if(source&&(source.planId!==selectedPlan||(selectedRevision&&source.revision!==selectedRevision)||(ids.caseId&&source.caseId!==ids.caseId)||(record&&source.caseId!==record.caseId)))notFound();
  const plans=await listRealityResultPlans(user.id,ids.caseId?{caseId:ids.caseId}:{});
  const versions=selectedPlan&&source?await listRealityResultVersions(user.id,{planId:selectedPlan}):{items:[],nextCursor:null};
  panel=<RealityResultsPanel key={record?`saved:${record.id}`:`new:${ids.caseId??source?.caseId??''}:${selectedPlan??''}:${source?.revision??''}`} initialState={state} initialPlans={plans} initialVersions={versions} initialRecord={record} initialSource={source} caseId={ids.caseId} planId={ids.planId} initialPlanRevision={selectedRevision} today={today}/>;
 }
 return <PageContainer width="default"><div className="min-w-0 space-y-8"><header className="space-y-3"><Link href="/business-lab/simulation/checks" className="text-sm text-muted-foreground underline">返回确认计划</Link><h1 className="text-2xl font-semibold">原来的条件，查到的结果</h1><p className="text-sm leading-7 text-muted-foreground">保留当时写下的条件，独立记录实际查了什么、出处和想法怎样改变。这里只保存你的对照记录，不自动判断是否成立。</p></header>{panel}</div></PageContainer>;
}
