import Link from 'next/link';
import {notFound} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {PageContainer} from '@/components/ui/page-container';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {cashUuid} from '@/lib/domains/business-teardowns/cash/domain';
import {listBoundaries,listBoundarySources,getBoundary,getBoundarySource} from '@/lib/domains/business-teardowns/boundaries/transport';
import {BoundaryPanel} from './boundary-panel';
export const dynamic='force-dynamic';
export default async function BoundaryPage({searchParams}:{searchParams:{scenarioId?:string|string[];caseId?:string|string[];recordId?:string|string[]}}){
 if(!businessTeardownsEnabled())notFound();const {data:{user}}=await createClient().auth.getUser();if(!user)notFound();
 const parsed:Record<string,string>={};for(const key of ['scenarioId','caseId','recordId'] as const){if(searchParams[key]!==undefined){const v=cashUuid.safeParse(searchParams[key]);if(!v.success)notFound();parsed[key]=v.data;}}
 let content;try{const state=await listBoundaries(user.id,parsed.caseId?{caseId:parsed.caseId}:{});if(!state.available)content=<BoundaryPanel initialState={state} initialSources={{items:[],nextCursor:null}}/>;else{
 const record=parsed.recordId?await getBoundary(user.id,parsed.recordId):null;if(parsed.recordId&&!record)notFound();if(record&&parsed.caseId&&record.caseId!==parsed.caseId)notFound();if(record&&parsed.scenarioId&&record.definition.cashId!==parsed.scenarioId)notFound();
 const sourceId=record?.definition.cashId??parsed.scenarioId;const source=sourceId?await getBoundarySource(user.id,sourceId):null;if(parsed.scenarioId&&!source)notFound();if(source&&parsed.caseId&&source.scenario.caseId!==parsed.caseId)notFound();
 const sources=await listBoundarySources(user.id,parsed.caseId?{caseId:parsed.caseId}:{});if(source&&!sources.items.some(s=>s.id===source.id))sources.items.unshift(source);
 content=<BoundaryPanel key={record?.id??source?.id??parsed.caseId??'new'} initialState={state} initialSources={sources} initialRecord={record} initialSource={source} caseId={parsed.caseId}/>;
 }}catch(error){if(error instanceof Error&&error.message==='NEXT_NOT_FOUND')throw error;content=<p role="alert" className="rounded-lg border p-5 text-sm leading-7">现金边界暂时没有读到。请刷新重试；已保存的范围仍在。</p>;}
 return <PageContainer width="default"><div className="space-y-8"><header className="space-y-3"><Link href="/business-lab/cash" className="text-sm text-muted-foreground underline">返回假设现金时间表</Link><h1 className="text-2xl font-semibold">判断会在哪个输入处改变</h1><p className="text-sm leading-7 text-muted-foreground">只改变你选的一项假设，查看日终现金何时低于零。不是实际成本估计，也不判断生意能否成立。</p></header>{content}</div></PageContainer>;
}
