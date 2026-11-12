import Link from 'next/link';
import {notFound} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {PageContainer} from '@/components/ui/page-container';
import {Button} from '@/components/ui/button';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {listResearch,listResearchCases,listResearchExperiences} from '@/lib/domains/business-teardowns/research/queries';
import {loadCaseDetail} from '@/lib/domains/business-teardowns/queries';
import {BusinessResearchPanel} from './research-panel';
import {researchStartOptions} from '@/lib/domains/business-teardowns/research/start-parameters';

export const dynamic='force-dynamic';
export default async function BusinessResearchPage({searchParams}:{searchParams:{caseId?:string|string[];kind?:string|string[]}}){
 if(!businessTeardownsEnabled())notFound();
 const {data:{user}}=await createClient().auth.getUser();if(!user)notFound();
 let content;
 try{
  const state=await listResearch(user.id,{});
  if(!state.available)content=<p role="status" className="rounded-lg border p-5 text-sm leading-7">四项研究还未就绪。请先完成 124 数据库迁移，再回来整理材料。已有每日报告可以照常阅读。</p>;
  else{
   const [cases,experiences]=await Promise.all([listResearchCases(user.id,{}),listResearchExperiences(user.id)]);
   let initialCaseId:string|undefined;
   const start=researchStartOptions(searchParams);
   if(start.caseId){
    const detail=await loadCaseDetail(user.id,start.caseId);
    if(detail){initialCaseId=detail.dailyCase.id;if(!cases.items.some(c=>c.id===initialCaseId))cases.items.unshift({id:detail.dailyCase.id,name:detail.merchant.name,date:detail.dailyCase.localDate});}
   }
   content=<BusinessResearchPanel initialState={state} initialCases={cases} experiences={experiences} initialCaseId={initialCaseId} initialKind={start.kind}/>;
  }
 }catch{content=<p role="alert" className="rounded-lg border p-5 text-sm leading-7">研究暂时没有读取成功。请刷新后重试；保存过的内容不会因此被替换。</p>;}
 return <PageContainer width="wide"><header className="mb-8 space-y-3"><Link href="/business-lab" className="text-sm text-muted-foreground underline">返回每日一门生意</Link><h1 className="text-2xl font-semibold">把生意放在一起研究</h1><p className="text-sm leading-7 text-muted-foreground">查退出案例、对照经营方式、整理顾客的两难，再找自己能亲手接触的环节。先摆出处，再写你的解释和仍需核对的问题。</p><Button asChild variant="outline"><Link href="/materials">去材料箱保存出处</Link></Button></header>{content}</PageContainer>;
}
