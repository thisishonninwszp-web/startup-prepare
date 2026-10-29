import {supabaseAdmin} from '@/lib/supabase';
import {uuid} from '../domain';
import {applicableFeedback} from './task-adjustments';
import type {Feedback} from './domain';
export type FeedbackContactDraft={feedbackId:string;ideaId:string;title:string;scenario:string};
export function feedbackContactBrief(feedback:Feedback,idea:{id:string;title:string}):FeedbackContactDraft{
 return {feedbackId:feedback.id,ideaId:idea.id,title:`再核对：${idea.title}`.slice(0,120),scenario:[
  `角色与情境：${feedback.role_context}`,
  `我的解释（有待推翻）：${feedback.interpretation}`,
  feedback.source_kind==='no_reply'?'先核对触达对象、渠道和时机；无回复仍不能说明有没有痛点或是否愿意付钱。':'这条反馈仅代表记录中的角色和情境，先寻找不适用的反例。',
  '接触提纲：请还原最近一次实际遇到的问题；当时做了什么、用了哪些替代方案、花了什么成本？有没有无需解决的情形？',
  '追问边界：哪些情况与此前反馈不同？什么事实会推翻我的解释？对方不清楚或不回答时保留未知。',
  `反馈出处：${feedback.id}`,`关联想法：/ideas/${idea.id}`,
 ].join('\n\n')};
}
export async function loadFeedbackContactDraft(userId:string,feedbackId:string):Promise<FeedbackContactDraft>{
 uuid.parse(userId);uuid.parse(feedbackId);
 const {data,error}=await supabaseAdmin.from('decision_feedback').select('idea_id').eq('user_id',userId).eq('id',feedbackId).maybeSingle();
 if(error)throw new Error(error.message);if(!data)throw new Error('反馈不可访问');
 const context=await applicableFeedback(userId,feedbackId,data.idea_id);
 return feedbackContactBrief(context.feedback,context.idea);
}
