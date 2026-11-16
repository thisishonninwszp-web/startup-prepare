import Link from 'next/link';
import {notFound} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {PageContainer} from '@/components/ui/page-container';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {listPressures,listPressureCases,loadPressureContext} from '@/lib/domains/business-teardowns/pressure/transport';
import {pressureUuid} from '@/lib/domains/business-teardowns/pressure/domain';
import {BusinessPressurePanel} from './pressure-panel';
export const dynamic='force-dynamic';
export default async function BusinessPressurePage({searchParams}:{searchParams:{caseId?:string|string[]}}){
 if(!businessTeardownsEnabled())notFound();const {data:{user}}=await createClient().auth.getUser();if(!user)notFound();let content;
 try{const state=await listPressures(user.id);const cases=state.available?await listPressureCases(user.id):{items:[],nextCursor:null};const start=pressureUuid.safeParse(searchParams.caseId);const context=state.available&&start.success?await loadPressureContext(user.id,start.data):null;if(context&&!cases.items.some(c=>c.id===context.caseId))cases.items.unshift({id:context.caseId,title:context.caseTitle,date:''});content=<BusinessPressurePanel initialState={state} initialCases={cases} initialContext={context}/>;}
 catch{content=<p role="alert" className="rounded-lg border p-5 text-sm leading-7">条件变化练习暂时没有读到。请刷新后重试，保存过的回答仍在。</p>;}
 return <PageContainer width="default"><header className="mb-8 space-y-3"><Link href="/business-lab" className="text-sm text-muted-foreground underline">返回每日一门生意</Link><h1 className="text-2xl font-semibold">条件变了，你先改哪一步</h1><p className="text-sm leading-7 text-muted-foreground">用一个明确的假设练习经营取舍。这里的情境不代表商家真的遇到过这些事。</p></header>{content}</PageContainer>;
}
