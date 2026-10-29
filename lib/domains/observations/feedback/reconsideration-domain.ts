import {z} from 'zod';
export const reconsiderationUuid=z.string().uuid();
const text=z.string().trim().min(1).max(4000);
const url=z.string().url().max(8000).refine(v=>/^https?:\/\//i.test(v)&&!new URL(v).username&&!new URL(v).password,'只接受无凭据 HTTP/HTTPS 来源');
const quote=z.string().trim().min(1).max(20000);
export const conditionSchema=z.object({learned:text,changeRequired:text,criterion:text,scope:text,decisionId:reconsiderationUuid.nullable().optional()}).strict();
const sourceSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('manual'),url,rawText:z.string().min(1).max(100000),quote}).strict(),
 z.object({kind:z.literal('observation_run'),runId:reconsiderationUuid,recordIndex:z.number().int().min(0).max(499),quote}).strict(),
 z.object({kind:z.literal('company_entry'),entryId:reconsiderationUuid,quote}).strict(),
]);
export const evaluationSchema=z.object({outcome:z.enum(['met','not_met','unknown']),coverage:text,source:sourceSchema}).strict().superRefine((v,c)=>{if(v.source.kind==='manual'&&!v.source.rawText.includes(v.source.quote))c.addIssue({code:'custom',message:'原话必须出现在实际材料中'});});
export type ConditionInput=z.infer<typeof conditionSchema>;
export type EvaluationInput=z.infer<typeof evaluationSchema>;
export type ReconsiderationWriteInput={ideaId:string;requestId:string;expectedVersionId:string|null};
export type SaveReconsiderationInput=ReconsiderationWriteInput&ConditionInput;
export type EvaluateReconsiderationInput=ReconsiderationWriteInput&EvaluationInput;
export type AcknowledgeReconsiderationInput=ReconsiderationWriteInput&{cueId:string};
export type ReconsiderationEntry={id:string;idea_id:string;revision:number;kind:'condition'|'retract'|'evaluation'|'cue'|'ack';condition_version_id:string|null;learned:string|null;change_required:string|null;criterion:string|null;scope:string|null;outcome:'met'|'not_met'|'unknown'|null;coverage:string|null;source_snapshot:Record<string,unknown>|null;cue_id:string|null;created_at:string};
export function normalizeCondition(input:unknown){return conditionSchema.parse(input);}
export function normalizeEvaluation(input:unknown){return evaluationSchema.parse(input);}
export function parseReconsiderationCursor(value:string){if(!/^[1-9]\d{0,18}$/.test(value)||BigInt(value)>BigInt('9223372036854775807'))throw new Error('无效分页位置');return value;}
export function isMissingReconsiderationSchema(error:{code?:string;message:string}){return ['42P01','PGRST205','42883','PGRST202'].includes(error.code??'')&&/idea_reconsideration|reconsideration/.test(error.message);}

