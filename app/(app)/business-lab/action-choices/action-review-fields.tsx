'use client';
import type {ActionChoiceView,ActionReview} from '@/lib/domains/business-teardowns/action-choices/domain';
import {ACTION_TARGET_LABELS,ACTION_OUTCOME_LABELS,actionText} from './presentation';

export type ActionReviewDraft=Omit<ActionReview,'outcome'|'nextAction'>&{outcome:ActionReview['outcome']|'';nextAction:ActionReview['nextAction']|''};
export function blankActionReviewDraft():ActionReviewDraft{return {outcome:'',nextAction:'',otherAction:null,reason:'',execution:null};}
export function ActionReviewFields({value,choice,today,onChange,disabled=false}:{value:ActionReviewDraft|null;choice:ActionChoiceView;today:string;onChange:(value:ActionReviewDraft|null)=>void;disabled?:boolean}){
 const fieldClass='block w-full min-w-0 rounded-md border bg-background p-3 leading-7';
 const patch=(next:Partial<ActionReviewDraft>)=>{if(value&&!disabled)onChange({...value,...next});};
 return <section className="min-w-0 space-y-4 border-t pt-4" aria-label="填写本次行动对照">
  <label className="flex items-start gap-3 text-sm leading-7"><input type="checkbox" name="actionReviewEnabled" className="mt-2" checked={value!==null} disabled={disabled} onChange={event=>onChange(event.target.checked?blankActionReviewDraft():null)}/><span>记录这次调查怎样影响下一步（可选）</span></label>
  {value&&<fieldset disabled={disabled} className="min-w-0 space-y-4"><legend className="mb-3 text-sm font-medium">把实际发现与当时的选择分开记录</legend>
   <label className="block min-w-0 space-y-2 text-sm"><span>本次资料与观察条件的关系（本人判断）</span><select name="actionOutcome" required value={value.outcome} className={fieldClass} onChange={event=>patch({outcome:event.target.value as ActionReviewDraft['outcome']})}><option value="">请选择本次资料的情况</option>{Object.entries(ACTION_OUTCOME_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <label className="block min-w-0 space-y-2 text-sm"><span>现在准备采取什么行动</span><select name="actionNext" required value={value.nextAction} className={fieldClass} onChange={event=>{const nextAction=event.target.value as ActionReviewDraft['nextAction'];patch({nextAction,otherAction:nextAction==='other'?value.otherAction??'':null});}}><option value="">请选择现在准备采取的行动</option>{(['current','alternative','hold'] as const).map(target=><option key={target} value={target}>{ACTION_TARGET_LABELS[target]} · {actionText(choice.choice,target)}</option>)}<option value="other">采取另一个行动，由我写明</option></select></label>
   {value.nextAction==='other'&&<label className="block space-y-2 text-sm"><span>另一个具体行动</span><textarea name="actionOther" required maxLength={2000} rows={3} value={value.otherAction??''} className={fieldClass} onChange={event=>patch({otherAction:event.target.value})}/></label>}
   <label className="block space-y-2 text-sm"><span>我为什么这样选择</span><textarea name="actionReason" required maxLength={3000} rows={3} value={value.reason} className={fieldClass} onChange={event=>patch({reason:event.target.value})}/></label>
   <label className="flex items-start gap-3 text-sm leading-7"><input type="checkbox" name="actionExecutionRecorded" className="mt-2" checked={value.execution!==null} onChange={event=>patch({execution:event.target.checked?{what:'',actedOn:''}:null})}/><span>我已经实际做过一件事，要另外记录下来</span></label>
   {value.execution&&<div className="min-w-0 space-y-4 border-l-2 pl-4"><label className="block space-y-2 text-sm"><span>实际做了什么（本人填写）</span><textarea name="actionExecuted" required maxLength={3000} rows={3} className={fieldClass} value={value.execution.what} onChange={event=>patch({execution:{...value.execution!,what:event.target.value}})}/></label><label className="block space-y-2 text-sm"><span>实际执行日期（东京，本人填写）</span><input name="actionActedOn" type="date" required min="1900-01-01" max={today} className={fieldClass} value={value.execution.actedOn} onChange={event=>patch({execution:{...value.execution!,actedOn:event.target.value}})}/></label></div>}
   <p className="text-sm leading-7 text-muted-foreground">选择由你记录，允许仍然未知，也允许改变原约定。准备采取的行动与已经执行的记录分别保留。</p>
  </fieldset>}
 </section>;
}
