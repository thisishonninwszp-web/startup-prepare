import Link from 'next/link';
import {notFound} from 'next/navigation';
import {PageContainer} from '@/components/ui/page-container';
import {createClient} from '@/lib/supabase/server';
import {businessJobOwner} from '@/lib/domains/business-teardowns/jobs/owner';
import {loadWithdrawalCollectionAction} from './actions';
import {CollectionPanel} from './collection-panel';
export const dynamic='force-dynamic';
export default async function WithdrawalCollectionPage(){
 const {data:{user}}=await createClient().auth.getUser();if(!user||await businessJobOwner()!==user.id)notFound();
 let content;try{content=<CollectionPanel initial={await loadWithdrawalCollectionAction()}/>;}catch{content=<p role="alert" className="rounded-lg border p-5 text-sm">采集设置和诊断尚未读到。请刷新，当前不会显示未校验正文。</p>;}
 return <PageContainer width="wide"><header className="mb-8 space-y-3"><Link href="/business-lab/withdrawals" className="text-sm underline">返回退出教材</Link><h1 className="text-2xl font-semibold">退出案例：额外采集与诊断</h1><p className="text-sm text-muted-foreground">仅供主账号。代码已准备，新增付费采集初始暂停。</p></header>{content}</PageContainer>;
}
