import {z} from 'zod';
import {counterexampleUuid,methodDraftSchema,type MethodDraft} from '../counterexamples/domain';
import type {RealityResultBody} from '../reality-results/domain';
export const resultMethodUuid=counterexampleUuid;
export const resultMethodDraftSchema=methodDraftSchema.refine(value=>Object.values(value).every(text=>text.length<=6000),'文字太长');
export const resultMethodCommandSchema=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('append'),id:resultMethodUuid,requestId:resultMethodUuid,resultId:resultMethodUuid,draft:resultMethodDraftSchema,confirmed:z.literal(true)}).strict(),
 z.object({operation:z.literal('erase'),id:resultMethodUuid,requestId:resultMethodUuid,expectedRevision:z.literal(1)}).strict(),
]);
export type ResultMethodDraft=MethodDraft;
export type ResultMethodSource={id:string;caseId:string;body:RealityResultBody;createdAt:string};
export type ResultMethodRecord={id:string;caseId:string;resultId:string;parentMethodId:string|null;draft:ResultMethodDraft;createdAt:string;source:ResultMethodSource|null};
export type ResultMethodList={available:boolean;items:ResultMethodRecord[];nextCursor:string|null};
export type ResultMethodCommand=z.infer<typeof resultMethodCommandSchema>;

