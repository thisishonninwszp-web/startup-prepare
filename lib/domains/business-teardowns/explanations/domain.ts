import {actionChoiceMatchesExpectations,actionChoiceInputSchema,actionChoiceViewSchema,actionCommandWithinLimit} from '../action-choices/domain';
import {z} from 'zod';
import {cashDate,cashUuid} from '../cash/domain';
import {SECTION_KEYS} from '../report-domain';
const own=(max:number)=>z.string().trim().min(1,'请亲手填写这一项').refine(v=>v.length<=max,'文字太长');
export const explanationAnchorSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('report'),reportId:cashUuid,reportRevision:z.number().int().positive().max(2147483647),section:z.enum(SECTION_KEYS),index:z.number().int().min(0).max(99),manifestHash:z.string().min(1).max(200)}).strict(),
 z.object({kind:z.literal('withdrawal'),lessonId:cashUuid,lessonRevision:z.number().int().positive().max(2147483647)}).strict(),
]);
export const explanationExpectationsSchema=z.object({expectedA:own(3000),expectedB:own(3000),uncontrolled:z.string().trim().refine(v=>v.length<=3000,'文字太长')}).strict();
export const explanationDraftSchema=explanationExpectationsSchema.extend({question:own(1000),falsifier:own(3000),method:own(3000),dueDate:cashDate}).strict();
const base={id:cashUuid,requestId:cashUuid,expectedRevision:z.number().int().min(0).max(2147483646)};
export const explanationCommandSchema=z.unknown().refine(actionCommandWithinLimit,'内容过长').refine(value=>{if(!value||typeof value!=='object'||Array.isArray(value))return true;const original={...value} as Record<string,unknown>;delete original.actionChoice;return new TextEncoder().encode(JSON.stringify(original)).length<=80000;},'原计划内容过长').pipe(z.discriminatedUnion('operation',[
 z.object({...base,operation:z.literal('save'),anchor:explanationAnchorSchema,draft:explanationDraftSchema,actionChoice:actionChoiceInputSchema.nullable().optional(),confirmed:z.literal(true)}).strict(),
 z.object({...base,operation:z.literal('erase'),expectedRevision:base.expectedRevision.min(1)}).strict(),
])).refine(actionCommandWithinLimit,'比较内容过长').refine(v=>{const original={...v};if('actionChoice' in original)delete original.actionChoice;return new TextEncoder().encode(JSON.stringify(original)).length<=80000;},'原计划内容过长').refine(v=>v.operation!=='save'||!v.actionChoice||v.actionChoice.conditions.kind==='expectations','行动条件必须引用本版预期A/B');
export const explanationStamp=z.string().max(80).regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/).refine(v=>Number.isFinite(Date.parse(v))&&cashDate.safeParse(v.slice(0,10)).success);
export const explanationSourceSchema=z.object({caseId:cashUuid,title:z.string().max(1000),explanationA:z.string().min(1).max(10000),explanationB:z.string().min(1).max(10000),distinguishingObservation:z.string().max(10000),refs:z.array(z.object({quote:z.string().max(10000),url:z.string().url().max(2000)}).strict()).max(30),anchor:explanationAnchorSchema}).strict();
export const explanationRecordSchema=z.object({id:cashUuid,caseId:cashUuid,anchor:explanationAnchorSchema,draft:explanationDraftSchema,revision:z.number().int().positive().max(2147483647),createdAt:explanationStamp,updatedAt:explanationStamp,source:explanationSourceSchema.nullable(),actionChoice:actionChoiceViewSchema.optional()}).strict().refine(v=>!v.source||(v.source.caseId===v.caseId&&JSON.stringify(v.source.anchor)===JSON.stringify(v.anchor)),'解释来源不一致').refine(v=>actionChoiceMatchesExpectations(v.actionChoice,v.draft),'行动条件与当版预期不一致');
export type ExplanationAnchor=z.infer<typeof explanationAnchorSchema>;
export type ExplanationExpectations=z.infer<typeof explanationExpectationsSchema>;
export type ExplanationPlanDraft=z.infer<typeof explanationDraftSchema>;
export type ExplanationSource=z.infer<typeof explanationSourceSchema>;
export type ExplanationPlanRecord=z.infer<typeof explanationRecordSchema>;
export type ExplanationCommand=z.infer<typeof explanationCommandSchema>;
export type ExplanationList={available:boolean;items:ExplanationPlanRecord[];nextCursor:string|null};
export function explanationAnchorQuery(anchor:ExplanationAnchor):string{const a=explanationAnchorSchema.parse(anchor);return new URLSearchParams(Object.fromEntries(Object.entries(a).map(([k,v])=>[k,String(v)]))).toString();}
