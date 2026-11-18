import {workspaceStart} from '@/lib/domains/business-teardowns/workspace/domain';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {PageContainer} from '@/components/ui/page-container';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {getPractice,listPractices,listPracticeCases,loadPracticeContext,listPracticeApprenticeships,loadPracticeApprenticeship} from '@/lib/domains/business-teardowns/practice/transport';
import {parsePracticeStart} from '@/lib/domains/business-teardowns/practice/domain';
import {BusinessPracticePanel} from './practice-panel';
export const dynamic='force-dynamic';
export default async function BusinessPracticePage({searchParams}:{searchParams:{recordId?:string|string[];caseId?:string|string[];apprenticeshipId?:string|string[]}}){
 if(!businessTeardownsEnabled())notFound();const {data:{user}}=await createClient().auth.getUser();if(!user)notFound();let content;
 try{const deep=workspaceStart(searchParams);const initialRecord=deep.recordId?await getPractice(user.id,deep.recordId):null;if(deep.recordId&&(!initialRecord||(deep.caseId&&initialRecord.plan.caseId!==deep.caseId)))throw new Error('链接中的记录不可读取');const state=await listPractices(user.id);if(!state.available)content=<BusinessPracticePanel key={initialRecord?.id??'new'} initialRecord={initialRecord} initialState={state} initialCases={{items:[],nextCursor:null}}/>;
 else{const cases=await listPracticeCases(user.id);const start=parsePracticeStart(searchParams);const context=start.caseId?await loadPracticeContext(user.id,start.caseId):null;const apprenticeships=context?await listPracticeApprenticeships(user.id,{caseId:context.caseId}):{items:[],nextCursor:null};if(context&&start.apprenticeshipId&&!apprenticeships.items.some(a=>a.id===start.apprenticeshipId)){const selected=await loadPracticeApprenticeship(user.id,{caseId:context.caseId,id:start.apprenticeshipId});if(selected)apprenticeships.items.unshift(selected);}if(context&&!cases.items.some(c=>c.id===context.caseId))cases.items.unshift({id:context.caseId,title:context.caseTitle,date:''});content=<BusinessPracticePanel key={initialRecord?.id??'new'} initialRecord={initialRecord} initialState={state} initialCases={cases} initialContext={context} initialApprenticeships={apprenticeships} initialApprenticeshipId={start.apprenticeshipId}/>;}}
 catch{content=<p role="alert" className="rounded-lg border p-5 text-sm leading-7">{searchParams.recordId!==undefined?'链接中的记录不存在、已删除或不可读取。请返回案例重新选择。':'制作练习暂时没有读到。请刷新后重试；保存过的内容仍在。'}</p>;}
 return <PageContainer width="default"><header className="mb-8 space-y-3"><Link href="/business-lab" className="text-sm text-muted-foreground underline">返回每日一门生意</Link><h1 className="text-2xl font-semibold">亲手做一件东西</h1><p className="text-sm leading-7 text-muted-foreground">从生意案例里挑一个环节，写清要做什么、怎样检查，再把做完后的卡点留下来。</p></header>{content}</PageContainer>;
}
