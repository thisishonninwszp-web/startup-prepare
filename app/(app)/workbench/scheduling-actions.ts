'use server';
import {createClient} from '@/lib/supabase/server';
import {schedulingEnabled,type ScheduleInput} from '@/lib/domains/observations/scheduling/domain';
import {saveSchedule} from '@/lib/domains/observations/scheduling/commands';
import {loadScheduling} from '@/lib/domains/observations/scheduling/queries';
async function owner(){if(!schedulingEnabled())throw new Error('预算调度尚未启用，需同时开启统计分母模块。');const {data:{user},error}=await createClient().auth.getUser();if(error||!user)throw new Error('未登录');return user.id;}
export async function loadSchedulingAction(before?:string|null){return loadScheduling(await owner(),before);}
export async function saveScheduleAction(input:ScheduleInput){try{return {ok:true as const,data:await saveSchedule(await owner(),input)};}catch(error){return {ok:false as const,message:error instanceof Error?error.message:'未保存，请重试。'};}}
