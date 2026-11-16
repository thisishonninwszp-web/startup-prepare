import {z} from 'zod';
import {supabaseAdminUncached} from '@/lib/supabase';
import {generatePressureQuestions,PressureOutputError} from '@/lib/ai/business-pressure';
import {pressureUuid,pressurePlanSchema,pressureCommandSchema,pressureAiInputSchema,pressureQuestionsSchema,pressurePreview,type PressureCommand,type PressureAiInput,type PressureAiState,type PressureList,type PressureRecord,type PressureContext,type PressureCase,type PressurePage} from './domain';
const stamp=z.string().max(80).refine(v=>/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v)));
const revision=z.number().int().positive().max(2147483647);
const cursor=z.object({date:stamp,id:pressureUuid}).strict();
const cursorString=z.string().max(400).regex(/^[A-Za-z0-9_-]+$/).refine(v=>{try{return cursor.safeParse(JSON.parse(Buffer.from(v,'base64url').toString())).success;}catch{return false;}});
const pageInput=z.object({before:cursorString.optional()}).strict();
const aiSchema=z.object({requestId:pressureUuid,revision,status:z.enum(['pending','unknown','ready','invalid','stale','revoked']),questions:pressureQuestionsSchema.nullable()}).strict().refine(v=>(v.status==='ready')===(v.questions!==null));
const recordSchema=z.object({id:pressureUuid,plan:pressurePlanSchema,revision,createdAt:stamp,updatedAt:stamp,sources:z.object({caseAvailable:z.boolean(),caseTitle:z.string().nullable()}).strict().refine(s=>s.caseAvailable===(s.caseTitle!==null)),ai:aiSchema.nullable()}).strict().refine(r=>!r.ai||r.ai.revision<=r.revision);
const contextSchema=z.object({caseId:pressureUuid,caseTitle:z.string()}).strict();
const caseSchema=z.object({id:pressureUuid,title:z.string(),date:z.string().regex(/^\d{4}-\d\d-\d\d$/)}).strict();
const payloadSchema=z.object({casePublicName:z.string(),hypotheticalScenario:z.string(),ownAction:z.string(),explanation:z.object({tradeoff:z.string(),checkNext:z.string()}).strict()}).strict();
function pageSchema<T extends z.ZodType>(item:T){return z.object({items:z.array(item).max(20),nextCursor:cursor.nullable()}).strict();}
async function rpc<T>(owner:string,name:string,operation:string,input:unknown,schema:z.ZodType<T>):Promise<T>{pressureUuid.parse(owner);const {data,error}=await supabaseAdminUncached.rpc(name,{p_user_id:owner,p_operation:operation,p_input:input});if(error)throw Object.assign(new Error(error.message),{code:error.code});return schema.parse(data);}
function decode(input:{before?:string}){const p=pageInput.parse(input);return p.before?{before:cursor.parse(JSON.parse(Buffer.from(p.before,'base64url').toString()))}:{};}
function encode<T>(page:{items:T[];nextCursor:{date:string;id:string}|null}):PressurePage<T>{return {...page,nextCursor:page.nextCursor?Buffer.from(JSON.stringify(page.nextCursor)).toString('base64url'):null};}
export async function listPressures(owner:string,input:{before?:string}={}):Promise<PressureList>{try{return {available:true,...encode(await rpc(owner,'business_pressure_read','list',decode(input),pageSchema(recordSchema)))};}catch(e){if(['42P01','42883','PGRST202','PGRST205'].includes((e as {code?:string}).code??''))return {available:false,items:[],nextCursor:null};throw e;}}
export async function getPressure(owner:string,id:string):Promise<PressureRecord|null>{const parsed=pressureUuid.parse(id);const record=await rpc(owner,'business_pressure_read','get',{id:parsed},recordSchema.nullable());if(record&&record.id!==parsed)throw new Error('读取记录与请求不一致');return record;}
export async function listPressureCases(owner:string,input:{before?:string}={}):Promise<PressurePage<PressureCase>>{return encode(await rpc(owner,'business_pressure_read','cases',decode(input),pageSchema(caseSchema)));}
export async function loadPressureContext(owner:string,caseId:string):Promise<PressureContext>{const parsed=pressureUuid.parse(caseId),record=await rpc(owner,'business_pressure_read','context',{caseId:parsed},contextSchema.nullable());if(record&&record.caseId!==parsed)throw new Error('读取案例与请求不一致');return record;}
export async function pressureCommand(owner:string,input:PressureCommand){const parsed=pressureCommandSchema.parse(input),receipt=await rpc(owner,'business_pressure_command',parsed.operation,parsed,z.object({id:pressureUuid,revision}).strict());if(receipt.id!==parsed.id||receipt.revision!==parsed.expectedRevision+1)throw new Error('保存回执与请求不一致，请重新读取');return receipt;}
export async function loadPressureDiagnostic(owner:string,input:{id:string;requestId:string}){const parsed=z.object({id:pressureUuid,requestId:pressureUuid}).strict().parse(input);return rpc(owner,'business_pressure_read','diagnostic',parsed,z.object({raw:z.string().max(60000)}).strict().nullable());}
export async function revokePressureConsent(owner:string,input:{id:string;requestId:string}):Promise<PressureAiState|null>{const parsed=z.object({id:pressureUuid,requestId:pressureUuid}).strict().parse(input);return (await rpc(owner,'business_pressure_ai','revoke',parsed,z.object({state:aiSchema.nullable()}).strict())).state;}
export async function requestPressureQuestions(owner:string,input:PressureAiInput):Promise<PressureAiState|null>{
 const parsed=pressureAiInputSchema.parse(input);
 const lease=await rpc(owner,'business_pressure_ai','start',parsed,z.object({send:z.boolean(),state:aiSchema.nullable(),payload:payloadSchema.optional()}).strict());
 if(!lease.send)return lease.state;
 if(!lease.payload||!lease.state||lease.state.requestId!==parsed.requestId||lease.state.revision!==parsed.expectedRevision||lease.state.status!=='pending')throw new Error('追问许可回执不一致，请重新读取；不会自动重新发送');
 const payload=lease.payload,plan={caseId:parsed.id,scenarioKey:'custom' as const,changedCondition:payload.hypotheticalScenario,action:payload.ownAction,tradeoff:payload.explanation.tradeoff,checkNext:payload.explanation.checkNext};
 if(pressurePreview(payload.casePublicName,plan)!==parsed.payloadPreview)throw new Error('发送预览已经变化，请重新读取；不会自动重新发送');
 let finish:{id:string;requestId:string;status:'ready'|'invalid'|'unknown';questions?:unknown;raw?:string};
 try{const questions=await generatePressureQuestions(owner,parsed.id,plan,payload);finish={id:parsed.id,requestId:parsed.requestId,status:'ready',questions};}
 catch(error){finish=error instanceof PressureOutputError?{id:parsed.id,requestId:parsed.requestId,status:'invalid',raw:error.raw.slice(0,60000)}:{id:parsed.id,requestId:parsed.requestId,status:'unknown'};}
 return (await rpc(owner,'business_pressure_ai','finish',finish,z.object({state:aiSchema.nullable()}).strict())).state;
}
