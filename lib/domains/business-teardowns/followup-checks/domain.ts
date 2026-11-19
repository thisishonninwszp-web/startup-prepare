import {z} from 'zod';
import {realityCheckUuid,realityCheckPlanSchema,type RealityCheckPlan} from '../reality-checks/domain';
import type {RealityResultBody} from '../reality-results/domain';

export const followupCheckUuid=realityCheckUuid;
const base={id:followupCheckUuid,requestId:followupCheckUuid,expectedRevision:z.number().int().min(0).max(2147483646)};
export const followupCheckCommandSchema=z.discriminatedUnion('operation',[
 z.object({...base,operation:z.literal('save'),resultId:followupCheckUuid,plan:realityCheckPlanSchema,confirmed:z.literal(true)}).strict(),
 z.object({...base,operation:z.literal('erase'),expectedRevision:base.expectedRevision.min(1)}).strict(),
]);
export type FollowupCheckCommand=z.infer<typeof followupCheckCommandSchema>;
export type FollowupCheckSource={id:string;caseId:string;body:RealityResultBody;createdAt:string};
export type FollowupCheckRecord={id:string;caseId:string;resultId:string;plan:RealityCheckPlan;revision:number;createdAt:string;updatedAt:string;source:FollowupCheckSource|null};
export type FollowupCheckPage<T>={items:T[];nextCursor:string|null};
export type FollowupCheckList=FollowupCheckPage<FollowupCheckRecord>&{available:boolean};
