import {supabaseAdminUncached} from '@/lib/supabase';
import {detailSchema,historyPageSchema,newsPageSchema,pageSchema,readSchema,targetPageSchema,uuidSchema,type PremiseRead} from './domain';
export async function readPremises(owner:unknown,input:PremiseRead){
 const user=uuidSchema.parse(owner),parsed=readSchema.parse(input);
 const {data,error}=await supabaseAdminUncached.rpc('shared_premise_read',{p_user_id:user,p_operation:parsed.operation,p_input:parsed});
 if(error){if(['42P01','42883','PGRST202','PGRST205'].includes(error.code)){if(parsed.operation==='get')throw new Error('共通前提尚未就绪，请完成 125 数据库更新。');return {available:false,items:[],nextCursor:null};}throw new Error(error.message);}
 switch(parsed.operation){case 'get':return detailSchema.parse(data);case 'list':return pageSchema.parse(data);case 'targets':return targetPageSchema.parse(data);case 'news':return newsPageSchema.parse(data);case 'history':return historyPageSchema.parse(data);}
}
