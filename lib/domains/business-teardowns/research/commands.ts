import {z} from 'zod';
import {supabaseAdminUncached} from '@/lib/supabase';
import {parseResearchInput,researchUuid,type ResearchInput} from './domain';

const saved=z.object({id:researchUuid,revision:z.number().int().positive()}).strict();
export async function saveResearch(owner:string,input:ResearchInput):Promise<{id:string;revision:number}>{
 researchUuid.parse(owner);
 const parsed=parseResearchInput(input);
 const {data,error}=await supabaseAdminUncached.rpc('business_research_command',{p_user_id:owner,p_operation:'save',p_input:parsed});
 if(error)throw new Error(error.message);
 return saved.parse(data);
}
export async function eraseResearch(owner:string,input:{id:string;requestId:string}):Promise<void>{
 researchUuid.parse(owner);
 const parsed=z.object({id:researchUuid,requestId:researchUuid}).strict().parse(input);
 const {error}=await supabaseAdminUncached.rpc('business_research_command',{p_user_id:owner,p_operation:'erase',p_input:parsed});
 if(error)throw new Error(error.message);
}
