import {workspaceStart} from '@/lib/domains/business-teardowns/workspace/domain';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {PageContainer} from '@/components/ui/page-container';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {getCash,listCash,listCashCases,loadCashContext} from '@/lib/domains/business-teardowns/cash/transport';
import {cashUuid} from '@/lib/domains/business-teardowns/cash/domain';
import {CashPanel} from './cash-panel';
export const dynamic='force-dynamic';
export default async function CashPage({searchParams}:{searchParams:{recordId?:string|string[];caseId?:string|string[]}}){
 if(!businessTeardownsEnabled())notFound();const {data:{user}}=await createClient().auth.getUser();if(!user)notFound();let content;
 try{const deep=workspaceStart(searchParams);const initialRecord=deep.recordId?await getCash(user.id,deep.recordId):null;if(deep.recordId&&(!initialRecord||(deep.caseId&&initialRecord.scenario.caseId!==deep.caseId)))throw new Error('链接中的记录不可读取');const state=await listCash(user.id);if(!state.available)content=<CashPanel key={initialRecord?.id??deep.caseId??'new'} initialRecord={initialRecord} initialState={state} initialCases={{items:[],nextCursor:null}}/>;else{const cases=await listCashCases(user.id),parsed=cashUuid.safeParse(searchParams.caseId);const context=parsed.success?await loadCashContext(user.id,parsed.data):null;if(context&&!cases.items.some(c=>c.id===context.caseId))cases.items.unshift({id:context.caseId,title:context.caseTitle,date:''});content=<CashPanel key={initialRecord?.id??deep.caseId??'new'} initialRecord={initialRecord} initialState={state} initialCases={cases} initialContext={context}/>;}}
 catch{content=<p role="alert" className="rounded-lg border p-5 text-sm leading-7">{searchParams.recordId!==undefined?'链接中的记录不存在、已删除或不可读取。请返回案例重新选择。':'假设现金时间表暂时没有读到。请刷新重试；已保存的本人假设仍在。'}</p>;}
 return <PageContainer width="default"><div className="min-w-0 space-y-8"><header className="space-y-3"><Link href="/business-lab" className="text-sm text-muted-foreground underline">返回每日一门生意</Link><h1 className="text-2xl font-semibold">假设现金时间表</h1><p className="text-sm leading-7 text-muted-foreground">把自己假设的收付日期摊开，比较钱何时进出。金额与日期均为本人假设，计算只反映这些输入。</p></header>{content}</div></PageContainer>;
}
