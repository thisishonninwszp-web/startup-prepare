import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { uuid, type DailyCase, type MerchantInput, type SnapshotInput } from './domain';
export function semanticInputHash(input:object):string {
 function canonical(value:unknown):unknown {if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));return value;}
 return createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex');
}
export async function findBusinessReceipt(owner:string,input:{requestId:string;operation:'primary'|'attach';userInputHash:string}):Promise<DailyCase|null> {
 uuid(owner);uuid(input.requestId);
 const {data,error}=await supabaseAdmin.rpc('business_request_receipt',{p_user_id:owner,p_request_id:input.requestId,p_operation:input.operation,p_user_input_hash:input.userInputHash});
 if(error)throw new Error(error.message);return data as DailyCase|null;
}
export type SaveCaseMaterialInput={requestId:string;operation:'primary'|'attach';userInputHash:string;merchant:MerchantInput;snapshot:SnapshotInput;selectionReason:string;caseId?:string;expectedRevision?:number;role?:'product'|'comparison'};
export async function prepareBusinessCase(owner:string,input:{requestId:string;userInputHash:string;merchant:MerchantInput;selectionReason:string}):Promise<{dailyCase:DailyCase;needsMaterial:boolean}> {
 uuid(owner);uuid(input.requestId);const {data,error}=await supabaseAdmin.rpc('business_prepare_case',{p_user_id:owner,p_input:input});if(error)throw new Error(error.message);if(!data?.dailyCase?.id)throw new Error('未返回当日槽位');return data;
}
export async function failBusinessPreparation(owner:string,input:{requestId:string;userInputHash:string}):Promise<void> {
 uuid(owner);uuid(input.requestId);const {error}=await supabaseAdmin.rpc('business_fail_preparation',{p_user_id:owner,p_request_id:input.requestId,p_user_input_hash:input.userInputHash});if(error)throw new Error(error.message);
}
/** Internal server adapter only. Public actions construct official materials by refetching the selected platform item. */
export async function saveCaseMaterial(owner:string,input:SaveCaseMaterialInput):Promise<DailyCase> {
 uuid(owner);uuid(input.requestId);if(input.caseId)uuid(input.caseId);
 if(Buffer.byteLength(JSON.stringify(input),'utf8')>100000)throw new Error('材料过长');
 const {data,error}=await supabaseAdmin.rpc('business_save_case_material',{p_user_id:owner,p_input:input});
 if(error)throw new Error(error.message);if(!data?.id)throw new Error('保存未返回案例');return data as DailyCase;
}
