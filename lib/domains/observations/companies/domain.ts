import { z } from 'zod';
export const uuid=z.string().uuid();
export const ACTIVITY_TYPES=['manual','procurement','subsidy','recruitment','price','feature','disclosure'] as const;
export const ACTIVITY_STAGES=['announcement','action','result'] as const;
export type SourceKind='manual_import'|'official_response'|'web_capture'|'saved_job';
export type CompanySource={kind:SourceKind;url:string|null;rawText:string;quote:string;scope:string;requestProof?:string};
export type CompanyIdentity={corporateNumber:string;legalName:string;address:string;source:CompanySource};
export type CompanyActivity={type:typeof ACTIVITY_TYPES[number];stage:typeof ACTIVITY_STAGES[number];title:string;occurredOn:string|null;dateUnknown:boolean;source:CompanySource;details:Record<string,unknown>};
export type CompanyEntry={id:string;revision?:number;company_id:string;user_id:string;kind:'identity'|'activity'|'snapshot'|'review';payload:Record<string,unknown>;request_id:string;created_at:string;content_hash:string};
export type CompanyIdentityState={entryId:string|null;identity:CompanyIdentity|null};
export type CompanyWriteResult={id:string};
const text=z.string().trim().min(1).max(2000);
const sourceSchema=z.object({kind:z.enum(['manual_import','official_response','web_capture','saved_job']),url:z.string().refine(v=>!/[\u0000-\u001f\u007f]/.test(v)).url().refine(v=>{if(/[\u0000-\u001f\u007f]/.test(v))return false;const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;}).nullable(),rawText:z.string().min(1).max(100000),quote:z.string().min(1).max(20000),scope:text,requestProof:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict().refine(v=>v.rawText.includes(v.quote),'摘录必须出现在捕获原文中');
function source(value:unknown,trusted:boolean){const s=sourceSchema.parse(value);if(!trusted&&(s.kind!=='manual_import'||s.requestProof!==undefined))throw new Error('来源必须由服务器获取或明确手动导入');return s;}
export function normalizeIdentity(value:unknown,trusted=false):CompanyIdentity {const x=z.object({corporateNumber:z.string().regex(/^\d{13}$/),legalName:text,address:text,source:z.unknown()}).strict().parse(value);return {...x,source:source(x.source,trusted)};}
export function normalizeActivity(value:unknown,trusted=false):CompanyActivity {const x=z.object({type:z.enum(ACTIVITY_TYPES),stage:z.enum(ACTIVITY_STAGES),title:text,occurredOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),dateUnknown:z.boolean(),source:z.unknown(),details:z.record(z.string(),z.unknown()).default({})}).strict().parse(value);if(x.dateUnknown!==(x.occurredOn===null))throw new Error('未知日期必须明确声明');if(x.occurredOn&&new Date(x.occurredOn).toISOString().slice(0,10)!==x.occurredOn)throw new Error('无效日期');if(JSON.stringify(x.details).length>20000)throw new Error('详情过长');return {...x,source:source(x.source,trusted)};}
export function isMissingCompanySchema(error:{code?:string;message?:string}){return (error.code==='42P01'||error.code==='PGRST205')&&/company_observation_entries/.test(error.message??'');}
export function companyObservationsEnabled(){return process.env.COMPANY_OBSERVATIONS_ENABLED==='true';}




