import type {RealityCheckPlan,RealityCheckSourceState} from '@/lib/domains/business-teardowns/reality-checks/domain';

const fields=[{name:'question',label:'要确认的问题',limit:1000},{name:'falsifier',label:'看到什么会推翻我的想法',limit:3000},{name:'method',label:'具体怎样去确认',limit:3000}] as const;
export function PlanFields({plan,onChange}:{plan:RealityCheckPlan;onChange:(patch:Partial<RealityCheckPlan>)=>void}){
 return <div className="space-y-4">{fields.map(field=><label key={field.name} className="block space-y-2 text-sm"><span>{field.label}</span><textarea name={field.name} required maxLength={field.limit} rows={3} className="block w-full min-w-0 rounded-md border bg-background p-3 leading-7" value={plan[field.name]} onChange={e=>onChange({[field.name]:e.target.value})}/></label>)}<label className="block space-y-2 text-sm"><span>截止日期（东京）</span><input name="dueDate" type="date" required min="1900-01-01" max="2200-12-31" className="block min-h-11 w-full min-w-0 rounded-md border bg-background p-2" value={plan.dueDate} onChange={e=>onChange({dueDate:e.target.value})}/></label></div>;
}
export function PlanPreview({plan}:{plan:RealityCheckPlan}){return <dl className="space-y-4 text-sm leading-7">{[...fields.map(f=>({label:f.label,value:plan[f.name]})),{label:'截止日期（东京）',value:plan.dueDate}].map(item=><div key={item.label}><dt className="text-muted-foreground">{item.label}</dt><dd className="whitespace-pre-wrap break-words">{item.value}</dd></div>)}</dl>;}
export function SourceNotes({source}:{source:RealityCheckSourceState|null}){
 if(!source)return <p className="text-sm leading-7 text-muted-foreground">先在经营演练保存一回合，再选择来源。</p>;
 if(!source?.available)return <p className="text-sm leading-7 text-muted-foreground">来源目前不可读取。已经保存的独立计划仍可编辑和删除。</p>;
 return <aside className="space-y-3 border-l-2 border-border pl-4 text-sm leading-7"><p className="font-medium">假设演练中的本人记录 · 不是现实验证</p><p className="break-words">{source.title}{source.caseAvailable&&source.caseTitle?` · 案例标题：${source.caseTitle}`:''}</p><dl className="space-y-3"><div><dt className="text-muted-foreground">当时的理由（假设）</dt><dd className="whitespace-pre-wrap break-words">{source.reason}</dd></div><div><dt className="text-muted-foreground">当时写的下一步（假设）</dt><dd className="whitespace-pre-wrap break-words">{source.checkNext}</dd></div></dl></aside>;
}
