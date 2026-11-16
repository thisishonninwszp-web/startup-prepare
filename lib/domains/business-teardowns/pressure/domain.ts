import {z} from 'zod';
export const pressureUuid=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).toLowerCase();
const text=z.string().trim().min(1,'请先写下这一项').max(3000);
export const pressureScenario=z.enum(['prepay','channel_lost','returns_surge','delivery_delay','custom']);
export const pressurePlanSchema=z.object({caseId:pressureUuid,scenarioKey:pressureScenario,changedCondition:text,action:text,tradeoff:text,checkNext:text}).strict();
const base={id:pressureUuid,requestId:pressureUuid,expectedRevision:z.number().int().min(0).max(2147483646)};
export const pressureCommandSchema=z.discriminatedUnion('operation',[z.object({...base,operation:z.literal('save'),plan:pressurePlanSchema}).strict(),z.object({...base,operation:z.literal('erase'),expectedRevision:base.expectedRevision.min(1)}).strict()]);
export const pressureAiInputSchema=z.object({id:pressureUuid,requestId:pressureUuid,expectedRevision:z.number().int().positive().max(2147483647),payloadPreview:z.string().max(16000),publicDeidentified:z.literal(true),allowGoogleGemini:z.literal(true)}).strict();
export type PressurePlan=z.infer<typeof pressurePlanSchema>;
export type PressureCommand=z.infer<typeof pressureCommandSchema>;
export type PressureAiInput=z.infer<typeof pressureAiInputSchema>;
export type PressureScenario=z.infer<typeof pressureScenario>;
export type PressureQuestions={questions:{question:string;answerQuote:string}[]};
export type PressureAiState={requestId:string;revision:number;status:'pending'|'unknown'|'ready'|'invalid'|'stale'|'revoked';questions:PressureQuestions|null};
export type PressureRecord={id:string;plan:PressurePlan;revision:number;createdAt:string;updatedAt:string;sources:{caseAvailable:boolean;caseTitle:string|null};ai:PressureAiState|null};
export type PressurePage<T>={items:T[];nextCursor:string|null};
export type PressureList=PressurePage<PressureRecord>&{available:boolean};
export type PressureCase={id:string;title:string;date:string};
export type PressureContext={caseId:string;caseTitle:string}|null;
export const PRESSURE_TEMPLATES:readonly [PressureScenario,string,string][]=[['prepay','供货改预付','假设：供应商要求先付款再发货。'],['channel_lost','主要集客渠道不可用','假设：主要集客渠道暂时不能使用。'],['returns_surge','退货增加','假设：退货请求增加，原处理方式忙不过来。'],['delivery_delay','交付延迟','假设：原定交付无法按期完成。'],['custom','自定条件','假设：请写下一个尚未发生、用于练习的条件变化。']];
export const PRESSURE_QUESTIONS=['你先停下哪件事？如果不停，谁会承担代价？','你的选择牺牲了什么？谁没有被算进去？','你要先核对哪件事，才不会把假设当成事实？'];
export function parsePressureCommand(value:unknown):PressureCommand{return pressureCommandSchema.parse(value);}
export type PressureReceipt={signature:string;requestId:string};
export function pressureReceipt(previous:PressureReceipt|null,input:unknown,newId:()=>string):PressureReceipt{const signature=JSON.stringify(input);return previous?.signature===signature?previous:{signature,requestId:newId()};}
export function pressureVerifyTransition(base:{id:string;revision:number},incoming:{id:string;revision:number}|null,pending=false):'missing'|'conflict'|'refresh'{return !incoming||incoming.id!==base.id?'missing':pending||incoming.revision!==base.revision?'conflict':'refresh';}
export function pressurePayload(casePublicName:string,plan:PressurePlan){return {casePublicName,hypotheticalScenario:plan.changedCondition,ownAction:plan.action,explanation:{tradeoff:plan.tradeoff,checkNext:plan.checkNext}};}
export function pressurePreview(casePublicName:string,plan:PressurePlan):string{return JSON.stringify(pressurePayload(casePublicName,plan),null,2);}
export const PRESSURE_QUESTION_ANGLES={premise:'你写下的这个选择依赖哪项还没有核对的前提？',stop:'如果这个选择不成立，你准备先停下哪一步？',cost:'这段回答里，谁可能承担你尚未写明的代价？',check:'你准备怎样核对这段回答，才不会把假设当成事实？'} as const;
const quoteSchema=z.string().min(1).max(500).refine(v=>v.trim().length>0);
const questionKey=z.enum(['premise','stop','cost','check']);
const providerQuestionsSchema=z.object({questions:z.array(z.object({questionKey,answerQuote:quoteSchema}).strict()).min(1).max(3)}).strict();
export const pressureQuestionsSchema=z.object({questions:z.array(z.object({question:z.enum([PRESSURE_QUESTION_ANGLES.premise,PRESSURE_QUESTION_ANGLES.stop,PRESSURE_QUESTION_ANGLES.cost,PRESSURE_QUESTION_ANGLES.check]),answerQuote:quoteSchema}).strict()).min(1).max(3)}).strict();
export function parsePressureQuestions(raw:string,plan:PressurePlan):PressureQuestions{const result=providerQuestionsSchema.parse(JSON.parse(raw));const answers=[plan.action,plan.tradeoff,plan.checkNext];if(result.questions.some(q=>!answers.some(a=>a.includes(q.answerQuote))))throw new Error('追问没有引用你回答里的原话');return {questions:result.questions.map(q=>({question:PRESSURE_QUESTION_ANGLES[q.questionKey],answerQuote:q.answerQuote}))};}
