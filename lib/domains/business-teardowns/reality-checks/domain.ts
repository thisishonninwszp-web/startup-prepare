import {z} from 'zod';
import {cashDate,cashUuid} from '../cash/domain';

export const realityCheckUuid=cashUuid;
const text=(maximum:number)=>z.string().trim().min(1,'请写下这一项').refine(value=>value.length<=maximum,'文字太长');
export const realityCheckPlanSchema=z.object({question:text(1000),falsifier:text(3000),method:text(3000),dueDate:cashDate}).strict();
const base={id:realityCheckUuid,requestId:realityCheckUuid,expectedRevision:z.number().int().min(0).max(2147483646)};
export const realityCheckCommandSchema=z.discriminatedUnion('operation',[
 z.object({...base,operation:z.literal('save'),simulationId:realityCheckUuid,round:z.number().int().min(1).max(6),plan:realityCheckPlanSchema,confirmed:z.literal(true)}).strict(),
 z.object({...base,operation:z.literal('erase'),expectedRevision:base.expectedRevision.min(1)}).strict(),
]);
export type RealityCheckPlan=z.infer<typeof realityCheckPlanSchema>;
export type RealityCheckCommand=z.infer<typeof realityCheckCommandSchema>;
export type RealityCheckSource={id:string;caseId:string;title:string;revision:number;turns:{reason:string;checkNext:string}[];caseAvailable:boolean;caseTitle:string|null};
export type RealityCheckSourceSummary=Omit<RealityCheckSource,'turns'>&{roundCount:number};
export type RealityCheckSourceState={available:boolean;title:string|null;currentRevision:number|null;reason:string|null;checkNext:string|null;caseAvailable:boolean;caseTitle:string|null};
export type RealityCheckRecord={id:string;caseId:string;simulationId:string;round:number;sourceRevision:number;plan:RealityCheckPlan;revision:number;createdAt:string;updatedAt:string;source:RealityCheckSourceState};
export type RealityCheckPage<T>={items:T[];nextCursor:string|null};
export type RealityCheckList=RealityCheckPage<RealityCheckRecord>&{available:boolean};
export type RealityCheckSourcePage=RealityCheckPage<RealityCheckSourceSummary>;
