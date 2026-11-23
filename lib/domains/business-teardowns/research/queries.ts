import {z} from 'zod';
import {supabaseAdminUncached} from '@/lib/supabase';
import {RESEARCH_KINDS,researchUuid,type CaseOption,type ExperienceOption,type ResearchKind,type ResearchList,type ResearchRecord,type SourceKind,type SourceOption} from './domain';

const PAGE_SIZE=20;
const missingTable=(code:string)=>['42P01','PGRST205'].includes(code);
const missingResearch=(code:string)=>missingTable(code)||['42883','PGRST202'].includes(code);
const timestamp=z.string().regex(/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/).refine(v=>Number.isFinite(Date.parse(v)));
const cursorSchema=z.object({date:timestamp,id:researchUuid}).strict();
type Cursor=z.infer<typeof cursorSchema>;
function decodeCursor(before?:string):Cursor|null {
 if(before===undefined)return null;
 if(!/^[A-Za-z0-9_-]{1,400}$/.test(before))throw new Error('无效分页游标');
 try{return cursorSchema.parse(JSON.parse(Buffer.from(before,'base64url').toString('utf8')));}catch{throw new Error('无效分页游标');}
}
function encodeCursor(date:string,id:string):string{return Buffer.from(JSON.stringify(cursorSchema.parse({date,id}))).toString('base64url');}
function cursorFilter(column:string,cursor:Cursor):string{return `${column}.lt.${cursor.date},and(${column}.eq.${cursor.date},id.lt.${cursor.id})`;}
function escapeLike(text:string):string{return text.replace(/[\\%_]/g,'\\$&');}

export async function listResearch(owner:string,options:{kind?:ResearchKind;before?:string}={}):Promise<ResearchList>{
 researchUuid.parse(owner);
 const input=z.object({kind:z.enum(RESEARCH_KINDS).optional(),before:researchUuid.optional()}).strict().parse(options);
 const {data,error}=await supabaseAdminUncached.rpc('business_research_command',{p_user_id:owner,p_operation:'list',p_input:input});
 if(error){if(missingResearch(error.code))return {available:false,items:[],nextCursor:null};throw new Error(error.message);}
 return data as ResearchList;
}
export async function getResearch(owner:string,id:string):Promise<ResearchRecord|null>{
 researchUuid.parse(owner);researchUuid.parse(id);
 const {data,error}=await supabaseAdminUncached.rpc('business_research_command',{p_user_id:owner,p_operation:'get',p_input:{id}});
 if(error)throw new Error(error.message);
 return data as ResearchRecord|null;
}
async function contextRead<T>(owner:string,operation:string,input:unknown):Promise<T>{
 researchUuid.parse(owner);const {data,error}=await supabaseAdminUncached.rpc('business_research_context',{p_user_id:owner,p_operation:operation,p_input:input});if(error)throw new Error(error.message);return data as T;
}
export function loadResearchSubject(owner:string,caseId:string):Promise<CaseOption|null>{return contextRead(owner,'case',{caseId:researchUuid.parse(caseId)});}
export async function listResearchCases(owner:string,options:{before?:string}={}):Promise<{items:CaseOption[];nextCursor:string|null}>{
 const {before}=z.object({before:z.string().optional()}).strict().parse(options);const cursor=decodeCursor(before);
 const page=await contextRead<{items:CaseOption[];nextCursor:Cursor|null}>(owner,'cases',cursor?{before:cursor}:{});
 return {items:page.items,nextCursor:page.nextCursor?encodeCursor(page.nextCursor.date,page.nextCursor.id):null};
}
export async function listResearchSources(owner:string,options:{kind:SourceKind;search?:string;before?:string;caseIds?:string[]}):Promise<{items:SourceOption[];nextCursor:string|null}>{
 researchUuid.parse(owner);
 const input=z.object({kind:z.enum(['snapshot','material','job','official']),caseIds:z.array(researchUuid).min(1).max(2).optional(),search:z.string().trim().max(300).optional(),before:z.string().optional()}).strict().parse(options);
 if(input.kind==='official'){
  if(!input.caseIds?.length)throw new Error('请先选择官方教材所属案例');
  const before=decodeCursor(input.before);const page=await contextRead<{items:SourceOption[];nextCursor:Cursor|null}>(owner,'sources',{caseIds:input.caseIds,...(input.search?{search:input.search}:{}),...(before?{before}:{})});
  return {items:page.items,nextCursor:page.nextCursor?encodeCursor(page.nextCursor.date,page.nextCursor.id):null};
 }
 const cursor=decodeCursor(input.before),snapshot=input.kind==='snapshot',material=input.kind==='material';
 const table=snapshot?'business_material_snapshots':material?'reality_materials':'job_postings';
 const textColumn=snapshot?'captured_text':material?'sanitized_text':'body';
 const dateColumn=snapshot?'captured_at':'created_at';
 const columns=snapshot?'id,captured_text,source_url,captured_at,coverage':material?'id,title,sanitized_text,source_url,created_at':'id,company_name,title,body,url,created_at';
 let query=supabaseAdminUncached.from(table).select(columns).eq('user_id',owner).not(textColumn,'is',null).neq(textColumn,'').order(dateColumn,{ascending:false}).order('id',{ascending:false}).limit(PAGE_SIZE+1);
 if(snapshot)query=query.is('erased_at',null);
 if(material)query=query.neq('status','deleted');
 if(input.search)query=query.ilike(textColumn,`%${escapeLike(input.search)}%`);
 if(cursor)query=query.or(cursorFilter(dateColumn,cursor));
 const {data,error}=await query;
 if(error){if(missingTable(error.code))return {items:[],nextCursor:null};throw new Error(error.message);}
 const rows=(data??[]) as unknown as Record<string,unknown>[];
 const items:SourceOption[]=rows.slice(0,PAGE_SIZE).map(row=>({id:String(row.id),kind:input.kind,title:snapshot?String(row.coverage??'冻结材料'):material?String(row.title??'未命名材料'):`${String(row.company_name??'')} · ${String(row.title??'岗位')}`,text:String(row[textColumn]??''),url:(row[snapshot||material?'source_url':'url'] as string|null)??null,date:(row[dateColumn] as string|null)??null}));
 const last=rows[PAGE_SIZE-1];
 return {items,nextCursor:rows.length>PAGE_SIZE?encodeCursor(String(last[dateColumn]),String(last.id)):null};
}
export async function listResearchExperiences(owner:string):Promise<ExperienceOption[]>{
 researchUuid.parse(owner);
 const items:ExperienceOption[]=[];
 let cursor:Cursor|null=null;
 for(;;){
  let query=supabaseAdminUncached.from('career_entries').select('id,topic,org,period,raw_text,confirmed_at,created_at').eq('user_id',owner).not('confirmed_at','is',null).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(PAGE_SIZE+1);
  if(cursor)query=query.or(cursorFilter('created_at',cursor));
  const {data,error}=await query;
  if(error){if(missingTable(error.code))return [];throw new Error(error.message);}
  const rows=(data??[]).slice(0,PAGE_SIZE);
  items.push(...rows.map(row=>({id:row.id,label:[row.org,row.period].filter(Boolean).join(' · ')||'已确认经历',text:row.raw_text})));
  if((data?.length??0)<=PAGE_SIZE)return items;
  const last=rows[rows.length-1];cursor=cursorSchema.parse({date:last.created_at,id:last.id});
 }
}
