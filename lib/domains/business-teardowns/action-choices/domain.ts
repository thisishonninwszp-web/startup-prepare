import {z} from 'zod';
import {cashDate,cashUuid} from '../cash/domain';
const own=(max:number)=>z.string().trim().min(1,'请亲手填写这一项').refine(value=>value.length<=max,'文字太长');
export const actionTargetSchema=z.enum(['current','alternative','hold']);
export const actionChoiceInputSchema=z.object({
 decision:own(1000),currentAction:own(2000),alternativeAction:own(2000),holdAction:own(2000),
 conditions:z.discriminatedUnion('kind',[z.object({kind:z.literal('expectations')}).strict(),z.object({kind:z.literal('explicit'),a:own(3000),b:own(3000)}).strict()]),
 mapping:z.object({a:actionTargetSchema,b:actionTargetSchema,unclear:actionTargetSchema}).strict(),relatedIdeaId:cashUuid.nullable(),
}).strict();
export const actionChoiceViewSchema=z.object({choice:actionChoiceInputSchema,conditionA:own(3000),conditionB:own(3000),ideaAvailable:z.boolean(),ideaTitle:z.string().nullable()}).strict().refine(value=>
 value.ideaAvailable===(value.ideaTitle!==null)&&(!value.ideaAvailable||value.choice.relatedIdeaId!==null)&&
 (value.choice.conditions.kind==='expectations'||(value.conditionA===value.choice.conditions.a&&value.conditionB===value.choice.conditions.b)),
 '行动约定的条件或想法状态不一致');
export const actionReviewSchema=z.object({
 outcome:z.enum(['a','b','both','neither','unclear']),nextAction:z.enum(['current','alternative','hold','other']),otherAction:own(2000).nullable(),reason:own(3000),
 execution:z.object({what:own(3000),actedOn:cashDate}).strict().nullable(),
}).strict().refine(value=>(value.nextAction==='other')===(value.otherAction!==null),'选择其他行动时请写明行动');
export type ActionTarget=z.infer<typeof actionTargetSchema>;
export type ActionConditions=z.infer<typeof actionChoiceInputSchema>['conditions'];
export type ActionChoiceInput=z.infer<typeof actionChoiceInputSchema>;
export type ActionChoiceView=z.infer<typeof actionChoiceViewSchema>;
export type ActionReview=z.infer<typeof actionReviewSchema>;
export type ActionChoiceIdeas={available:boolean;items:{id:string;title:string}[];nextCursor:string|null};
export function sameActionForKnownOutcomes(choice:ActionChoiceInput):boolean{return choice.mapping.a===choice.mapping.b;}
export function expectedAction(choice:ActionChoiceInput,outcome:ActionReview['outcome']):ActionTarget{return outcome==='a'||outcome==='b'?choice.mapping[outcome]:choice.mapping.unclear;}
export function actionCommandWithinLimit(value:unknown):boolean{return new TextEncoder().encode(JSON.stringify(value)).length<=160000;}
export function actionChoiceMatchesExpectations(view:ActionChoiceView|undefined,expectations?:{expectedA:string;expectedB:string}):boolean{
 if(!view)return true;
 return expectations?view.choice.conditions.kind==='expectations'&&view.conditionA===expectations.expectedA&&view.conditionB===expectations.expectedB:view.choice.conditions.kind==='explicit';
}
