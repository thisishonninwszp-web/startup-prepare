import {z} from 'zod';
export const uuid=z.string().uuid();
const text=z.string().trim().min(1).max(4000);
const feedbackSchema=z.object({ideaId:uuid,requestId:uuid,sourceKind:z.enum(['validation','manual_contact','no_reply']),validationId:uuid.optional(),outreachCanvasId:uuid.optional(),sourceNote:z.string().max(20000).nullable().optional(),contactedAt:z.string().datetime({offset:true}).nullable().optional(),verbatim:z.boolean().optional(),roleContext:text,interpretation:text}).strict().superRefine((v,c)=>{
 if(v.sourceKind==='validation'&&(!v.validationId||v.sourceNote!==undefined||v.contactedAt!==undefined||v.verbatim===true))c.addIssue({code:'custom',message:'验证来源只允许服务器复制备注、信号和时间；不自动视为逐字原话'});
 if(v.sourceKind!=='validation'&&v.validationId)c.addIssue({code:'custom',message:'手动来源不能关联验证信号'});
 if(v.sourceKind==='no_reply'&&v.verbatim)c.addIssue({code:'custom',message:'无回复不能声明客户原话'});
 if(v.verbatim&&!v.sourceNote?.trim())c.addIssue({code:'custom',message:'逐字原话需要保留原文'});
});
const linkSchema=z.object({feedbackId:uuid,targetIdeaId:uuid,requestId:uuid,expectedLinkId:uuid.nullable(),action:z.enum(['confirm','retract']),assumption:z.string().trim().max(4000),scope:z.string().trim().max(4000),limits:z.string().trim().max(4000),unknown:z.string().trim().max(4000)}).strict().superRefine((v,c)=>{if(v.action==='confirm'&&[v.assumption,v.scope,v.limits,v.unknown].some(s=>!s))c.addIssue({code:'custom',message:'请写明假设、适用群体/情境、局限及反例/未知'});});
export type FeedbackInput=z.infer<typeof feedbackSchema>;
export type FeedbackLinkInput=z.infer<typeof linkSchema>;
export const normalizeFeedback=(input:FeedbackInput)=>feedbackSchema.parse(input);
export const normalizeFeedbackLink=(input:FeedbackLinkInput)=>linkSchema.parse(input);
export type Feedback={id:string;user_id:string;idea_id:string;revision:number;source_kind:FeedbackInput['sourceKind'];validation_id:string|null;outreach_canvas_id:string|null;source_note:string|null;source_has_pain:'yes'|'no'|'unsure'|null;source_will_pay:'yes'|'no'|'unsure'|null;contacted_at:string|null;verbatim:boolean;role_context:string;interpretation:string;created_at:string};
export type FeedbackLink={id:string;user_id:string;feedback_id:string;target_idea_id:string;revision:number;action:'confirm'|'retract';expected_link_id:string|null;assumption:string;scope:string;limits:string;unknown:string;created_at:string};
export function isMissingFeedbackSchema(error:{code?:string;message?:string}){return ['42P01','42883','PGRST202','PGRST205'].includes(error.code??'');}
