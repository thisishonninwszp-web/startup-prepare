import {supabaseAdmin} from '@/lib/supabase';
import {uuid} from './domain';
export type ReasoningSourceSummary={id:string;title:string;source_url:string|null;captured_at:string;capture_scope?:'summary'|'excerpt'|'body'};
export type ReasoningSource=ReasoningSourceSummary&{captured_text:string};
function sourceQuery(userId:string,eventId:string,fields:string){
 uuid.parse(userId);uuid.parse(eventId);
 return supabaseAdmin.from('signal_source_snapshots')
  .select(`${fields},memberships:signal_event_memberships!inner(event_id,user_id,action)`)
  .eq('user_id',userId).eq('memberships.user_id',userId).eq('memberships.event_id',eventId).eq('memberships.action','include');
}
export async function listReasoningSources(userId:string,eventId:string,after?:string){
 if(after)uuid.parse(after);
 let query=sourceQuery(userId,eventId,'id,title,source_url,captured_at,capture_scope').order('id',{ascending:true});
 if(after)query=query.gt('id',after);
 const {data,error}=await query.limit(21);if(error)throw new Error(error.message);
 const rows=(data??[]) as unknown as ReasoningSourceSummary[];
 const items=rows.slice(0,20).map(({id,title,source_url,captured_at,capture_scope})=>({id,title,source_url,captured_at,capture_scope}));
 return {items,nextCursor:rows.length>20?items[19].id:null};
}
export async function getReasoningSource(userId:string,eventId:string,snapshotId:string):Promise<ReasoningSource>{
 uuid.parse(snapshotId);
 const {data,error}=await sourceQuery(userId,eventId,'id,title,source_url,captured_at,captured_text,capture_scope').eq('id',snapshotId).maybeSingle();
 if(error)throw new Error(error.message);if(!data)throw new Error('来源不属于当前事件或不可访问');
 const {id,title,source_url,captured_at,captured_text,capture_scope}=data as unknown as ReasoningSource;
 return {id,title,source_url,captured_at,captured_text,capture_scope};
}
