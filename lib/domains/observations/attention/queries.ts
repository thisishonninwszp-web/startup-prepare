import {supabaseAdmin} from '@/lib/supabase';
import {attentionUuid,parseAttentionCursor,type AttentionPage} from './domain';
export async function loadAttention(userId:string,eventId:string,after?:string|null,samplesOnly=false):Promise<AttentionPage>{
 [userId,eventId].forEach(value=>attentionUuid.parse(value));const cursor=parseAttentionCursor(after);
 const {data,error}=await supabaseAdmin.rpc('page_reading_attention',{p_user_id:userId,p_event_id:eventId,p_after:cursor,p_samples_only:samplesOnly,p_limit:50});
 if(error){if(/page_reading_attention/.test(error.message)&&/does not exist|schema cache|Could not find/.test(error.message))return {available:false,entries:[],nextCursor:null};throw new Error(error.message);}
 return data as AttentionPage;
}
