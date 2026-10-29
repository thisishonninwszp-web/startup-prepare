import {supabaseAdmin} from '@/lib/supabase';
import {uuid,normalizeFeedback,normalizeFeedbackLink,type FeedbackInput,type FeedbackLinkInput} from './domain';
async function write(userId:string,name:string,payload:unknown):Promise<{id:string}>{uuid.parse(userId);const {data,error}=await supabaseAdmin.rpc(name,{p_user_id:userId,p_payload:payload});if(error)throw new Error(error.message);if(!data?.id)throw new Error('反馈未保存');return {id:data.id};}
export async function saveFeedback(userId:string,input:FeedbackInput){return write(userId,'save_decision_feedback',normalizeFeedback(input));}
export async function saveFeedbackLink(userId:string,input:FeedbackLinkInput){return write(userId,'save_decision_feedback_link',normalizeFeedbackLink(input));}
