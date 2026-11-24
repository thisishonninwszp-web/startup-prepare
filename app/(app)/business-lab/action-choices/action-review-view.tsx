import {expectedAction,type ActionChoiceView,type ActionReview} from '@/lib/domains/business-teardowns/action-choices/domain';
import {ACTION_TARGET_LABELS,ACTION_OUTCOME_LABELS,actionText} from './presentation';

export function ActionReviewView({value,choice}:{value:ActionReview;choice?:ActionChoiceView}){
 const expected=choice?expectedAction(choice.choice,value.outcome):null;
 const chosen=value.nextAction==='other'?value.otherAction:choice?actionText(choice.choice,value.nextAction):ACTION_TARGET_LABELS[value.nextAction];
 return <section className="min-w-0 space-y-4 border-t pt-4 text-sm leading-7" aria-label="本人保存的行动对照">
  <h3 className="font-medium">这次调查怎样影响下一步</h3>
  <dl className="space-y-4"><div><dt className="text-muted-foreground">本次资料的情况（本人判断）</dt><dd>{ACTION_OUTCOME_LABELS[value.outcome]}</dd></div>{choice&&expected&&<div><dt className="text-muted-foreground">按当时约定，对应的行动</dt><dd className="whitespace-pre-wrap break-words">{actionText(choice.choice,expected)}</dd></div>}<div><dt className="text-muted-foreground">本次保存时准备采取的行动</dt><dd className="whitespace-pre-wrap break-words">{chosen}</dd></div><div><dt className="text-muted-foreground">本人写的选择理由</dt><dd className="whitespace-pre-wrap break-words">{value.reason}</dd></div></dl>
  {expected&&value.nextAction!==expected&&<p className="text-muted-foreground">这次选择与当时约定的行动不同。两次记录和本人理由都保留，不自动判定对错。</p>}
  {!choice&&<p className="text-muted-foreground">原约定当前不可读取。仅显示本人保存的选择与理由，不恢复原行动文字。</p>}
  {value.execution?<div className="space-y-2 border-l-2 pl-4"><h4 className="font-medium">本人记录的实际执行</h4><p className="whitespace-pre-wrap break-words">{value.execution.what}</p><p>执行日期（东京，本人填写）：<time dateTime={value.execution.actedOn}>{value.execution.actedOn}</time></p></div>:<p className="text-muted-foreground">尚未记录实际执行；准备采用的行动不计为已完成。</p>}
 </section>;
}
