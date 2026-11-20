import Link from 'next/link';
import {notFound} from 'next/navigation';
import {PageContainer} from '@/components/ui/page-container';
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {resultMethodUuid} from '@/lib/domains/business-teardowns/result-methods/domain';
import {listResultMethods,getResultMethod,getResultMethodSource} from '@/lib/domains/business-teardowns/result-methods/transport';
import {listRealityResults} from '@/lib/domains/business-teardowns/reality-results/transport';
import {ResultMethodsPanel} from './result-methods-panel';


export const dynamic='force-dynamic';
type Search=Record<string,string|string[]|undefined>;
export default async function ResultMethodsPage({searchParams}:{searchParams:Search}){
 if(!businessTeardownsEnabled())notFound();
 const {data:{user}}=await createClient().auth.getUser();
 if(!user)notFound();
 if(Object.keys(searchParams).some(name=>!['caseId','resultId','recordId'].includes(name)))notFound();
 const ids:Partial<Record<'caseId'|'resultId'|'recordId',string>>={};
 for(const name of ['caseId','resultId','recordId'] as const){
  if(searchParams[name]===undefined)continue;
  const parsed=resultMethodUuid.safeParse(searchParams[name]);
  if(!parsed.success)notFound();
  ids[name]=parsed.data;
 }
 const state=await listResultMethods(user.id,{...(ids.caseId?{caseId:ids.caseId}:{}),...(ids.resultId?{resultId:ids.resultId}:{})});

 let panel;
 if(!state.available){
  panel=<ResultMethodsPanel initialState={state} initialSources={{available:false,items:[],nextCursor:null}} caseId={ids.caseId} resultId={ids.resultId}/>;
 }else{
  const record=ids.recordId?await getResultMethod(user.id,ids.recordId):null;
  if(ids.recordId&&(!record||record.id!==ids.recordId))notFound();
  if(record&&((ids.caseId&&record.caseId!==ids.caseId)||(ids.resultId&&record.resultId!==ids.resultId)))notFound();
  const selected=record?.resultId??ids.resultId;
  const source=selected?await getResultMethodSource(user.id,selected):null;
  if(source&&(source.id!==selected||(ids.caseId&&source.caseId!==ids.caseId)||(record&&source.caseId!==record.caseId)))notFound();
  const sources=await listRealityResults(user.id,ids.caseId?{caseId:ids.caseId}:{});
  panel=<ResultMethodsPanel key={record?`saved:${record.id}`:`new:${ids.caseId??''}:${ids.resultId??''}`} initialState={state} initialSources={sources} initialRecord={record} initialSource={source} caseId={ids.caseId} resultId={ids.resultId}/>;
 }
 return <PageContainer width="default"><div className="min-w-0 space-y-8"><header className="space-y-3"><Link href="/business-lab/simulation/checks/results" className="text-sm text-muted-foreground underline">返回调查结果</Link><h1 className="text-2xl font-semibold">根据调查，写下自己的方法</h1><p className="text-sm leading-7 text-muted-foreground">对照自己保存的调查结果，写清这份方法在什么场景、依赖什么条件、何时会失效，还有什么没弄清。五项内容都由你亲手填写。</p></header>{panel}</div></PageContainer>;
}
