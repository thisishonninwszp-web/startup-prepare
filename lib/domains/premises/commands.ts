import {supabaseAdminUncached} from '@/lib/supabase';
import {commandSchema,resultSchema,uuidSchema} from './domain';
export async function savePremise(owner:unknown,input:unknown){
 const user=uuidSchema.parse(owner),parsed=commandSchema.parse(input);
 const {data,error}=await supabaseAdminUncached.rpc('shared_premise_command',{p_user_id:user,p_operation:parsed.operation,p_input:parsed});
 if(error)throw new Error(['42P01','42883','PGRST202','PGRST205'].includes(error.code)?'共通前提尚未就绪，请完成 125 数据库更新。':error.message);
 const result=resultSchema.parse(data);if(result.id!==parsed.id||result.operation!==parsed.operation)throw new Error('保存回执不一致，请保留输入并重试。');return result;
}
