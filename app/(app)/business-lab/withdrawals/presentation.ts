import type {WithdrawalCommand} from '@/lib/domains/business-teardowns/withdrawals/domain';
export function pinWithdrawalRequest(previous:WithdrawalCommand|null,next:WithdrawalCommand):WithdrawalCommand{return previous??structuredClone(next);}
export function hideErasedWithdrawals<T extends {id:string}>(items:T[],erased:ReadonlySet<string>):T[]{return items.filter(item=>!erased.has(item.id));}
export function withdrawalComparisonHref(lesson:{id:string;caseId:string|null;revision:number;explanationA:string|null;explanationB:string|null}):string|null{
 if(!lesson.caseId||!lesson.explanationA?.trim()||!lesson.explanationB?.trim())return null;
 return `/business-lab/explanations?kind=withdrawal&lessonId=${lesson.id}&lessonRevision=${lesson.revision}&caseId=${lesson.caseId}`;
}
