import {supabaseAdmin} from '@/lib/supabase';
import {uuid} from './domain';
import {validateLearningInput,type LearningInput,type LearningEntry} from './learning-domain';
export async function saveBusinessLearning(owner:string,input:LearningInput):Promise<LearningEntry>{
 uuid(owner);validateLearningInput(input,false);
 const {data,error}=await supabaseAdmin.rpc('business_learning_command',{p_user_id:owner,p_operation:input.operation,p_input:input});
 if(error)throw new Error(error.message);if(!data?.id)throw new Error('保存未返回记录，请保留请求标识并重试');return data as LearningEntry;
}
