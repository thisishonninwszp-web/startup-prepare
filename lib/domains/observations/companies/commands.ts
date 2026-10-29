import {supabaseAdmin} from '@/lib/supabase';
import {uuid,normalizeIdentity,normalizeActivity,type CompanyIdentity,type CompanyActivity,type CompanyWriteResult} from './domain';
export type CompanyWriteInput={companyId:string;requestId:string};
export type ConfirmIdentityInput=CompanyWriteInput&{expectedIdentityId:string|null;identity:CompanyIdentity};
export type ClearIdentityInput=CompanyWriteInput&{expectedIdentityId:string|null};
export type SaveActivityInput=CompanyWriteInput&{activity:CompanyActivity};
export type SaveSnapshotInput=CompanyWriteInput&{snapshot:CompanyActivity};
export type LinkSavedJobInput=CompanyWriteInput&{jobId:string;confirmCandidate:boolean;previewHash:string};
export type LinkEntryInput=CompanyWriteInput&{sourceEntryId:string;ideaId:string;assumption:string;unknown:string};
async function save(userId:string,input:CompanyWriteInput,kind:string,payload:unknown,expected:string|null=null):Promise<CompanyWriteResult>{[userId,input.companyId,input.requestId].forEach(v=>uuid.parse(v));if(expected)uuid.parse(expected);const {data,error}=await supabaseAdmin.rpc('save_company_observation',{p_user_id:userId,p_company_id:input.companyId,p_request_id:input.requestId,p_kind:kind,p_payload:payload,p_expected_identity_id:expected});if(error)throw new Error(error.message);if(!data?.id)throw new Error('企业记录未保存');return {id:data.id};}
export async function confirmIdentity(userId:string,input:ConfirmIdentityInput){return save(userId,input,'identity',{action:'confirm',identity:normalizeIdentity(input.identity)},input.expectedIdentityId);}
export async function clearIdentity(userId:string,input:ClearIdentityInput){return save(userId,input,'identity',{action:'clear'},input.expectedIdentityId);}
export async function saveActivity(userId:string,input:SaveActivityInput){return save(userId,input,'activity',normalizeActivity(input.activity));}
export async function saveSnapshot(userId:string,input:SaveSnapshotInput){return save(userId,input,'snapshot',normalizeActivity(input.snapshot));}
// Only server acquisition/import paths call these; no action accepts a client trust flag.
export async function saveTrustedActivity(userId:string,input:SaveActivityInput){return save(userId,input,'activity',normalizeActivity(input.activity,true));}
export async function saveTrustedSnapshot(userId:string,input:SaveSnapshotInput){return save(userId,input,'snapshot',normalizeActivity(input.snapshot,true));}
export async function confirmTrustedIdentity(userId:string,input:ConfirmIdentityInput){return save(userId,input,'identity',{action:'confirm',identity:normalizeIdentity(input.identity,true)},input.expectedIdentityId);}
export async function linkSavedJob(userId:string,input:LinkSavedJobInput){uuid.parse(input.jobId);if(!/^[a-f0-9]{64}$/.test(input.previewHash))throw new Error('岗位预览已过期，请重新选择');if(typeof input.confirmCandidate!=='boolean')throw new Error('请确认岗位归属');return save(userId,input,'job',{jobId:input.jobId,confirmCandidate:input.confirmCandidate,previewHash:input.previewHash});}
export async function linkEntryToIdea(userId:string,input:LinkEntryInput){uuid.parse(input.sourceEntryId);uuid.parse(input.ideaId);if(!input.assumption.trim()||!input.unknown.trim()||input.assumption.length>2000||input.unknown.length>2000)throw new Error('请写明假设及未知');return save(userId,input,'review',{sourceEntryId:input.sourceEntryId,ideaId:input.ideaId,assumption:input.assumption.trim(),unknown:input.unknown.trim()});}

