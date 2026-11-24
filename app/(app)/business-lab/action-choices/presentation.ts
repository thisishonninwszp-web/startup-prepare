import type {ActionChoiceInput,ActionReview,ActionTarget} from '@/lib/domains/business-teardowns/action-choices/domain';
export const ACTION_TARGET_LABELS:Record<ActionTarget,string>={current:'原行动',alternative:'另一行动',hold:'暂缓时的行动'};
export const ACTION_OUTCOME_LABELS:Record<ActionReview['outcome'],string>={a:'本次资料只符合观察 A',b:'本次资料只符合观察 B',both:'两种观察都有',neither:'两种观察都不符合',unclear:'材料仍不足以区分'};
export function actionText(choice:ActionChoiceInput,target:ActionTarget):string{return target==='current'?choice.currentAction:target==='alternative'?choice.alternativeAction:choice.holdAction;}
