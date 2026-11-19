import type {RealityCheckPlan} from '@/lib/domains/business-teardowns/reality-checks/domain';
import type {RealityResultBody} from '@/lib/domains/business-teardowns/reality-results/domain';

const fields=[{name:'examined',label:'实际查了什么',limit:3000},{name:'found',label:'实际查到了什么',limit:6000},{name:'sourceNote',label:'出处说明（人、地点、材料或记录）',limit:3000},{name:'learned',label:'这次让我的想法怎样改变',limit:3000}] as const;
export function tokyoDay(date:Date|string){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(typeof date==='string'?new Date(date):date);
 const value=(type:string)=>parts.find(part=>part.type===type)!.value;
 return `${value('year')}-${value('month')}-${value('day')}`;
}
export function TimingNote({checkedOn,savedAt}:{checkedOn:string;savedAt:string}){
 if(!checkedOn)return null;
 const savedDay=tokyoDay(savedAt);
 return <p className="rounded-md border border-border p-3 text-sm leading-7">{checkedOn<savedDay?'计划在你所填的调查日期之后才保存，不能视为事先约定的条件。':checkedOn===savedDay?'计划与调查日期在同一天，先后顺序无法证明。':'调查日期由你填写；保存时间只能说明计划何时记录，不能证明调查过程。'}</p>;
}
export function ResultFields({body,onChange,today}:{body:RealityResultBody;onChange:(patch:Partial<RealityResultBody>)=>void;today:string}){
 return <div className="min-w-0 space-y-4"><label className="block space-y-2 text-sm"><span>实际调查日期（本人填写，东京日期）</span><input name="checkedOn" type="date" required min="1900-01-01" max={today} className="block min-h-11 w-full min-w-0 rounded-md border bg-background p-2" value={body.checkedOn} onChange={e=>onChange({checkedOn:e.target.value})}/></label>{fields.map(field=><label key={field.name} className="block space-y-2 text-sm"><span>{field.label}</span><textarea name={field.name} required maxLength={field.limit} rows={field.name==='found'?5:3} className="block w-full min-w-0 rounded-md border bg-background p-3 leading-7" value={body[field.name]} onChange={e=>onChange({[field.name]:e.target.value})}/></label>)}<label className="block space-y-2 text-sm"><span>出处网址（可选，仅 HTTPS）</span><input name="sourceUrl" type="url" maxLength={2000} className="block min-h-11 w-full min-w-0 rounded-md border bg-background p-3" value={body.sourceUrl??''} onChange={e=>onChange({sourceUrl:e.target.value||null})}/></label><p className="text-sm leading-7 text-muted-foreground">日期、出处与网址由你提供，未自动核验。线下调查只需写清出处说明；这里不会读取网址内容。</p></div>;
}
function safeUrl(value:string|null){
 if(!value||value.length>2000||/\s|[\u0000-\u001f\u007f\\]/.test(value)||!value.startsWith('https://'))return null;
 try{const url=new URL(value);return url.protocol==='https:'&&url.hostname&&!url.username&&!url.password?value:null;}catch{return null;}
}
export function ResultBody({body}:{body:RealityResultBody}){
 const href=safeUrl(body.sourceUrl);
 return <div className="min-w-0 space-y-4"><dl className="space-y-4 text-sm leading-7"><div><dt className="text-muted-foreground">实际调查日期（本人填写，东京日期）</dt><dd>{body.checkedOn}</dd></div>{fields.map(field=><div key={field.name}><dt className="text-muted-foreground">{field.label}</dt><dd className="whitespace-pre-wrap break-words">{body[field.name]}</dd></div>)}</dl>{href&&<p className="break-all text-sm leading-7"><a href={href} target="_blank" rel="noopener noreferrer" className="underline">{href}</a></p>}<p className="text-sm leading-7 text-muted-foreground">日期、出处与网址由你提供，未自动核验。</p></div>;
}
export function PlanSnapshot({plan,revision,savedAt,selected,erased,caseUnavailable}:{plan:RealityCheckPlan|null;revision:number;savedAt?:string;selected:boolean;erased:boolean;caseUnavailable:boolean}){
 if(!selected)return <p className="text-sm leading-7 text-muted-foreground">先保存一份确认计划，再选择计划版本。没有计划时，请返回确认计划页。</p>;
 if(!plan)return <p className="text-sm leading-7 text-muted-foreground">{erased?'原计划已删除，原条件文字已擦除。独立调查正文仍可查看或擦除。':'原计划版本目前不可读取。条件文字暂时隐藏；独立调查正文仍保留。'}</p>;
 return <div className="min-w-0 space-y-4"><p className="text-sm leading-7">本人保存的计划 · 第 {revision} 版{savedAt?` · 东京保存日期 ${tokyoDay(savedAt)}`:''}</p>{savedAt&&<p className="break-words text-xs leading-6 text-muted-foreground">服务器保存时间：{savedAt}</p>}{caseUnavailable&&<p className="text-sm leading-7 text-muted-foreground">案例目前不可读取；这份本人保存的计划版本仍可用于对照。</p>}<dl className="space-y-4 text-sm leading-7">{[{label:'当时要确认的问题',value:plan.question},{label:'当时写的推翻条件',value:plan.falsifier},{label:'当时写的确认做法',value:plan.method},{label:'当时的截止日期（东京）',value:plan.dueDate}].map(item=><div key={item.label}><dt className="text-muted-foreground">{item.label}</dt><dd className="whitespace-pre-wrap break-words">{item.value}</dd></div>)}</dl><p className="text-sm leading-7 text-muted-foreground">这是选定版本的原文。后来的计划修改不会替换这里的条件。</p></div>;
}
