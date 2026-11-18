import Link from 'next/link';
import {notFound} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {PageContainer} from '@/components/ui/page-container';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {listSimulations,getSimulation,listSimulationCases,loadSimulationContext} from '@/lib/domains/business-teardowns/simulation/transport';
import {simulationUuid} from '@/lib/domains/business-teardowns/simulation/domain';
import {SimulationPanel} from './simulation-panel';
export const dynamic='force-dynamic';
export default async function BusinessSimulationPage({searchParams}:{searchParams:{caseId?:string|string[];recordId?:string|string[]}}){
 if(!businessTeardownsEnabled())notFound();const {data:{user}}=await createClient().auth.getUser();if(!user)notFound();let content;
 try{const start=simulationUuid.safeParse(searchParams.caseId),recordId=simulationUuid.safeParse(searchParams.recordId);const state=await listSimulations(user.id,start.success?{caseId:start.data}:{});const cases=state.available?await listSimulationCases(user.id):{items:[],nextCursor:null};const context=state.available&&start.success?await loadSimulationContext(user.id,start.data):null;const candidate=state.available&&recordId.success?await getSimulation(user.id,recordId.data):null;const record=candidate&&(!start.success||candidate.setup.caseId===start.data)?candidate:null;if(context&&!cases.items.some(c=>c.id===context.caseId))cases.items.unshift({id:context.caseId,title:context.caseTitle,date:''});content=<SimulationPanel key={(start.success?start.data:"all")+":"+(recordId.success?recordId.data:"new")} initialState={state} initialCases={cases} initialContext={context} initialRecord={record} initialMissing={searchParams.recordId!==undefined&&!record} listCaseId={start.success?start.data:undefined}/>;}
 catch{content=<p role="alert" className="rounded-lg border p-5 text-sm leading-7">经营模拟暂时没有读到。请刷新后重试，已保存的选择仍在。</p>;}
 return <PageContainer width="default"><header className="mb-8 space-y-3"><Link href="/business-lab" className="text-sm text-muted-foreground underline">返回每日一门生意</Link><h1 className="text-2xl font-semibold">连续经营六回合</h1><p className="text-sm leading-7 text-muted-foreground">把你自己的假设连续带过六天，看现金、库存和交付承诺怎样一起变化。不使用 AI；这里不代表商家的实际经营，也不证明真实需求或经营能力。</p></header>{content}</PageContainer>;
}
