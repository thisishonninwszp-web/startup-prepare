import {workspaceStart} from '@/lib/domains/business-teardowns/workspace/domain';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {PageContainer} from '@/components/ui/page-container';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {counterexampleUuid,methodKindSchema} from '@/lib/domains/business-teardowns/counterexamples/domain';
import {getCounterexample,listCounterexamples,listCounterexampleMethods,listCounterexampleCases,loadCounterexampleMethod,loadCounterexampleMethodStart,loadCounterexampleCase} from '@/lib/domains/business-teardowns/counterexamples/transport';
import {BusinessCounterexamplesPanel} from './counterexamples-panel';
export const dynamic='force-dynamic';
export default async function BusinessCounterexamplesPage({searchParams}:{searchParams:{recordId?:string|string[];methodId?:string|string[];methodKind?:string|string[];caseId?:string|string[]}}){
 if(!businessTeardownsEnabled())notFound();const {data:{user}}=await createClient().auth.getUser();if(!user)notFound();let content;
 try{const deep=workspaceStart(searchParams);const initialRecord=deep.recordId?await getCounterexample(user.id,deep.recordId):null;if(deep.recordId&&(!initialRecord||(deep.caseId&&initialRecord.study.candidateCaseId!==deep.caseId)))throw new Error('链接中的记录不可读取');const state=await listCounterexamples(user.id);if(!state.available)content=<BusinessCounterexamplesPanel key={initialRecord?.id??'new'} initialRecord={initialRecord} initialState={state} initialMethods={{items:[],nextCursor:null}} initialCases={{items:[],nextCursor:null}}/>;
 else{const methods=await listCounterexampleMethods(user.id),cases=await listCounterexampleCases(user.id);const methodId=counterexampleUuid.safeParse(searchParams.methodId),caseId=counterexampleUuid.safeParse(searchParams.caseId),kind=methodKindSchema.safeParse(searchParams.methodKind);
 const method=methodId.success?(kind.success?await loadCounterexampleMethod(user.id,{id:methodId.data,kind:kind.data}):searchParams.methodKind===undefined?await loadCounterexampleMethodStart(user.id,methodId.data):null):null;
 const candidate=caseId.success?await loadCounterexampleCase(user.id,caseId.data):null;
 const notice=[searchParams.methodId&&!method?'链接中的方法已改变、清除或不可读取，请重新选择。':'',searchParams.caseId&&!candidate?'链接中的案例暂不可读取，请重新选择。':''].filter(Boolean).join(' ');
 content=<BusinessCounterexamplesPanel key={initialRecord?.id??'new'} initialRecord={initialRecord} initialState={state} initialMethods={methods} initialCases={cases} initialMethod={method} initialCase={candidate} startNotice={notice}/>;}}
 catch{content=<p role="alert" className="rounded-lg border p-5 text-sm leading-7">{searchParams.recordId!==undefined?'链接中的记录不存在、已删除或不可读取。请返回案例重新选择。':'反例研究暂时没有读到。请刷新后重试，保存过的独立比较仍在。'}</p>;}
 return <PageContainer width="default"><header className="mb-8 space-y-3"><Link href="/business-lab" className="text-sm text-muted-foreground underline">返回每日一门生意</Link><h1 className="text-2xl font-semibold">给本人方法找反例</h1><p className="text-sm leading-7 text-muted-foreground">找一门看起来不合原方法的生意。先检查是不是同样的任务、付款者与资源条件，再决定怎样改写。</p></header>{content}</PageContainer>;
}
