import {z} from 'zod';
import {supabaseAdminUncached} from '@/lib/supabase';
import {cashUuid,cashScenarioSchema,parseCashCommand,type CashCommand,type CashRecord,type CashPage,type CashCasePage,type CashContext} from './domain';
const stamp=z.string().max(80).refine(v=>/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v)));
const cursor=z.object({date:stamp,id:cashUuid}).strict();
const encodedCursor=z.string().max(400).regex(/^[A-Za-z0-9_-]+$/).refine(v=>{try{return cursor.safeParse(JSON.parse(Buffer.from(v,'base64url').toString())).success;}catch{return false;}},'分页位置不正确');
const pageInput=z.object({before:encodedCursor.optional()}).strict();
const revision=z.number().int().positive().max(2147483647);
const recordSchema=z.object({id:cashUuid,scenario:cashScenarioSchema,revision,createdAt:stamp,updatedAt:stamp,sources:z.object({caseAvailable:z.boolean(),caseTitle:z.string().nullable()}).strict().refine(v=>v.caseAvailable===(v.caseTitle!==null))}).strict();
const caseSchema=z.object({id:cashUuid,title:z.string(),date:z.string().regex(/^\d{4}-\d\d-\d\d$/)}).strict();
const contextSchema=z.object({caseId:cashUuid,caseTitle:z.string()}).strict();
function pageSchema<T extends z.ZodType>(item:T){return z.object({items:z.array(item).max(20),nextCursor:cursor.nullable()}).strict();}
async function read<T>(owner:string,operation:string,input:unknown,schema:z.ZodType<T>):Promise<T>{cashUuid.parse(owner);const {data,error}=await supabaseAdminUncached.rpc('business_cash_read',{p_user_id:owner,p_operation:operation,p_input:input});if(error)throw Object.assign(new Error(error.message),{code:error.code});return schema.parse(data);}
function decodePage(input:{before?:string}){const p=pageInput.parse(input);return p.before?{before:cursor.parse(JSON.parse(Buffer.from(p.before,'base64url').toString()))}:{};}
function encodePage<T>(v:{items:T[];nextCursor:{date:string;id:string}|null}){return {...v,nextCursor:v.nextCursor?Buffer.from(JSON.stringify(v.nextCursor)).toString('base64url'):null};}
export async function cashCommand(owner:string,input:CashCommand):Promise<{id:string;revision:number}>{cashUuid.parse(owner);const parsed=parseCashCommand(input);const {data,error}=await supabaseAdminUncached.rpc('business_cash_command',{p_user_id:owner,p_operation:parsed.operation,p_input:parsed});if(error)throw new Error(error.message);const receipt=z.object({id:cashUuid,revision}).strict().parse(data);if(receipt.id!==parsed.id||receipt.revision!==parsed.expectedRevision+1)throw new Error('保存回执与请求不一致，请重新读取');return receipt;}
export async function listCash(owner:string,input:{before?:string}={}):Promise<CashPage>{try{return {available:true,...encodePage(await read(owner,'list',decodePage(input),pageSchema(recordSchema)))};}catch(error){if(['42P01','42883','PGRST202','PGRST205'].includes((error as {code?:string}).code??''))return {available:false,items:[],nextCursor:null};throw error;}}
export async function getCash(owner:string,id:string):Promise<CashRecord|null>{const parsed=cashUuid.parse(id),record=await read(owner,'get',{id:parsed},recordSchema.nullable());if(record&&record.id!==parsed)throw new Error('读取记录与请求不一致');return record;}
export async function listCashCases(owner:string,input:{before?:string}={}):Promise<CashCasePage>{return encodePage(await read(owner,'cases',decodePage(input),pageSchema(caseSchema)));}
export async function loadCashContext(owner:string,caseId:string):Promise<CashContext>{const parsed=cashUuid.parse(caseId),value=await read(owner,'context',{caseId:parsed},contextSchema.nullable());if(value&&value.caseId!==parsed)throw new Error('读取案例与请求不一致');return value;}
