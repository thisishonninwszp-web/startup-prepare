'use server';
import {createClient} from '@/lib/supabase/server';
import {getReasoningSource,listReasoningSources} from '@/lib/domains/observations/reasoning-sources';
async function owner(){
 if(process.env.REASONING_ATTENTION_ENABLED!=='true'||process.env.SIGNAL_EVENTS_ENABLED!=='true')throw new Error('材料核对尚未启用');
 const {data:{user},error}=await createClient().auth.getUser();if(error||!user)throw new Error('未登录');return user.id;
}
export async function listReasoningSourcesAction(eventId:string,cursor?:string){return listReasoningSources(await owner(),eventId,cursor);}
export async function getReasoningSourceAction(eventId:string,snapshotId:string){return getReasoningSource(await owner(),eventId,snapshotId);}
