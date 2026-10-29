import { supabaseAdmin } from "@/lib/supabase";
import { isMissingCompanySchema, uuid, type CompanyEntry } from "./domain";

export type CompanyIdeaReview = { id:string;companyId:string;createdAt:string;assumption:string;unknown:string;source:CompanyEntry|null };
export async function loadCompanyIdeaReviews(userId:string,ideaId:string):Promise<{available:boolean;items:CompanyIdeaReview[];capped:boolean}> {
  uuid.parse(userId);uuid.parse(ideaId);
  const own=await supabaseAdmin.from("ideas").select("id").eq("user_id",userId).eq("id",ideaId).maybeSingle();
  if(own.error)throw new Error(own.error.message);if(!own.data)throw new Error("想法不可访问。");
  const entries=await supabaseAdmin.from("company_observation_entries").select("id,company_id,payload,created_at").eq("user_id",userId).eq("kind","review").eq("payload->>ideaId",ideaId).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(21);
  if(entries.error){if(isMissingCompanySchema(entries.error))return{available:false,items:[],capped:false};throw new Error(entries.error.message);}
  const rows=(entries.data??[]).slice(0,20);if(!rows.length)return{available:true,items:[],capped:false};
  const ids=[...new Set(rows.map(r=>String(r.payload.sourceEntryId)))];
  const sources=await supabaseAdmin.from("company_observation_entries").select("*").eq("user_id",userId).in("id",ids).limit(20);
  if(sources.error)throw new Error(sources.error.message);
  return {available:true,capped:(entries.data?.length??0)>20,items:rows.map(r=>({id:r.id,companyId:r.company_id,createdAt:r.created_at,assumption:String(r.payload.assumption),unknown:String(r.payload.unknown),source:(sources.data??[]).find(s=>s.id===r.payload.sourceEntryId&&s.company_id===r.company_id) as CompanyEntry??null}))};
}
