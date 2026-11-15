import Link from 'next/link';
import {notFound} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {PageContainer} from '@/components/ui/page-container';
import {listPremisesAction} from './actions';
import {PremisesPanel} from './panel';
export const dynamic='force-dynamic';
export default async function PremisesPage(){
 const {data:{user}}=await createClient().auth.getUser();if(!user)notFound();
 let content;try{content=<PremisesPanel initialPage={await listPremisesAction()}/>;}catch{content=<PremisesPanel initialPage={null}/>;}
 return <PageContainer><header className="mb-8 space-y-2"><Link href="/workbench" className="text-sm text-muted-foreground underline">回到工作台</Link><h1 className="text-2xl font-semibold">共通前提</h1><p className="text-sm leading-7 text-muted-foreground">几件事可能依赖同一条判断。写清何时该重新检查，再亲自看受影响的对象。</p></header>{content}</PageContainer>;
}
