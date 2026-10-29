import {supabaseAdmin} from '@/lib/supabase';
import {normalizeSchedule,schedulingUuid,schedulingCursor,type ScheduleInput,type ScheduleRun,type ObservationSchedule} from './domain';
async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{const {data,error}=await supabaseAdmin.rpc(name,args);if(error)throw new Error(error.message);return data as T;}
export async function saveSchedule(owner:string,input:ScheduleInput):Promise<ObservationSchedule>{
 [owner,input.requestId,input.configId].forEach(v=>schedulingUuid.parse(v));if(input.scheduleId)schedulingUuid.parse(input.scheduleId);
 const config=normalizeSchedule({configId:input.configId,enabled:input.enabled,intervalMinutes:input.intervalMinutes,dailyBudget:input.dailyBudget,...(input.maxAttempts===undefined?{}:{maxAttempts:input.maxAttempts})});
 const revision=schedulingCursor(input.expectedRevision);if(Boolean(input.scheduleId)!==Boolean(revision))throw new Error('需要当前调度版本');
 return rpc('save_observation_schedule',{p_user_id:owner,p_schedule_id:input.scheduleId??null,p_expected_revision:revision,p_config:config,p_request_id:input.requestId});
}
export async function claimSchedule(owner:string|null=null,scheduleId:string|null=null):Promise<ScheduleRun|null>{if((owner===null)!==(scheduleId===null))throw new Error('需要调度所有者');if(owner&&scheduleId){schedulingUuid.parse(owner);schedulingUuid.parse(scheduleId);}return rpc('claim_observation_schedule',{p_user_id:owner,p_schedule_id:scheduleId});}
export async function beginScheduleRequest(run:Pick<ScheduleRun,'id'|'token'>){schedulingUuid.parse(run.id);schedulingUuid.parse(run.token);const result=await rpc<{authorized:boolean}>('begin_observation_request',{p_run_id:run.id,p_token:run.token});if(result?.authorized!==true)throw new Error('worker lease authorization unavailable');return result;}
export function finishScheduleRun(run:Pick<ScheduleRun,'id'|'token'>,success:boolean,payload:unknown,error?:string){schedulingUuid.parse(run.id);schedulingUuid.parse(run.token);return rpc<{status:string;snapshotId?:string}>('finish_observation_run',{p_run_id:run.id,p_token:run.token,p_success:success,p_payload:payload,p_error:error??null});}
