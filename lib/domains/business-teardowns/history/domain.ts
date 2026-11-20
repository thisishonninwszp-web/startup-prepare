import {z} from 'zod';
import {cashDate,cashUuid} from '../cash/domain';
import {realityCheckPlanSchema,type RealityCheckPlan} from '../reality-checks/domain';
import {realityResultBodySchema,type RealityResultBody} from '../reality-results/domain';

export const confirmationUuid=cashUuid;
export type ConfirmationParent={kind:'simulation'|'result'|'plan';id:string;revision:number;available:boolean};
export type ConfirmationNode={kind:'plan'|'result';id:string;caseId:string;revision:number;at:string;parent:ConfirmationParent;plan:RealityCheckPlan|null;body:RealityResultBody|null;planSnapshot:RealityCheckPlan|null;planSavedAt:string|null;snapshotErasedAt:string|null};
export type ConfirmationHistory={available:boolean;items:ConfirmationNode[];nextCursor:string|null};
export type ConfirmationNodeKey={kind:'plan';id:string;revision:number}|{kind:'result';id:string};
export const confirmationRevision=z.number().int().min(1).max(2147483647);
export const confirmationStamp=z.string().max(80).refine(value=>{
 const match=/^\d{4}-\d\d-\d\dT(\d\d):(\d\d):(\d\d)(?:\.\d{1,6})?(?:Z|([+-])(\d\d):(\d\d))$/.exec(value);
 return !!match&&Number(match[1])<24&&Number(match[2])<60&&Number(match[3])<60&&(!match[4]||(Number(match[5])<=15&&Number(match[6])<60))&&cashDate.safeParse(value.slice(0,10)).success&&Number.isFinite(Date.parse(value));
},'记录时间不正确');
export const confirmationNodeKeySchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('plan'),id:confirmationUuid,revision:confirmationRevision}).strict(),
 z.object({kind:z.literal('result'),id:confirmationUuid}).strict(),
]);
export const confirmationCursorSchema=z.object({at:confirmationStamp,kind:z.enum(['plan','result']),id:confirmationUuid,revision:confirmationRevision}).strict().refine(value=>value.kind==='plan'||value.revision===1,'结果版本不正确');
export const confirmationNodeSchema=z.object({
 kind:z.enum(['plan','result']),id:confirmationUuid,caseId:confirmationUuid,revision:confirmationRevision,at:confirmationStamp,
 parent:z.object({kind:z.enum(['simulation','result','plan']),id:confirmationUuid,revision:confirmationRevision,available:z.boolean()}).strict(),
 plan:realityCheckPlanSchema.nullable(),body:realityResultBodySchema.nullable(),planSnapshot:realityCheckPlanSchema.nullable(),planSavedAt:confirmationStamp.nullable(),snapshotErasedAt:confirmationStamp.nullable(),
}).strict().refine(value=>value.kind==='plan'
 ?value.plan!==null&&value.body===null&&value.planSnapshot===null&&value.planSavedAt===null&&value.snapshotErasedAt===null&&((value.parent.kind==='simulation'&&value.parent.revision>=2)||(value.parent.kind==='result'&&value.parent.revision===1))
 :value.revision===1&&value.plan===null&&value.body!==null&&value.parent.kind==='plan'&&value.planSavedAt!==null&&(value.planSnapshot===null)===(value.snapshotErasedAt!==null)&&value.parent.available===(value.planSnapshot!==null),'记录来源或擦除状态不一致');

export type ConfirmationCursor=z.infer<typeof confirmationCursorSchema>;
export function confirmationMicros(at:string):bigint{return BigInt(Date.parse(at))*BigInt(1000)+BigInt((at.match(/\.(\d+)/)?.[1]??'').padEnd(6,'0').slice(3,6));}
export function compareConfirmationKeys(a:ConfirmationCursor,b:ConfirmationCursor):number{
 const difference=confirmationMicros(a.at)-confirmationMicros(b.at);
 if(difference!==BigInt(0))return difference<BigInt(0)?-1:1;
 for(const key of ['kind','id'] as const)if(a[key]!==b[key])return a[key]<b[key]?-1:1;
 return a.revision-b.revision;
}
