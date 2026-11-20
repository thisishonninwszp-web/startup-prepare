import type {ResultMethodDraft} from '@/lib/domains/business-teardowns/result-methods/domain';

const fields=[{name:'method',label:'我会怎样做'},{name:'scenario',label:'什么场景下会用到'},{name:'conditions',label:'要先满足什么条件'},{name:'failureConditions',label:'遇到什么情况就不适用'},{name:'unknowns',label:'还有什么没弄清'}] as const;
export function MethodFields({draft,onChange,disabled=false}:{draft:ResultMethodDraft;onChange:(patch:Partial<ResultMethodDraft>)=>void;disabled?:boolean}){
 return <div className="min-w-0 space-y-4">{fields.map(field=><label key={field.name} className="block space-y-2 text-sm"><span>{field.label}</span><textarea name={field.name} required maxLength={6000} rows={3} disabled={disabled} className="block w-full min-w-0 rounded-md border bg-background p-3 leading-7 disabled:opacity-60" value={draft[field.name]} onChange={e=>onChange({[field.name]:e.target.value})}/></label>)}</div>;
}
export function MethodBody({draft}:{draft:ResultMethodDraft}){
 return <dl className="min-w-0 space-y-4 text-sm leading-7">{fields.map(field=><div key={field.name}><dt className="text-muted-foreground">{field.label}</dt><dd className="whitespace-pre-wrap break-words">{draft[field.name]}</dd></div>)}</dl>;
}
