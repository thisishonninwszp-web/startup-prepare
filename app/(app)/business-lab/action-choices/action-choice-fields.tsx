'use client';
import {Button} from '@/components/ui/button';
import {sameActionForKnownOutcomes,type ActionChoiceInput,type ActionTarget} from '@/lib/domains/business-teardowns/action-choices/domain';
import {ACTION_TARGET_LABELS} from './presentation';
import type {useActionChoiceIdeas} from './use-action-choice-ideas';
export function blankActionChoice(mode:'explicit'|'expectations'):ActionChoiceInput{
 // Blank select values are editor-only; the domain schema rejects them at preview.
 return {decision:'',currentAction:'',alternativeAction:'',holdAction:'',conditions:mode==='explicit'?{kind:'explicit',a:'',b:''}:{kind:'expectations'},mapping:{a:'' as ActionTarget,b:'' as ActionTarget,unclear:'' as ActionTarget},relatedIdeaId:null};
}
export type ActionChoiceFieldsProps={value:ActionChoiceInput|null;onChange:(value:ActionChoiceInput|null)=>void;conditionsMode:'explicit'|'expectations';currentExpectations?:{expectedA:string;expectedB:string};disabled?:boolean;ideas?:ReturnType<typeof useActionChoiceIdeas>};
export function ActionChoiceFields({value,onChange,conditionsMode,currentExpectations,disabled=false,ideas}:ActionChoiceFieldsProps){
 const unavailable=ideas?.available===false;
 return <section className="min-w-0 space-y-4 border-t pt-4" aria-label="行动选择约定">
  <div className="flex flex-wrap items-center gap-3"><h3 className="text-base font-medium">这次调查会影响哪个选择</h3><Button type="button" variant="outline" disabled={disabled||(!value&&!!ideas&&ideas.available!==true)} aria-expanded={value!==null} onClick={()=>onChange(value?null:blankActionChoice(conditionsMode))}>{value?'本版不使用行动约定':'填写行动约定（可选）'}</Button></div>
  <p className="text-sm leading-7 text-muted-foreground">由你亲手写下选择与具体行动；不填写也可以保存原计划。</p>
  {ideas?.message&&<p role="status" className="text-sm leading-7">{ideas.message}</p>}
  {unavailable&&<p role="status" className="text-sm leading-7">行动约定暂不可用，请先执行数据库迁移 151。已有计划仍可阅读；已填写的约定会保留。</p>}
  {value&&<fieldset disabled={disabled} className="min-w-0 space-y-5">
   {([['decision','这次在决定什么',1000],['currentAction','目前准备采取的具体行动',2000],['alternativeAction','另一种可采取的具体行动',2000],['holdAction','暂不决定时，具体先做什么',2000]] as const).map(([key,label,max])=><label key={key} className="block min-w-0 space-y-2 text-sm"><span>{label}</span><textarea name={key} rows={3} maxLength={max} value={value[key]} onChange={event=>onChange({...value,[key]:event.target.value})} className="w-full min-w-0 rounded-md border bg-background p-3 leading-7"/></label>)}
   {conditionsMode==='expectations'?<div className="space-y-3 text-sm leading-7"><p className="text-muted-foreground">直接使用上方本人正在编辑的预期，不代表解释已成立。</p><p className="whitespace-pre-wrap break-words">观察 A：{currentExpectations?.expectedA||'请先填写上方预期 A'}</p><p className="whitespace-pre-wrap break-words">观察 B：{currentExpectations?.expectedB||'请先填写上方预期 B'}</p></div>:value.conditions.kind==='explicit'&&(['a','b'] as const).map(key=><label key={key} className="block min-w-0 space-y-2 text-sm"><span>亲手写下可观察条件 {key.toUpperCase()}</span><textarea name={key==='a'?'conditionA':'conditionB'} rows={3} maxLength={3000} value={value.conditions.kind==='explicit'?value.conditions[key]:''} onChange={event=>onChange({...value,conditions:{...(value.conditions as {kind:'explicit';a:string;b:string}),[key]:event.target.value}})} className="w-full min-w-0 rounded-md border bg-background p-3 leading-7"/></label>)}
   {([['a','只符合观察 A 时'],['b','只符合观察 B 时'],['unclear','两者都有、都不符合，或材料不足时']] as const).map(([key,label])=><label key={key} className="block space-y-2 text-sm"><span>{label}，准备采取哪个行动</span><select name={`mapping-${key}`} value={value.mapping[key]} onChange={event=>onChange({...value,mapping:{...value.mapping,[key]:event.target.value as ActionTarget}})} className="min-h-11 w-full min-w-0 rounded-md border bg-background p-2"><option value="">请选择行动</option>{(['current','alternative','hold'] as const).map(target=><option key={target} value={target}>{ACTION_TARGET_LABELS[target]}</option>)}</select></label>)}
   {value.mapping.a&&value.mapping.b&&sameActionForKnownOutcomes(value)&&<p className="rounded-md border border-dashed p-3 text-sm leading-7">这两种结果目前会采取相同行动；区分它们暂时不会改变这个选择。材料不足时的行动可能不同，仍由你决定是否继续调查。</p>}
   <label className="block space-y-2 text-sm"><span>关联本人想法（可选）</span><select name="relatedIdeaId" disabled={!!ideas&&ideas.available!==true} value={value.relatedIdeaId??''} onChange={event=>onChange({...value,relatedIdeaId:event.target.value||null})} className="min-h-11 w-full min-w-0 rounded-md border bg-background p-2"><option value="">不关联想法</option>{value.relatedIdeaId&&!ideas?.items.some(item=>item.id===value.relatedIdeaId)&&<option value={value.relatedIdeaId}>{ideas?.linked?.choice.relatedIdeaId===value.relatedIdeaId&&ideas.linked.ideaAvailable?(ideas.linked.ideaTitle||'本人想法（未填写标题）'):'关联想法目前不可读取'}</option>}{ideas?.items.map(item=><option key={item.id} value={item.id}>{item.title||'本人想法（未填写标题）'}</option>)}</select></label>
   {ideas?.nextCursor&&<Button type="button" variant="outline" disabled={disabled||ideas.loading} onClick={()=>void ideas.more()}>更多本人想法</Button>}
   {ideas&&<Button type="button" variant="outline" disabled={disabled||ideas.loading} onClick={()=>void ideas.refresh()}>重新读取本人想法</Button>}
  </fieldset>}
 </section>;
}
