'use server';
import {createClient} from '@/lib/supabase/server';
import {revalidatePath} from 'next/cache';
import {listTasks,getTask} from '@/lib/domains/observations/queries';
import {applicableFeedback,previewTaskAdjustment,saveTaskProposal,applyTaskProposal,listTaskProposals,type TaskAdjustmentInput} from '@/lib/domains/observations/feedback/task-adjustments';
async function owner(){
 if(process.env.FEEDBACK_LEARNING_ENABLED!=='true'||process.env.DECISION_OBSERVATIONS_ENABLED!=='true')throw new Error('反馈观察调整尚未启用');
 const {data:{user}}=await createClient().auth.getUser();if(!user)throw new Error('未登录');return user.id;
}
export async function loadFeedbackTasksAction(ideaId:string,feedbackId:string,cursor?:string){const id=await owner();await applicableFeedback(id,feedbackId,ideaId);return listTasks(id,{objectId:ideaId,objectType:'idea',cursor});}
export async function loadFeedbackTaskDetailAction(taskId:string){return getTask(await owner(),taskId);}
export async function loadFeedbackProposalsAction(feedbackId:string,taskId:string,before?:number){return listTaskProposals(await owner(),feedbackId,taskId,before);}
export async function previewFeedbackTaskAction(input:TaskAdjustmentInput){return previewTaskAdjustment(await owner(),input);}
export async function saveFeedbackTaskProposalAction(input:TaskAdjustmentInput){const result=await saveTaskProposal(await owner(),input);revalidatePath('/workbench');return result;}
export async function applyFeedbackTaskProposalAction(input:{proposalId:string;requestId:string}){const result=await applyTaskProposal(await owner(),input);revalidatePath('/workbench');return result;}
