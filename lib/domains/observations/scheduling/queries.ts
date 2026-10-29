import {supabaseAdmin} from '@/lib/supabase';
import {schedulingUuid,schedulingCursor,type SchedulingState} from './domain';
export async function loadScheduling(owner:string,before?:string|null):Promise<SchedulingState>{
 schedulingUuid.parse(owner);const {data,error}=await supabaseAdmin.rpc('page_observation_scheduling',{p_user_id:owner,p_before:schedulingCursor(before)});
 if(error){if(/page_observation_scheduling/.test(error.message)&&/does not exist|schema cache|Could not find/.test(error.message))return {available:false,schedules:[],runs:[],sources:[],budgets:[],nextCursor:null};throw new Error(error.message);}return data as SchedulingState;
}
