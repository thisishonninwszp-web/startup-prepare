import {supabaseAdmin} from '@/lib/supabase';
import {uuid} from './domain';
import type {LearningState,MethodPage} from './learning-domain';
const missing=(code:string)=>['42P01','42883','PGRST202','PGRST205'].includes(code);
export async function loadBusinessLearning(owner:string,caseId:string,before?:string):Promise<LearningState>{
 uuid(owner);uuid(caseId);if(before)uuid(before);
 const {data,error}=await supabaseAdmin.rpc('business_learning_read',{p_user_id:owner,p_case_id:caseId,p_before:before??null});
 if(error){if(missing(error.code))return {available:false,version:0,items:[],nextCursor:null,merchants:[],duplicateCaseIds:[]};throw new Error(error.message);}return data as LearningState;
}
export async function searchBusinessMethods(owner:string,query:string,before?:string):Promise<MethodPage>{
 uuid(owner);if(typeof query!=='string'||query.length>500)throw new Error('检索文字过长');if(before)uuid(before);
 const {data,error}=await supabaseAdmin.rpc('business_method_search',{p_user_id:owner,p_query:query.trim(),p_before:before??null});
 if(error){if(missing(error.code))return {available:false,items:[],nextCursor:null};throw new Error(error.message);}return data as MethodPage;
}
