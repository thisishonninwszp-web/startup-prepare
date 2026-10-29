'use server';
import {createClient} from '@/lib/supabase/server';
import {loadFeedbackContactDraft} from '@/lib/domains/observations/feedback/contact-brief';
export async function prepareFeedbackContactAction(feedbackId:string){
 if(process.env.FEEDBACK_LEARNING_ENABLED!=='true')throw new Error('反馈学习尚未启用');
 const {data:{user}}=await createClient().auth.getUser();if(!user)throw new Error('未登录');
 return loadFeedbackContactDraft(user.id,feedbackId);
}
