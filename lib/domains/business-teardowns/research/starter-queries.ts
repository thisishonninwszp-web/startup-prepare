import {z} from 'zod';
import {supabaseAdminUncached} from '@/lib/supabase';
import type {CaseSection} from '../report-domain';
import {RESEARCH_KINDS,researchUuid,type ResearchKind,type SourceOption} from './domain';
import {buildResearchStarter} from './starter';
import type {ResearchStarter,StarterCase} from './starter-types';

const inputSchema=z.object({caseIds:z.array(researchUuid).min(1).max(2).refine(ids=>new Set(ids).size===ids.length,'请选择不同案例'),kind:z.enum(RESEARCH_KINDS)}).strict();
type CaseRow={id:string;merchant_id:string;local_date:string;published_revision_id?:string|null};
type MerchantRow={id:string;name:string;platform:string};

export async function loadResearchStarter(owner:string,input:{caseIds:string[];kind:ResearchKind}):Promise<ResearchStarter>{
 owner=researchUuid.parse(owner);
 const {caseIds,kind}=inputSchema.parse(input);
 const {data:selectedRows,error:selectedError}=await supabaseAdminUncached.from('business_daily_cases').select('id,merchant_id,local_date,published_revision_id').eq('user_id',owner).in('id',caseIds).limit(2);
 if(selectedError)throw new Error(selectedError.message);
 const selectedById=new Map(((selectedRows??[]) as CaseRow[]).map(row=>[row.id,row]));
 const selected=caseIds.map(caseId=>{const row=selectedById.get(caseId);if(!row)throw new Error('所选案例不存在或不属于当前账号，请重新选择');return row;});

 let recentQuery=supabaseAdminUncached.from('business_daily_cases').select('id,merchant_id,local_date').eq('user_id',owner).order('local_date',{ascending:false}).order('id',{ascending:false}).limit(20);
 for(const caseId of caseIds)recentQuery=recentQuery.neq('id',caseId);
 const {data:recentRows,error:recentError}=await recentQuery;
 if(recentError)throw new Error(recentError.message);
 const recent=(recentRows??[]) as CaseRow[];
 const merchantIds=Array.from(new Set([...selected,...recent].map(row=>row.merchant_id)));
 const {data:merchantRows,error:merchantError}=await supabaseAdminUncached.from('business_merchants').select('id,name,platform').eq('user_id',owner).in('id',merchantIds);
 if(merchantError)throw new Error(merchantError.message);
 const merchants=new Map(((merchantRows??[]) as MerchantRow[]).map(row=>[row.id,row]));
 function metadata(row:CaseRow):StarterCase{
  const merchant=merchants.get(row.merchant_id);
  if(!merchant)throw new Error('案例商家不存在或不可读取，请重新选择案例');
  return {id:row.id,name:merchant.name,date:row.local_date,merchantId:merchant.id,platform:merchant.platform,sources:[],sourcesTruncated:false,report:null};
 }

 const cases:StarterCase[]=[];
 for(const row of selected){
  const item=metadata(row);
  const {data:members,error:memberError}=await supabaseAdminUncached.from('business_case_members').select('snapshot_id').eq('user_id',owner).eq('case_id',row.id).order('added_at',{ascending:true}).order('snapshot_id',{ascending:true}).limit(21);
  if(memberError)throw new Error(memberError.message);
  item.sourcesTruncated=(members?.length??0)>20;
  const snapshotIds=(members??[]).slice(0,20).map(member=>member.snapshot_id as string);
  if(snapshotIds.length){
   const {data:snapshots,error:snapshotError}=await supabaseAdminUncached.from('business_material_snapshots').select('id,captured_text,source_url,captured_at,published_at,coverage').eq('user_id',owner).in('id',snapshotIds).is('erased_at',null).not('captured_text','is',null).neq('captured_text','').limit(20);
   if(snapshotError)throw new Error(snapshotError.message);
   const byId=new Map((snapshots??[]).map(snapshot=>[snapshot.id, snapshot]));
   item.sources=snapshotIds.flatMap(snapshotId=>{
    const snapshot=byId.get(snapshotId);
    if(!snapshot||typeof snapshot.captured_text!=='string'||!snapshot.captured_text.trim())return [];
    const source:SourceOption={id:snapshot.id,kind:'snapshot',title:snapshot.coverage??'冻结材料',text:snapshot.captured_text,url:snapshot.source_url??null,date:snapshot.published_at??snapshot.captured_at??null};
    return [source];
   });
  }
  if(row.published_revision_id){
   const {data:report,error:reportError}=await supabaseAdminUncached.from('business_case_revisions').select('id,revision,sections:payload->sections').eq('user_id',owner).eq('case_id',row.id).eq('id',row.published_revision_id).is('erased_at',null).maybeSingle();
   if(reportError)throw new Error(reportError.message);
   if(report)item.report={id:report.id,revision:report.revision,sections:((report.sections??[]) as CaseSection[]).map(section=>{
    const {validationDiagnostics,validationGaps,...content}=section;
    void validationDiagnostics;void validationGaps;
    return content;
   })};
  }
  cases.push(item);
 }
 return buildResearchStarter(kind,cases,recent.filter(row=>merchants.has(row.merchant_id)).map(metadata));
}
