"use server";
import {revalidatePath} from 'next/cache';
import {createClient} from '@/lib/supabase/server';
import {saveAttention} from '@/lib/domains/observations/attention/commands';
import {loadAttention} from '@/lib/domains/observations/attention/queries';
import type {AttentionWriteInput} from '@/lib/domains/observations/attention/domain';
import {eventsEnabled} from './enabled';
async function viewer(){if(!eventsEnabled()||process.env.REASONING_ATTENTION_ENABLED!=='true')throw new Error('阅读约定尚未开启。');const {data:{user},error}=await createClient().auth.getUser();if(error||!user)throw new Error('请先登录。');return user.id;}
function fail(error:unknown){return {ok:false as const,message:error instanceof Error?error.message:'本次未保存，输入仍在。'};}
export async function attentionStateAction(eventId:string,after?:string|null,samplesOnly=false){try{return {ok:true as const,data:await loadAttention(await viewer(),eventId,after,samplesOnly)};}catch(error){return fail(error);}}
export async function saveAttentionAction(eventId:string,input:AttentionWriteInput){
 try{const data=await saveAttention(await viewer(),eventId,input);let refreshWarning:string|undefined;try{revalidatePath(`/signals/events/${eventId}`);}catch{refreshWarning='记录已保存，但页面刷新未完成，请重新加载。';}return {ok:true as const,data,...(refreshWarning?{refreshWarning}:{})};}catch(error){return fail(error);}
}
