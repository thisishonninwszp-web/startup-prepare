import Link from 'next/link';
import {notFound} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {PageContainer} from '@/components/ui/page-container';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {listPractices,listPracticeCases,loadPracticeContext,listPracticeApprenticeships,loadPracticeApprenticeship} from '@/lib/domains/business-teardowns/practice/transport';
import {parsePracticeStart} from '@/lib/domains/business-teardowns/practice/domain';
import {BusinessPracticePanel} from './practice-panel';
export const dynamic='force-dynamic';
export default async function BusinessPracticePage({searchParams}:{searchParams:{caseId?:string|string[];apprenticeshipId?:string|string[]}}){
 if(!businessTeardownsEnabled())notFound();const {data:{user}}=await createClient().auth.getUser();if(!user)notFound();let content;
 try{const state=await listPractices(user.id);if(!state.available)content=<BusinessPracticePanel initialState={state} initialCases={{items:[],nextCursor:null}}/>;
 else{const cases=await listPracticeCases(user.id);const start=parsePracticeStart(searchParams);const context=start.caseId?await loadPracticeContext(user.id,start.caseId):null;const apprenticeships=context?await listPracticeApprenticeships(user.id,{caseId:context.caseId}):{items:[],nextCursor:null};if(context&&start.apprenticeshipId&&!apprenticeships.items.some(a=>a.id===start.apprenticeshipId)){const selected=await loadPracticeApprenticeship(user.id,{caseId:context.caseId,id:start.apprenticeshipId});if(selected)apprenticeships.items.unshift(selected);}if(context&&!cases.items.some(c=>c.id===context.caseId))cases.items.unshift({id:context.caseId,title:context.caseTitle,date:''});content=<BusinessPracticePanel initialState={state} initialCases={cases} initialContext={context} initialApprenticeships={apprenticeships} initialApprenticeshipId={start.apprenticeshipId}/>;}}
 catch{content=<p role="alert" className="rounded-lg border p-5 text-sm leading-7">制作练习暂时没有读到。请刷新后重试；保存过的内容仍在。</p>;}
 return <PageContainer width="default"><header className="mb-8 space-y-3"><Link href="/business-lab" className="text-sm text-muted-foreground underline">返回每日一门生意</Link><h1 className="text-2xl font-semibold">亲手做一件东西</h1><p className="text-sm leading-7 text-muted-foreground">从生意案例里挑一个环节，写清要做什么、怎样检查，再把做完后的卡点留下来。</p></header>{content}</PageContainer>;
}
