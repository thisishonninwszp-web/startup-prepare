import {actionChoiceInputSchema,actionCommandWithinLimit,type ActionChoiceView} from '../action-choices/domain';
import {z} from 'zod';
import {realityCheckUuid,realityCheckPlanSchema,type RealityCheckPlan} from '../reality-checks/domain';
import type {RealityResultBody} from '../reality-results/domain';

export const followupCheckUuid=realityCheckUuid;
const base={id:followupCheckUuid,requestId:followupCheckUuid,expectedRevision:z.number().int().min(0).max(2147483646)};
export const followupCheckCommandSchema=z.unknown().refine(actionCommandWithinLimit,'内容过长').pipe(z.discriminatedUnion('operation',[
 z.object({...base,operation:z.literal('save'),resultId:followupCheckUuid,plan:realityCheckPlanSchema,actionChoice:actionChoiceInputSchema.nullable().optional(),confirmed:z.literal(true)}).strict(),
 z.object({...base,operation:z.literal('erase'),expectedRevision:base.expectedRevision.min(1)}).strict(),
])).refine(actionCommandWithinLimit,'计划内容过长').refine(v=>v.operation!=='save'||!v.actionChoice||v.actionChoice.conditions.kind==='explicit','请亲手填写两条观察条件');
export type FollowupCheckCommand=z.infer<typeof followupCheckCommandSchema>;
export type FollowupCheckSource={id:string;caseId:string;body:RealityResultBody;createdAt:string};
export type FollowupCheckRecord={id:string;caseId:string;resultId:string;plan:RealityCheckPlan;revision:number;createdAt:string;updatedAt:string;source:FollowupCheckSource|null;actionChoice?:ActionChoiceView};
export type FollowupCheckPage<T>={items:T[];nextCursor:string|null};
export type FollowupCheckList=FollowupCheckPage<FollowupCheckRecord>&{available:boolean};
