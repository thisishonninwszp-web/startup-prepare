import Link from 'next/link';
import {sameActionForKnownOutcomes,type ActionChoiceView} from '@/lib/domains/business-teardowns/action-choices/domain';
import {ACTION_TARGET_LABELS,actionText} from './presentation';
export {ACTION_TARGET_LABELS,actionText} from './presentation';
export function ActionChoiceSummary({value}:{value:ActionChoiceView}){
 const {choice}=value;
 return <section className="min-w-0 space-y-4 border-t pt-4 text-sm leading-7" aria-label="当时保存的行动约定">
  <h3 className="font-medium">这次调查会影响哪个选择</h3>
  <p className="whitespace-pre-wrap break-words">{choice.decision}</p>
  <dl className="grid min-w-0 gap-4 sm:grid-cols-3">{(['current','alternative','hold'] as const).map(target=><div key={target} className="min-w-0 space-y-1"><dt className="text-muted-foreground">{ACTION_TARGET_LABELS[target]}</dt><dd className="whitespace-pre-wrap break-words">{actionText(choice,target)}</dd></div>)}</dl>
  <dl className="min-w-0 space-y-3">{[{key:'a' as const,label:'观察 A',condition:value.conditionA},{key:'b' as const,label:'观察 B',condition:value.conditionB},{key:'unclear' as const,label:'两者都有、都不符合，或材料不足',condition:'当时无法按 A/B 区分时'}].map(branch=><div className="min-w-0 space-y-1 rounded-md border p-3" key={branch.key}><dt className="font-medium">{branch.label}</dt><dd className="whitespace-pre-wrap break-words">{branch.condition}</dd><dd className="whitespace-pre-wrap break-words text-muted-foreground">当时约定：{ACTION_TARGET_LABELS[choice.mapping[branch.key]]} · {actionText(choice,choice.mapping[branch.key])}</dd></div>)}</dl>
  {sameActionForKnownOutcomes(choice)&&<p className="rounded-md border border-dashed p-3">这两种结果目前会采取相同行动；区分它们暂时不会改变这个选择。材料不足时的行动可能不同，仍由你决定是否继续调查。</p>}
  {choice.relatedIdeaId&&(value.ideaAvailable&&value.ideaTitle!==null?<p>关联想法：<Link href={`/ideas/${choice.relatedIdeaId}`} className="break-words underline">{value.ideaTitle||'查看关联想法'}</Link></p>:<p className="text-muted-foreground">关联想法目前不可读取；本人保存的行动约定仍保留。</p>)}
  <p className="text-muted-foreground">这是这个计划版本保存的本人约定。观察条件不代表解释已成立，约定也不代表行动已执行。</p>
 </section>;
}
