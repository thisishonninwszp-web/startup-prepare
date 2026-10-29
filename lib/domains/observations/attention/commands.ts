import {supabaseAdmin} from '@/lib/supabase';
import {attentionUuid,normalizeAttention,type AttentionWriteInput,type AttentionEntry} from './domain';
export async function saveAttention(userId:string,eventId:string,input:AttentionWriteInput):Promise<AttentionEntry>{
 [userId,eventId,input.requestId].forEach(value=>attentionUuid.parse(value));if(input.versionId)attentionUuid.parse(input.versionId);
 const payload=normalizeAttention(input.kind,input.payload);
 const {data,error}=await supabaseAdmin.rpc('save_reading_attention',{p_user_id:userId,p_event_id:eventId,p_kind:input.kind,p_version_id:input.versionId??null,p_payload:payload,p_request_id:input.requestId});
 if(error)throw new Error(error.message);if(!data?.id)throw new Error('阅读记录未保存，请重试。');return data as AttentionEntry;
}
