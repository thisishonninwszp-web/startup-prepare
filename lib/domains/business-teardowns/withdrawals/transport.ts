import {z} from 'zod';
import {supabaseAdminUncached} from '@/lib/supabase';
import {withdrawalUuid,withdrawalCursorSchema,withdrawalIssuerSchema,withdrawalLessonSchema,withdrawalCommandSchema,type WithdrawalCommand,type WithdrawalIssuer,type WithdrawalLesson,type WithdrawalPage} from './domain';

const cursor=z.string().max(500).regex(/^[A-Za-z0-9_-]+$/).refine(value=>{try{return Buffer.from(value,'base64url').toString('base64url')===value&&withdrawalCursorSchema.safeParse(JSON.parse(Buffer.from(value,'base64url').toString('utf8'))).success;}catch{return false;}},'分页位置不正确');
const pageInput=z.object({before:cursor.optional()}).strict();
const receipt=z.object({id:withdrawalUuid,revision:z.number().int().positive()}).strict();
const selection=z.object({id:withdrawalUuid.nullable(),caseId:withdrawalUuid.nullable(),revision:z.number().int().positive().nullable()}).strict().refine(v=>(v.id===null)===(v.caseId===null)&&(v.id===null)===(v.revision===null),'选出回执不一致');
async function rpc<T>(owner:string,name:string,operation:string,input:unknown,schema:z.ZodType<T>):Promise<T>{const user=withdrawalUuid.parse(owner);const {data,error}=await supabaseAdminUncached.rpc(name,{p_user_id:user,p_operation:operation,p_input:input});if(error)throw Object.assign(new Error(error.message),{code:error.code});return schema.parse(data);}
export async function withdrawalCommand(owner:string,command:WithdrawalCommand):Promise<z.infer<typeof receipt>|z.infer<typeof selection>>{
 const parsed=withdrawalCommandSchema.parse(command);
 if(parsed.operation==='select_today')return rpc(owner,'business_withdrawal_command',parsed.operation,parsed,selection);
 const result=await rpc(owner,'business_withdrawal_command',parsed.operation,parsed,receipt);if(result.id!==parsed.id||result.revision!==(parsed.operation==='register_issuer'?1:parsed.expectedRevision+1))throw new Error('教材保存回执与请求不一致');return result;
}
export function withdrawalRead(owner:string,operation:'issuers',input?:{before?:string}):Promise<WithdrawalPage<WithdrawalIssuer>>;
export function withdrawalRead(owner:string,operation:'list',input?:{before?:string}):Promise<WithdrawalPage<WithdrawalLesson>>;
export function withdrawalRead(owner:string,operation:'get',input:{id:string}):Promise<WithdrawalLesson|null>;
export function withdrawalRead(owner:string,operation:'today',input?:Record<string,never>):Promise<WithdrawalLesson|null>;
export async function withdrawalRead(owner:string,operation:'issuers'|'list'|'get'|'today',input:unknown={}):Promise<WithdrawalPage<WithdrawalIssuer>|WithdrawalPage<WithdrawalLesson>|WithdrawalLesson|null>{
 if(operation==='get'||operation==='today'){
  const parsed=operation==='get'?z.object({id:withdrawalUuid}).strict().parse(input):z.object({}).strict().parse(input);
  const value=await rpc(owner,'business_withdrawal_read',operation,parsed,withdrawalLessonSchema.nullable());
  if(operation==='get'&&value&&value.id!==(parsed as {id:string}).id)throw new Error('教材来源与请求不一致');return value;
 }
 const parsed=pageInput.parse(input),before=parsed.before?withdrawalCursorSchema.parse(JSON.parse(Buffer.from(parsed.before,'base64url').toString('utf8'))):null;
 try{
  const item=operation==='issuers'?withdrawalIssuerSchema:withdrawalLessonSchema;
  const page=await rpc(owner,'business_withdrawal_read',operation,before?{before}:{},z.object({items:z.array(item).max(20),nextCursor:withdrawalCursorSchema.nullable()}).strict());
  let previous=before;const ids=new Set<string>();const micros=(stamp:string)=>BigInt(Date.parse(stamp))*BigInt(1000)+BigInt((stamp.match(/\.(\d+)/)?.[1]??'').padEnd(6,'0').slice(3,6));
  for(const entry of page.items){if(ids.has(entry.id)||(previous&&(micros(entry.createdAt)>micros(previous.date)||(micros(entry.createdAt)===micros(previous.date)&&entry.id>=previous.id))))throw new Error('教材分页顺序不一致');ids.add(entry.id);previous={date:entry.createdAt,id:entry.id};}
  if(page.nextCursor&&(!previous||!page.items.length||page.nextCursor.id!==previous.id||micros(page.nextCursor.date)!==micros(previous.date)))throw new Error('教材分页位置不一致');
  return {available:true,items:page.items,nextCursor:page.nextCursor?Buffer.from(JSON.stringify(page.nextCursor)).toString('base64url'):null} as WithdrawalPage<WithdrawalIssuer>|WithdrawalPage<WithdrawalLesson>;
 }catch(error){if(['42P01','42883','PGRST202','PGRST205'].includes((error as {code?:string}).code??''))return {available:false,items:[],nextCursor:null};throw error;}
}
