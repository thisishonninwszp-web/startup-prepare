import {z} from 'zod';
import {supabaseAdminUncached} from '@/lib/supabase';
import {businessJobOwner} from '../../jobs/owner';
import {withdrawalUuid,withdrawalCommandSchema} from '../domain';
import {collectionSettingsInputSchema,collectionSettingsSchema,collectionStateSchema,collectionLeaseSchema,collectionRunSchema,collectionCandidateReceiptSchema,attemptSchema,diagnosticSchema,DEFAULT_COLLECTION_SETTINGS,type CollectionSettingsInput,type CollectionState} from './domain';
const pin=z.object({runId:withdrawalUuid,token:withdrawalUuid,revision:z.number().int().min(1).max(2147483646)}).strict();
const request={requestId:withdrawalUuid};
const inputSchemas={
 state:z.object({}).strict(),settings:collectionSettingsInputSchema,claim:z.object(request).strict(),check:pin,
 ticket:pin.extend({...request,kind:attemptSchema.shape.kind,issuerId:withdrawalUuid.nullable(),url:z.string().max(2000).nullable()}).strict(),
 settle:pin.extend({...request,ticketId:withdrawalUuid,status:z.enum(['completed','failed','unknown'])}).strict(),
 archive:pin.extend({...request,raw:z.string().max(120000),issues:diagnosticSchema.shape.issues,validatorVersion:diagnosticSchema.shape.validatorVersion,truncated:z.boolean()}).strict(),
 complete:pin.extend(request).strict(),terminate:pin.extend({...request,status:z.enum(['failed','unknown'])}).strict(),
 save_candidate:pin.extend({...request,command:withdrawalCommandSchema}).strict()
};
export type CollectionOperation=keyof typeof inputSchemas;
const receipt=z.object({id:withdrawalUuid,runId:withdrawalUuid}).strict();
const schemas={state:collectionStateSchema,settings:collectionSettingsSchema,
 claim:z.union([z.object({status:z.literal('disabled')}).strict(),collectionLeaseSchema,collectionRunSchema]),
 check:z.object({ok:z.literal(true),runId:withdrawalUuid,revision:z.number().int().positive()}).strict(),
 ticket:receipt.extend({kind:attemptSchema.shape.kind,status:z.literal('reserved')}).strict(),
 settle:receipt.extend({status:z.enum(['completed','failed','unknown'])}).strict(),archive:receipt,
 complete:collectionRunSchema,terminate:collectionRunSchema,
 save_candidate:collectionCandidateReceiptSchema};
type Output<K extends CollectionOperation>=z.infer<(typeof schemas)[K]>;
export async function assertCollectionOwner(owner:string):Promise<void>{withdrawalUuid.parse(owner);if(await businessJobOwner()!==owner)throw new Error('额外采集仅供主账号使用');}
export async function collectionCommand<K extends CollectionOperation>(owner:string,operation:K,input:unknown={}):Promise<Output<K>>{
 await assertCollectionOwner(owner);const parsed=inputSchemas[operation].parse(input);
 const {data,error}=await supabaseAdminUncached.rpc('business_withdrawal_collection_command',{p_user_id:owner,p_operation:operation,p_input:parsed});
 if(error)throw Object.assign(new Error(error.message),{code:error.code});
 const result=schemas[operation].parse(data) as Output<K>;
 const requestData=parsed as Record<string,unknown>,reply=result as Record<string,unknown>;
 if(operation==='settings'&&reply.revision!==Number(requestData.expectedRevision)+1)throw new Error('设置回执版本不一致');
 if(['check','ticket','settle','archive'].includes(operation)&&reply.runId!==requestData.runId)throw new Error('采集回执任务不一致');
 if(operation==='check'&&reply.revision!==requestData.revision)throw new Error('采集回执版本不一致');
 if(operation==='ticket'&&reply.kind!==requestData.kind)throw new Error('请求回执种类不一致');
 if(operation==='settle'&&(reply.id!==requestData.ticketId||reply.status!==requestData.status))throw new Error('请求回执状态不一致');
 if(['complete','terminate'].includes(operation)&&(reply.id!==requestData.runId||reply.revision!==requestData.revision))throw new Error('任务回执不一致');
 if(operation==='save_candidate'){const command=requestData.command as {id:string;lesson:{subject:{identityKey:string}}};if(reply.status==='saved'?reply.id!==command.id:reply.identityKey!==command.lesson.subject.identityKey)throw new Error('候选保存回执不一致');}
 return result;
}
export async function loadCollectionState(owner:string):Promise<CollectionState>{try{return await collectionCommand(owner,'state');}catch(error){if(['42P01','42883','PGRST202','PGRST205'].includes((error as {code?:string}).code??''))return {available:false,settings:DEFAULT_COLLECTION_SETTINGS,run:null,attempts:[],diagnostics:[]};throw error;}}
export function saveCollectionSettings(owner:string,input:CollectionSettingsInput){return collectionCommand(owner,'settings',input);}
export function withdrawalCollectionEnabled():boolean{return process.env.BUSINESS_WITHDRAWAL_COLLECTION_ENABLED==='true';}
