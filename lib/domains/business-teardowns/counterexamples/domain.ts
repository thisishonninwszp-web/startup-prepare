import {z} from 'zod';
export const counterexampleUuid=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,'记录标识不正确').toLowerCase();
export const revisionSchema=z.number().int().min(0).max(2147483646);
const text=z.string().max(6000).refine(v=>v.trim().length>0,'请写下你自己的判断');
export const sourceMethodDraftSchema=z.object({method:text,scenario:text,conditions:text,failureConditions:text,unknowns:text}).strict();
export const methodDraftSchema=sourceMethodDraftSchema.refine(v=>Object.values(v).reduce((total,value)=>total+new TextEncoder().encode(JSON.stringify(value)).length,0)<=38000,'五项文字合计过长，请缩短后再保存');
export const methodKindSchema=z.enum(['learning','lesson']);
export const studySchema=z.object({methodId:counterexampleUuid,methodKind:methodKindSchema,baselineHash:z.string().regex(/^[a-f0-9]{32}$/),candidateCaseId:counterexampleUuid,explanation:text,conditionDifferences:text,checkNext:text,revisedMethodDraft:methodDraftSchema}).strict();
const base={id:counterexampleUuid,requestId:counterexampleUuid,expectedRevision:revisionSchema};
export const commandSchema=z.discriminatedUnion('operation',[
 z.object({...base,operation:z.literal('save'),study:studySchema}).strict(),
 z.object({...base,operation:z.literal('delete')}).strict(),
 z.object({...base,operation:z.literal('adopt'),confirmed:z.literal(true),preview:methodDraftSchema}).strict(),
]);
export const parseCounterexampleCommand=(input:unknown)=>commandSchema.parse(input);
export function assertCounterexampleReceiptRevision(receiptRevision:number,readRevision:number){if(receiptRevision!==readRevision)throw new Error('本次已保存，随后另一页面又修改了这份研究。你的填写仍在，请比较最新保存内容后明确采用。');}
export type MethodDraft=z.infer<typeof methodDraftSchema>;
export type CounterexampleStudy=z.infer<typeof studySchema>;
export type CounterexampleCommand=z.infer<typeof commandSchema>;
export type CounterexampleMethod={id:string;kind:'learning'|'lesson';caseId:string;reportId:string;baselineHash:string;draft:MethodDraft};
export type CounterexampleCandidate={id:string;title:string;date:string};
export type CounterexampleRecord={id:string;revision:number;study:CounterexampleStudy;createdAt:string;updatedAt:string;adoptedMethodId:string|null;sources:{method:CounterexampleMethod|null;candidate:CounterexampleCandidate|null;stale:boolean}};
export type CounterexamplePage<T>={items:T[];nextCursor:string|null};
export type CounterexampleState=CounterexamplePage<CounterexampleRecord>&{available:boolean};
export const COUNTEREXAMPLE_PROMPTS=['是不是同一个任务、同一类买家或付款者？','时间、渠道、资源条件相同吗？','这是原方法在相同条件下失效，还是原来的成立条件根本不在？','哪些仍然不知道？下一步向谁核对什么？'];
