import { supabaseAdmin } from '@/lib/supabase';
import { uuid, type DailyCase, type Merchant, type MaterialSnapshot, type CaseDetail, type CaseMember } from './domain';
type Row=Record<string,unknown>;
export function dailyCaseFromRow(r:Row):DailyCase {return {id:String(r.id),localDate:String(r.local_date),timezone:'Asia/Tokyo',merchantId:String(r.merchant_id),state:r.state as DailyCase['state'],publishedRevisionId:r.published_revision_id as string|null,failureReason:r.failure_reason as string|null,revision:Number(r.revision),selectionReason:String(r.selection_reason)};}
function merchantFromRow(r:Row):Merchant {return {id:String(r.id),platform:r.platform as Merchant['platform'],platformShopId:String(r.platform_shop_id),name:String(r.name),sourceUrl:String(r.source_url),identityScope:r.identity_scope as Merchant['identityScope']};}
function snapshotFromRow(r:Row):MaterialSnapshot {return {id:String(r.id),merchantId:String(r.merchant_id),platform:r.platform as MaterialSnapshot['platform'],itemId:r.item_id as string|null,origin:r.origin as MaterialSnapshot['origin'],sourceUrl:String(r.source_url),capturedAt:String(r.captured_at),publishedAt:r.published_at as string|null,captureScope:r.capture_scope as MaterialSnapshot['captureScope'],capturedText:r.captured_text as string|null,quantities:r.quantities as MaterialSnapshot['quantities'],structured:r.structured as Record<string,unknown>,coverage:String(r.coverage),contentHash:String(r.content_hash)};}
export async function getBusinessSchemaStatus():Promise<boolean> {
 const {error}=await supabaseAdmin.from('business_daily_cases').select('id').limit(0);
 if(!error)return true;if(['42P01','PGRST205'].includes(error.code))return false;throw new Error(error.message);
}
export async function loadDailyCase(owner:string):Promise<DailyCase|null> {
 uuid(owner);const {data,error}=await supabaseAdmin.rpc('business_load_today',{p_user_id:owner});
 if(error)throw new Error(error.message);return data as DailyCase|null;
}
export async function listCaseHistory(owner:string,before?:string):Promise<{items:DailyCase[];nextCursor:string|null}> {
 uuid(owner);if(before&&!/^\d{4}-\d{2}-\d{2}$/.test(before))throw new Error('无效历史游标');
 let q=supabaseAdmin.from('business_daily_cases').select('*').eq('user_id',owner).order('local_date',{ascending:false}).limit(21);if(before)q=q.lt('local_date',before);
 const {data,error}=await q;if(error)throw new Error(error.message);const rows=data??[];const items=rows.slice(0,20).map(dailyCaseFromRow);return {items,nextCursor:rows.length>20?items[items.length-1].localDate:null};
}
export async function loadCaseDetail(owner:string,caseId:string):Promise<CaseDetail|null> {
 uuid(owner);uuid(caseId);const {data:raw,error}=await supabaseAdmin.from('business_daily_cases').select('*').eq('user_id',owner).eq('id',caseId).maybeSingle();if(error)throw new Error(error.message);if(!raw)return null;
 const {data:merchant,error:me}=await supabaseAdmin.from('business_merchants').select('*').eq('user_id',owner).eq('id',raw.merchant_id).single();if(me)throw new Error(me.message);
 const result:CaseMember[]=[];
 for(let offset=0;;offset+=100) {
  const {data:members,error:ce}=await supabaseAdmin.from('business_case_members').select('role,snapshot_id,merchant_id').eq('user_id',owner).eq('case_id',caseId).order('added_at').order('snapshot_id').range(offset,offset+99);if(ce)throw new Error(ce.message);
  if(!members?.length)break;
  const [{data:snapshots,error:se},{data:shops,error:shopError}]=await Promise.all([supabaseAdmin.from('business_material_snapshots').select('*').eq('user_id',owner).in('id',members.map(m=>m.snapshot_id)),supabaseAdmin.from('business_merchants').select('*').eq('user_id',owner).in('id',Array.from(new Set(members.map(m=>m.merchant_id))))]);
  if(se||shopError)throw new Error((se||shopError)!.message);
  const snapshotMap=new Map((snapshots??[]).map(s=>[s.id,s]));const shopMap=new Map((shops??[]).map(s=>[s.id,s]));
  for(const member of members) {
   const snapshot=snapshotMap.get(member.snapshot_id);const shop=shopMap.get(member.merchant_id);if(!snapshot||!shop)throw new Error('案例来源记录缺失');
   result.push({role:member.role as CaseMember['role'],snapshot:snapshotFromRow(snapshot),merchant:merchantFromRow(shop)});
  }
  if(members.length<100)break;
 }
 return {dailyCase:dailyCaseFromRow(raw),merchant:merchantFromRow(merchant),members:result};
}
