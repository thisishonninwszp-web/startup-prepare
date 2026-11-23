import type {ExplanationExpectations} from '../explanations/domain';
import {z} from 'zod';
import {cashDate,cashUuid} from '../cash/domain';
import type {RealityCheckPlan} from '../reality-checks/domain';

export const realityResultUuid=cashUuid;
const text=(maximum:number)=>z.string().trim().min(1,'请写下这一项').refine(value=>value.length<=maximum,'文字太长');
const sourceUrl=z.string().refine(value=>value.length<=2000,'网址太长').refine(value=>{
 if(!/^https:\/\//i.test(value)||/[\s\u0000-\u001f\u007f-\u009f\\]/u.test(value))return false;
 try{const url=new URL(value),authority=value.slice(8).split(/[/?#]/,1)[0];return url.protocol==='https:'&&!!url.hostname&&!url.username&&!url.password&&/^(?:\[[0-9a-fA-F:.]+\]|[^:@]+)(?::\d{1,5})?$/.test(authority)&&!authority.includes('@');}catch{return false;}
},'请填写不含登录信息的 HTTPS 网址');
export const realityResultBodySchema=z.object({checkedOn:cashDate,examined:text(3000),found:text(6000),sourceNote:text(3000),sourceUrl:sourceUrl.nullable(),learned:text(3000)}).strict();
export const realityResultCommandSchema=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('append'),id:realityResultUuid,requestId:realityResultUuid,planId:realityResultUuid,planRevision:z.number().int().min(1).max(2147483647),body:realityResultBodySchema,confirmed:z.literal(true)}).strict(),
 z.object({operation:z.literal('erase'),id:realityResultUuid,requestId:realityResultUuid,expectedRevision:z.literal(1)}).strict(),
]);
export type RealityResultBody=z.infer<typeof realityResultBodySchema>;
export type RealityResultCommand=z.infer<typeof realityResultCommandSchema>;
export type RealityResultPlan={id:string;caseId:string;question:string;revision:number;createdAt:string;updatedAt:string;caseAvailable:boolean;caseTitle:string|null;expectations?:ExplanationExpectations};
export type RealityResultVersion={planId:string;caseId:string;revision:number;plan:RealityCheckPlan;savedAt:string;currentRevision:number;caseAvailable:boolean;caseTitle:string|null;expectations?:ExplanationExpectations};
export type RealityResultRecord={id:string;caseId:string;planId:string;planRevision:number;planSavedAt:string;planSnapshot:RealityCheckPlan|null;snapshotErasedAt:string|null;body:RealityResultBody;createdAt:string;revision:1;planCurrentRevision:number|null;expectations?:ExplanationExpectations};
export type RealityResultPage<T>={items:T[];nextCursor:string|null};
export type RealityResultList=RealityResultPage<RealityResultRecord>&{available:boolean};
export type RealityResultVersionPage=RealityResultPage<RealityResultVersion>;
