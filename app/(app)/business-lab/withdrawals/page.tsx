import Link from 'next/link';
import {notFound} from 'next/navigation';
import {PageContainer} from '@/components/ui/page-container';
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {withdrawalRead} from '@/lib/domains/business-teardowns/withdrawals/transport';
import {withdrawalUuid} from '@/lib/domains/business-teardowns/withdrawals/domain';
import {WithdrawalPanel} from './withdrawal-panel';
import {ownerEmail} from '@/lib/members';
export const dynamic='force-dynamic';
export default async function WithdrawalsPage({searchParams}:{searchParams:{lessonId?:string|string[]}}){
 if(!businessTeardownsEnabled())notFound();const {data:{user}}=await createClient().auth.getUser();if(!user)notFound();
 let content;try{const parsed=withdrawalUuid.safeParse(searchParams.lessonId);const [lessons,issuers,today,detail]=await Promise.all([withdrawalRead(user.id,'list',{}),withdrawalRead(user.id,'issuers',{}),withdrawalRead(user.id,'today',{}),parsed.success?withdrawalRead(user.id,'get',{id:parsed.data}):Promise.resolve(null)]);content=<WithdrawalPanel initialLessons={lessons} initialIssuers={issuers} initialToday={today} initialDetail={detail}/>;}catch{content=<p role="alert" className="rounded-lg border p-5 text-sm leading-7">教材还没有读取成功。请刷新重试，暂时不显示缓存原文。已保存的教材不会因此替换。</p>;}
 const isCollectionOwner=!!ownerEmail()&&ownerEmail()===user.email?.trim().toLowerCase();
 return <PageContainer width="wide"><header className="mb-8 space-y-3"><Link className="text-sm underline" href="/business-lab">返回每日一门生意</Link><h1 className="text-2xl font-semibold">退出与收缩</h1><p className="max-w-2xl text-sm leading-7 text-muted-foreground">把发生了什么、公司说的理由和你的假设分开。研究不能代替真实接触，也不证明这个原因能迁移到另一门生意。</p>{isCollectionOwner&&<Link className="inline-block text-sm underline" href="/business-lab/withdrawals/collection">额外采集与诊断</Link>}</header>{content}</PageContainer>;
}
