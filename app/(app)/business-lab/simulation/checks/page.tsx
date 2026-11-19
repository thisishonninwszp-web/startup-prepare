import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {PageContainer} from '@/components/ui/page-container';
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {realityCheckUuid} from '@/lib/domains/business-teardowns/reality-checks/domain';
import {listRealityChecks,getRealityCheck,listRealityCheckSources,getRealityCheckSource} from '@/lib/domains/business-teardowns/reality-checks/transport';
import {RealityChecksPanel} from './reality-checks-panel';
import {getFollowupCheck} from '@/lib/domains/business-teardowns/followup-checks/transport';

export const dynamic='force-dynamic';
type Search={caseId?:string|string[];simulationId?:string|string[];recordId?:string|string[];round?:string|string[]};
export default async function RealityChecksPage({searchParams}:{searchParams:Search}){
 if(!businessTeardownsEnabled())notFound();
 const {data:{user}}=await createClient().auth.getUser();
 if(!user)notFound();
 const parsed:Partial<Record<'caseId'|'simulationId'|'recordId',string>>={};
 for(const name of ['caseId','simulationId','recordId'] as const){
  if(searchParams[name]===undefined)continue;
  const value=realityCheckUuid.safeParse(searchParams[name]);
  if(!value.success)notFound();
  parsed[name]=value.data;
 }
 let round:number|undefined;
 if(searchParams.round!==undefined){if(typeof searchParams.round!=='string'||!/^([1-6])$/.test(searchParams.round))notFound();round=Number(searchParams.round);}
 if(round&&!parsed.simulationId&&!parsed.recordId)notFound();
 if(parsed.recordId){
  let followup;
  try{followup=await getFollowupCheck(user.id,parsed.recordId);}
  catch(error){if(!['42P01','42883','PGRST202','PGRST205'].includes((error as {code?:string}).code??''))throw error;}
  if(followup){
   if(followup.id!==parsed.recordId||(parsed.caseId&&followup.caseId!==parsed.caseId)||parsed.simulationId||round)notFound();
   redirect(`/business-lab/simulation/checks/next?caseId=${followup.caseId}&recordId=${followup.id}`);
  }
 }
 const dateParts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const part=(type:string)=>dateParts.find(p=>p.type===type)!.value;
 const today=`${part('year')}-${part('month')}-${part('day')}`;
 const state=await listRealityChecks(user.id,{...(parsed.caseId?{caseId:parsed.caseId}:{}),...(parsed.simulationId?{simulationId:parsed.simulationId}:{})});
 let panel;
 if(!state.available){panel=<RealityChecksPanel initialState={state} initialSources={{items:[],nextCursor:null}} today={today}/>;}
 else{
  const record=parsed.recordId?await getRealityCheck(user.id,parsed.recordId):null;
  if(parsed.recordId&&!record)notFound();
  if(record&&((parsed.caseId&&record.caseId!==parsed.caseId)||(parsed.simulationId&&record.simulationId!==parsed.simulationId)||(round&&record.round!==round)))notFound();
  const sourceId=record?.simulationId??parsed.simulationId;
  const source=sourceId?await getRealityCheckSource(user.id,sourceId):null;
  if(!record&&parsed.simulationId&&!source)notFound();
  if(source&&((parsed.caseId&&source.caseId!==parsed.caseId)||(record&&source.caseId!==record.caseId)))notFound();
  if(!record&&round&&source&&round>source.turns.length)notFound();
  const sources=await listRealityCheckSources(user.id,parsed.caseId?{caseId:parsed.caseId}:{});
  panel=<RealityChecksPanel key={record?`saved:${record.id}`:`new:${parsed.caseId??source?.caseId??''}:${source?.id??''}:${round??1}`} initialState={state} initialSources={sources} initialRecord={record} initialSource={source} initialRound={round} caseId={parsed.caseId} simulationId={parsed.simulationId} today={today}/>;
 }
 return <PageContainer width="default"><div className="min-w-0 space-y-8"><header className="space-y-3"><Link href="/business-lab/simulation" className="text-sm text-muted-foreground underline">返回假设经营演练</Link><h1 className="text-2xl font-semibold">把假设带到现实中确认</h1><p className="text-sm leading-7 text-muted-foreground">从自己保存的一轮演练出发，亲手写下问题、反例、做法和截止日期。保存的是待做的计划，问题仍未得到回答。</p></header>{panel}</div></PageContainer>;
}
