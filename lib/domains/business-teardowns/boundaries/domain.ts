import {z} from 'zod';
import {cashDate,cashUuid,type CashRecord} from '../cash/domain';
const money=z.number().int().min(0).max(1e12);
export const boundaryVariableSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('opening'),minMinor:money,maxMinor:money}).strict(),
 z.object({kind:z.literal('amount'),flowId:cashUuid,minMinor:money,maxMinor:money}).strict(),
 z.object({kind:z.literal('date'),flowId:cashUuid,from:cashDate,to:cashDate}).strict(),
]).superRefine((v,ctx)=>{if(v.kind==='date'){const days=(Date.parse(v.to)-Date.parse(v.from))/86400000+1;if(days<1||days>366)ctx.addIssue({code:'custom',message:'日期范围须为连续 1 至 366 天（含首尾）'});}else if(v.maxMinor<v.minMinor)ctx.addIssue({code:'custom',message:'范围终点不能小于起点'});});
export const boundarySideSchema=z.enum(['baseline','alternative']);
export const boundaryDefinitionSchema=z.object({cashId:cashUuid,cashRevision:z.number().int().positive().max(2147483647),title:z.string().trim().min(1).max(300).refine(v=>v.length<=300,'标题最多 300 个 UTF-16 单位'),side:boundarySideSchema,variable:boundaryVariableSchema}).strict();
export type BoundaryDefinition=z.infer<typeof boundaryDefinitionSchema>;
export type BoundaryVariable=z.infer<typeof boundaryVariableSchema>;
export function parseBoundaryDefinition(v:unknown){return boundaryDefinitionSchema.parse(v);}
const base={id:cashUuid,requestId:cashUuid,expectedRevision:z.number().int().min(0).max(2147483646)};
const commandSchema=z.discriminatedUnion('operation',[z.object({...base,operation:z.literal('save'),definition:boundaryDefinitionSchema}).strict(),z.object({...base,operation:z.literal('erase'),expectedRevision:base.expectedRevision.min(1)}).strict()]);
export type BoundaryCommand=z.infer<typeof commandSchema>;
export function parseBoundaryCommand(v:unknown){return commandSchema.parse(v);}
export type BoundaryRecord={id:string;caseId:string;definition:BoundaryDefinition;revision:number;createdAt:string;updatedAt:string;source:{available:boolean;currentRevision:number|null;caseId:string|null}};
export type BoundaryPage={available:boolean;items:BoundaryRecord[];nextCursor:string|null};
export type BoundarySourcePage={items:CashRecord[];nextCursor:string|null};
export type BoundarySummary={id:string;label:string;refId:string;revision:number;updatedAt:string;nextCheck:null;sourceAvailable:boolean};
export type BoundarySummaryPage={available:boolean;items:BoundarySummary[];nextCursor:string|null};
