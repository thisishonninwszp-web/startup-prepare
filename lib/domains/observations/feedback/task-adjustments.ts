import {supabaseAdmin} from '@/lib/supabase';
import {normalizeConfig,uuid,type TaskConfig} from '../domain';
import {getTask} from '../queries';
import {taskConfigDiff} from './task-diff';
import type {Feedback,FeedbackLink} from './domain';
export type TaskAdjustmentInput={feedbackId:string;taskId:string;baseVersionId:string;nextConfig:TaskConfig;reason:string;requestId:string};
export type TaskProposal={id:string;feedback_id:string;task_id:string;base_version_id:string;before_config:TaskConfig;next_config:TaskConfig;reason:string;revision:number;created_at:string};
export async function applicableFeedback(userId:string,feedbackId:string,ideaId:string){
 [userId,feedbackId,ideaId].forEach(id=>uuid.parse(id));
 const [feedback,idea]=await Promise.all([
  supabaseAdmin.from('decision_feedback').select('*').eq('user_id',userId).eq('id',feedbackId).maybeSingle(),
  supabaseAdmin.from('ideas').select('id,title').eq('user_id',userId).eq('id',ideaId).maybeSingle(),
 ]);
 if(feedback.error||idea.error)throw new Error((feedback.error??idea.error)!.message);
 if(!feedback.data||!idea.data)throw new Error('反馈或想法不可用');
 let link:FeedbackLink|null=null;
 if(feedback.data.idea_id!==ideaId){
  const result=await supabaseAdmin.from('decision_feedback_links').select('*').eq('user_id',userId).eq('feedback_id',feedbackId).eq('target_idea_id',ideaId).order('revision',{ascending:false}).limit(1).maybeSingle();
  if(result.error)throw new Error(result.error.message);
  if(!result.data||result.data.action!=='confirm')throw new Error('请先确认反馈在此想法的适用范围');
  link=result.data as FeedbackLink;
 }
 return {feedback:feedback.data as Feedback,idea:idea.data as {id:string;title:string},link};
}
export async function previewTaskAdjustment(userId:string,input:TaskAdjustmentInput){
 [input.requestId,input.baseVersionId].forEach(id=>uuid.parse(id));
 const reason=input.reason.trim();if(!reason||reason.length>4000)throw new Error('请写明调整理由（最多4000字）');
 const detail=await getTask(userId,input.taskId);
 if(detail.status!=='ready'||!detail.task||!detail.versions[0])throw new Error('观察任务不可用');
 const base=detail.versions[0];if(base.id!==input.baseVersionId)throw new Error('观察配置已变化，请重新读取并预览');
 const context=await applicableFeedback(userId,input.feedbackId,detail.task.object_id);
 const nextConfig=normalizeConfig(input.nextConfig),diff=taskConfigDiff(base.config,nextConfig);
 if(!diff.changes.length)throw new Error('配置没有变化');
 return {ideaId:detail.task.object_id,base,nextConfig,diff,reason,sourceLinkId:context.link?.id??null};
}
export async function saveTaskProposal(userId:string,input:TaskAdjustmentInput){
 // The RPC checks retries before optimistic state checks, including after successful application.
 uuid.parse(userId);[input.feedbackId,input.taskId,input.baseVersionId,input.requestId].forEach(id=>uuid.parse(id));
 const reason=input.reason.trim();if(!reason||reason.length>4000)throw new Error('请写明调整理由');
 const {data,error}=await supabaseAdmin.rpc('save_feedback_task_proposal',{p_user_id:userId,p_feedback_id:input.feedbackId,p_task_id:input.taskId,p_base_version_id:input.baseVersionId,p_next_config:normalizeConfig(input.nextConfig),p_reason:reason,p_request_id:input.requestId});
 if(error)throw new Error(error.message);return data as {id:string};
}
export async function applyTaskProposal(userId:string,input:{proposalId:string;requestId:string}){
 [userId,input.proposalId,input.requestId].forEach(id=>uuid.parse(id));
 const {data,error}=await supabaseAdmin.rpc('apply_feedback_task_proposal',{p_user_id:userId,p_proposal_id:input.proposalId,p_request_id:input.requestId});
 if(error)throw new Error(error.message);return data as {id:string;versionId:string};
}
export async function listTaskProposals(userId:string,feedbackId:string,taskId:string,before?:number){
 [userId,feedbackId,taskId].forEach(id=>uuid.parse(id));
 let query=supabaseAdmin.from('feedback_task_proposals').select('*').eq('user_id',userId).eq('feedback_id',feedbackId).eq('task_id',taskId).order('revision',{ascending:false});
 if(before!==undefined){if(!Number.isSafeInteger(before)||before<1)throw new Error('无效分页位置');query=query.lt('revision',before);}
 const {data,error}=await query.limit(21);if(error)throw new Error(error.message);
 const rows=(data??[]) as TaskProposal[];return {items:rows.slice(0,20),nextBefore:rows.length>20?rows[19].revision:null};
}
