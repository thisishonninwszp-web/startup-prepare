import { z } from 'zod';
export const EVENT_KINDS=['query','no_result','task_completed','return_visit','inquiry','payment'] as const;
export type EventKind=typeof EVENT_KINDS[number];
export const uuid=z.string().uuid();
const version=z.string().regex(/^[A-Za-z0-9._-]{1,32}$/);
const https=z.string().max(2048).transform((value,ctx)=>{try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(u.hostname))throw Error();return u.toString();}catch{ctx.addIssue({code:'custom',message:'请填写无凭证及查询参数的 HTTPS 原型/告知地址'});return z.NEVER;}});
const config=z.object({prototypeUrl:https,noticeUrl:https,noticeVersion:version,eventKinds:z.array(z.enum(EVENT_KINDS)).min(1).max(6).refine(v=>new Set(v).size===v.length),retentionDays:z.number().int().min(1).max(30)}).strict();
export type ProductConfig=z.infer<typeof config>;
const envelope={externalId:uuid,occurredAt:z.string().datetime({offset:true}),noticeVersion:version,subjectHash:z.string().regex(/^[a-f0-9]{64}$/).optional()};
const event=z.discriminatedUnion('kind',[
 z.object({...envelope,kind:z.literal('query'),attributes:z.object({resultCount:z.number().int().min(0).max(1000000)}).strict()}).strict(),
 z.object({...envelope,kind:z.literal('no_result'),attributes:z.object({}).strict()}).strict(),
 z.object({...envelope,kind:z.literal('task_completed'),attributes:z.object({durationBucket:z.enum(['under_minute','one_to_five_minutes','over_five_minutes','unknown'])}).strict()}).strict(),
 z.object({...envelope,kind:z.literal('return_visit'),attributes:z.object({interval:z.enum(['day','week','month','unknown'])}).strict()}).strict(),
 z.object({...envelope,kind:z.literal('inquiry'),attributes:z.object({channel:z.enum(['form','email','other'])}).strict()}).strict(),
 z.object({...envelope,kind:z.literal('payment'),attributes:z.object({amountMinor:z.number().int().min(0).max(1000000000),currency:z.enum(['JPY','USD','EUR']),kind:z.enum(['one_time','recurring'])}).strict()}).strict(),
]);
export type ProductEventInput=z.infer<typeof event>;
export const normalizeConfig=(input:unknown)=>config.parse(input);
export const normalizeEvent=(input:unknown)=>event.parse(input);
export const SOURCE_ACTIONS=['create','activate','pause','rotate','revoke','delete','purge'] as const;
const sourceCommand=z.object({action:z.enum(SOURCE_ACTIONS),requestId:uuid,sourceId:uuid.optional(),expectedRevision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),config:config.optional(),confirmPrototype:z.literal(true).optional()}).strict().superRefine((v,c)=>{
 if(v.action==='create'){if(!v.config||v.sourceId||v.expectedRevision!==undefined||v.confirmPrototype!==undefined)c.addIssue({code:'custom',message:'先保存停用的原型定义'});}
 else if(v.action==='purge'){if(v.sourceId||v.config||v.expectedRevision!==undefined||v.confirmPrototype!==undefined)c.addIssue({code:'custom',message:'清理按本人保留期执行'});}
 else if(!v.sourceId||v.expectedRevision===undefined||v.config!==undefined||(v.action==='activate'?v.confirmPrototype!==true:v.confirmPrototype!==undefined))c.addIssue({code:'custom',message:'操作需要当前原型版本；激活需要明确确认实际原型和告知'});
});
export type ProductSourceCommand=z.infer<typeof sourceCommand>;
export const normalizeSourceCommand=(input:unknown)=>sourceCommand.parse(input);
const link=z.object({eventId:uuid,ideaId:uuid,scope:z.string().trim().min(1).max(2000),unknown:z.string().trim().min(1).max(2000),requestId:uuid}).strict();
export type ProductEventLinkInput=z.infer<typeof link>;
export const normalizeEventLink=(input:unknown)=>link.parse(input);
export type ProductSource={id:string;revision:number;prototype_url:string|null;notice_url:string|null;notice_version:string|null;event_kinds:EventKind[]|null;retention_days:number;active:boolean;confirmed_at:string|null;deleted_at:string|null};
export type ProductEvent={id:string;source_id:string;revision:number;kind:EventKind|null;attributes:Record<string,string|number>|null;occurred_at:string|null;captured_at:string|null;deleted_at:string|null};
export type ProductEventLink={id:string;event_id:string;idea_id:string;scope:string|null;unknown:string|null;event:ProductEvent};
export type ProductReceipt={id:string;removed_count:number;reason:'source_deleted'|'retention';created_at:string};
export type ProductState={available:boolean;sources:ProductSource[];events:ProductEvent[];links:ProductEventLink[];receipts:ProductReceipt[]};
