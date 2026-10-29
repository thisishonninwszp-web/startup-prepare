import { supabaseAdmin } from '@/lib/supabase';
import { normalizeConfig, normalizeRun, uuid, type CreateTaskInput, type TaskConfig, type RunInput } from './domain';

async function rpc(name: string, args: Record<string,unknown>): Promise<{ id: string; taskId?: string; revision?: number }> {
  const {data,error} = await supabaseAdmin.rpc(name,args);
  if(error) throw new Error(error.message);
  if(!data?.id) throw new Error('观察记录未保存');
  return data;
}
export async function createTask(userId:string,input:CreateTaskInput) {
  uuid.parse(userId); uuid.parse(input.objectId); uuid.parse(input.requestId); if(input.gapId) uuid.parse(input.gapId);
  if(input.objectType !== 'idea') throw new Error('首版观察任务仅支持想法');
  return rpc('save_decision_observation_version',{p_user_id:userId,p_task_id:null,p_object_id:input.objectId,p_gap_id:input.gapId??null,p_config:normalizeConfig(input.config),p_request_id:input.requestId});
}
export async function updateTask(userId:string,input:{taskId:string;config:TaskConfig;requestId:string}) {
  [userId,input.taskId,input.requestId].forEach(id=>uuid.parse(id));
  return rpc('save_decision_observation_version',{p_user_id:userId,p_task_id:input.taskId,p_object_id:null,p_gap_id:null,p_config:normalizeConfig(input.config),p_request_id:input.requestId});
}
export async function saveRun(userId:string,input:{taskId:string;taskVersionId:string;requestId:string;run:RunInput}) {
  [userId,input.taskId,input.taskVersionId,input.requestId].forEach(id=>uuid.parse(id));
  return rpc('save_decision_observation_run',{p_user_id:userId,p_task_id:input.taskId,p_version_id:input.taskVersionId,p_request_id:input.requestId,p_payload:normalizeRun(input.run)});
}
export async function attachRunToGap(userId:string,input:{gapId:string;runId:string;requestId:string}) {
  [userId,input.gapId,input.runId,input.requestId].forEach(id=>uuid.parse(id));
  return rpc('attach_observation_gap_ref',{p_user_id:userId,p_gap_id:input.gapId,p_run_id:input.runId,p_request_id:input.requestId});
}
