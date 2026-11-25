'use client';

import Link from 'next/link';
import {ActionChoiceFields} from '../../action-choices/action-choice-fields';
import {ActionChoiceSummary} from '../../action-choices/action-choice-view';
import {useActionChoiceEditor} from '../../action-choices/use-action-choice-ideas';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {ConfirmButton} from '@/components/ui/confirm-button';
import {realityCheckPlanSchema,type RealityCheckCommand,type RealityCheckList,type RealityCheckPlan,type RealityCheckRecord,type RealityCheckSource,type RealityCheckSourcePage} from '@/lib/domains/business-teardowns/reality-checks/domain';
import {realityChecksListAction,realityCheckGetAction,realityCheckSourcesAction,realityCheckSourceAction,realityCheckSaveAction} from './actions';
import {PlanFields,PlanPreview,SourceNotes} from './reality-checks-views';

export type RealityChecksPanelProps={initialState:RealityCheckList;initialSources:RealityCheckSourcePage;initialRecord?:RealityCheckRecord|null;initialSource?:RealityCheckSource|null;initialRound?:number;caseId?:string;simulationId?:string;today:string};
const blank=():RealityCheckPlan=>({question:'',falsifier:'',method:'',dueDate:''});
const errorText=(e:unknown)=>e instanceof Error?e.message:'暂时没有完成，请重试。';
export function RealityChecksPanel({initialState,initialSources,initialRecord=null,initialSource=null,initialRound,caseId,simulationId,today}:RealityChecksPanelProps){
 const [state,setState]=useState(initialState),[sources,setSources]=useState(initialSources);
 const [active,setActive]=useState(initialRecord),[source,setSource]=useState(initialSource);
 const [sourceId,setSourceId]=useState(initialRecord?.simulationId??initialSource?.id??simulationId??'');
 const [round,setRound]=useState(initialRecord?.round??initialRound??1);
 const [draft,setDraft]=useState<RealityCheckPlan>(initialRecord?.plan??blank);
 const [preview,setPreview]=useState<RealityCheckPlan|null>(null),[dirty,setDirty]=useState(false);
 const [pending,setPending]=useState<RealityCheckCommand|null>(null),[busy,setBusy]=useState(false);
 const [remote,setRemote]=useState<RealityCheckRecord|null>(null),[conflict,setConflict]=useState(false),[message,setMessage]=useState('');
 const choiceEditor=useActionChoiceEditor(initialRecord?.actionChoice,'explicit',()=>setPreview(null));
 const working=useRef(false),epoch=useRef(0),identity=useRef(initialRecord?.id??'');
 const erasedIds=useRef(new Set<string>());
 const activeRef=useRef(active),pendingRef=useRef(pending),dirtyRef=useRef(dirty);
 activeRef.current=active;pendingRef.current=pending;dirtyRef.current=dirty;
 const blocked=busy||pending!==null;
 const scoped={...(caseId?{caseId}:{}),...(simulationId?{simulationId}:{})};
 const canCreate=!!source&&source.caseAvailable&&!!source.turns[round-1];
 const canSave=!conflict&&(!!active||canCreate);
 const sourceState=active?.source??(source?{available:!!source.turns[round-1],title:source.title,currentRevision:source.revision,reason:source.turns[round-1]?.reason??null,checkNext:source.turns[round-1]?.checkNext??null,caseAvailable:source.caseAvailable,caseTitle:source.caseTitle}:null);

 function change(patch:Partial<RealityCheckPlan>){if(working.current||pendingRef.current)return;++epoch.current;choiceEditor.invalidate();setDraft(old=>({...old,...patch}));setPreview(null);dirtyRef.current=true;setDirty(true);}
 function install(record:RealityCheckRecord,metadataTicket?:number){if(erasedIds.current.has(record.id))return;++epoch.current;identity.current=record.id;setActive(record);setSourceId(record.simulationId);setRound(record.round);setDraft(record.plan);choiceEditor.install(record.actionChoice,metadataTicket);setPreview(null);dirtyRef.current=false;setDirty(false);setRemote(null);setConflict(false);}
 function forgetErased(id:string,force=false){
  erasedIds.current.add(id);setState(old=>({...old,items:old.items.filter(item=>item.id!==id)}));
  if(activeRef.current?.id!==id)return;
  ++epoch.current;setPreview(null);setRemote(null);
  if(dirtyRef.current&&!force){setConflict(true);setMessage('这份计划目前不可读取，未保存的独立输入仍保留。原计划已不能继续保存，请明确新建后重新填写。');return;}
  identity.current='';activeRef.current=null;setActive(null);setDraft(blank());choiceEditor.reset();dirtyRef.current=false;setDirty(false);setConflict(false);setSource(null);setSourceId(simulationId??'');setRound(1);
  setMessage('这份计划已不可读取，已清除未修改的缓存文字。');
 }
 function compareRecord(next:RealityCheckRecord|null,metadataTicket?:number){
  const current=activeRef.current;if(!current)return;
  if(!next){forgetErased(current.id);return;}
  if(erasedIds.current.has(next.id))return;
  if(next.revision<current.revision)return;
  if(next.revision!==current.revision){setRemote(next);setConflict(true);setPreview(null);setMessage('另一页面修改了计划。当前输入仍保留，请比较后明确采用最新保存内容。');}
  if(metadataTicket!==undefined)choiceEditor.verifyLinked(next.actionChoice,metadataTicket);setActive(old=>old&&old.id===next.id?{...old,source:next.source}:old);
 }
 const latestCompare=useRef(compareRecord);latestCompare.current=compareRecord;
 const metadataGeneration=useRef(choiceEditor.ideas.generation);metadataGeneration.current=choiceEditor.ideas.generation;
 useEffect(()=>{
  if(initialRecord&&activeRef.current?.id===initialRecord.id&&initialRecord.revision!==activeRef.current.revision&&!pendingRef.current&&!working.current)latestCompare.current(initialRecord);
 },[initialRecord]);
 useEffect(()=>{
  async function focus(){
   if(working.current||pendingRef.current)return;
   const ticket=++epoch.current,metadataTicket=metadataGeneration.current(),current=activeRef.current;setPreview(null);
   try{
    if(current){const next=await realityCheckGetAction(current.id);if(ticket!==epoch.current||working.current||pendingRef.current||activeRef.current?.id!==current.id)return;latestCompare.current(next,metadataTicket);}
    else if(sourceId){const next=await realityCheckSourceAction(sourceId);if(ticket!==epoch.current||working.current||pendingRef.current||activeRef.current)return;setSource(next);if(!next||next.revision!==source?.revision)setPreview(null);if(!next){setMessage('来源目前不可读取，输入仍保留。');}}
   }catch(e){if(ticket===epoch.current&&!working.current)setMessage(`核对没有完成：${errorText(e)} 输入仍保留。`);}
  }
  window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);
 },[sourceId,source?.revision]);
 async function chooseSource(id:string){
  if(simulationId&&id!==simulationId){setMessage('当前页面只从指定的假设演练新建计划。');return;}
  const ticket=++epoch.current;setPreview(null);dirtyRef.current=true;setDirty(true);setSourceId(id);setSource(null);setRound(1);setMessage('');
  if(!id)return;setBusy(true);
  try{const next=await realityCheckSourceAction(id);if(ticket!==epoch.current)return;if(next&&caseId&&next.caseId!==caseId)throw Error('来源不属于当前案例');setSource(next);if(!next)setMessage('来源目前不可读取，请重新选择。');}
  catch(e){if(ticket===epoch.current)setMessage(errorText(e));}finally{if(ticket===epoch.current)setBusy(false);}
 }
 async function open(id:string){
  if(working.current||pendingRef.current)return;const ticket=++epoch.current,metadataTicket=choiceEditor.ideas.generation();setBusy(true);setMessage('');
  try{const next=await realityCheckGetAction(id);if(ticket!==epoch.current)return;if(!next){if(activeRef.current?.id===id)forgetErased(id);else setMessage('这份计划目前不可读取。当前输入仍保留。');return;}if(next.id!==id||(caseId&&next.caseId!==caseId)||(simulationId&&next.simulationId!==simulationId))throw Error('这份计划目前不可读取。当前输入仍保留。');install(next,metadataTicket);setSource(null);}
  catch(e){if(ticket===epoch.current)setMessage(errorText(e));}finally{setBusy(false);}
 }
 async function newDraft(){if(working.current||pendingRef.current)return;++epoch.current;choiceEditor.reset();identity.current='';setActive(null);setRemote(null);setConflict(false);setPreview(null);setDraft(blank());dirtyRef.current=false;setDirty(false);setSourceId(simulationId??'');setSource(null);setRound(1);setMessage('');if(simulationId)await chooseSource(simulationId);}
 async function refresh(more=false){
  const ticket=epoch.current,metadataTicket=choiceEditor.ideas.generation();
  const page=await realityChecksListAction({...scoped,...(more&&state.nextCursor?{before:state.nextCursor}:{})});
  const next={...page,items:page.items.filter(item=>!erasedIds.current.has(item.id))};
  setState(old=>more?{...next,items:[...old.items,...next.items.filter(x=>!old.items.some(y=>y.id===x.id))]}:next);
  if(ticket===epoch.current&&!working.current&&!pendingRef.current){const current=activeRef.current;const found=current&&next.items.find(x=>x.id===current.id);if(found)compareRecord(found,metadataTicket);}
 }
 async function execute(command:RealityCheckCommand){
  if(working.current)return;working.current=true;++epoch.current;setBusy(true);setPending(command);pendingRef.current=command;setMessage('');
  const metadataTicket=choiceEditor.ideas.generation();let acknowledged=false;
  try{
   const receipt=await realityCheckSaveAction(command);acknowledged=true;if(receipt.id!==command.id||receipt.revision!==command.expectedRevision+1)throw Error('保存回执与本次请求不一致');
   if(command.operation==='erase'){forgetErased(command.id,true);setMessage('计划已删除。');}
   else{
    const saved=await realityCheckGetAction(command.id);
    if(!saved){if(activeRef.current?.id===command.id)forgetErased(command.id);throw Error('尚未读到刚保存的计划');}
    if(saved.id!==command.id||erasedIds.current.has(saved.id))throw Error('尚未读到刚保存的计划');
    if(saved.revision<receipt.revision)throw Error('读取的版本仍早于保存回执');
    if(saved.revision!==receipt.revision){setRemote(saved);setConflict(true);setPreview(null);setMessage('本次已保存，随后又有修改。输入仍保留，请比较最新内容。');}
    else{install(saved,metadataTicket);setMessage('计划已保存，接下来需要你去做这次真实确认。');}
   }
   setPending(null);pendingRef.current=null;
   try{await refresh();}catch{setMessage('写入已完成，列表尚未刷新。请重新读取列表。');}
  }catch(e){setMessage(acknowledged?`已收到保存回执，重新读取尚未完成：${errorText(e)}。输入和原请求仍保留，可以重试本次请求核对。`:`${errorText(e)} 输入和原请求仍保留，请重试本次请求。`);}
  finally{working.current=false;setBusy(false);}
 }
 async function submit(operation:'save'|'erase'){
  if(working.current||blocked||conflict)return;
  if(operation==='save'&&(!preview||!canSave))return;
  if(!identity.current)identity.current=crypto.randomUUID();
  const common={id:identity.current,requestId:crypto.randomUUID(),expectedRevision:active?.revision??0};
  working.current=true;setBusy(true);
  try{const extension=operation==='save'?await choiceEditor.command():{};const command:RealityCheckCommand=operation==='erase'?{operation,...common}:{operation,...common,...extension,simulationId:sourceId,round,plan:preview!,confirmed:true};
  working.current=false;await execute(command);}catch(error){working.current=false;setBusy(false);setMessage(errorText(error));}
 }
 function makePreview(){
  if(working.current||blocked||!canSave)return;
  const parsed=realityCheckPlanSchema.safeParse(draft);
  if(!parsed.success){setMessage('请分别填写问题、什么会推翻它、具体做法和有效截止日期（1900—2200 年）。');setPreview(null);return;}
  try{choiceEditor.makePreview();}catch(error){setMessage(errorText(error));return;}++epoch.current;setPreview(parsed.data);setMessage('请逐项核对下方预览，再明确确认保存。');
 }
 async function moreSources(){setBusy(true);try{const next=await realityCheckSourcesAction({...(caseId?{caseId}:{}),before:sources.nextCursor!});setSources(old=>({...next,items:[...old.items,...next.items.filter(x=>!old.items.some(y=>y.id===x.id))]}));}catch(e){setMessage(errorText(e));}finally{setBusy(false);}}
 async function comparePending(){if(!pending||working.current)return;setBusy(true);try{const next=await realityCheckGetAction(pending.id);if(!next&&activeRef.current?.id===pending.id)forgetErased(pending.id);if(next&&erasedIds.current.has(next.id))return;setRemote(next);setMessage(next?'最新保存内容列在下方，原请求仍保留。':'目前没有读到这份计划，请重试原请求核对。');}catch(e){setMessage(errorText(e));}finally{setBusy(false);}}
 if(!state.available)return <p role="status" className="rounded-lg border p-5 text-sm leading-7">现实确认计划尚未就绪。请先执行数据库迁移 137，再重新读取。</p>;
 const returnCase=active?.caseId??source?.caseId??caseId;
 const sourceHref=`/business-lab/simulation?${new URLSearchParams({...(returnCase?{caseId:returnCase}:{}),...(sourceId?{recordId:sourceId}:{})}).toString()}`;
 return <div className="min-w-0 space-y-8">
  <section className="space-y-3"><h2 className="text-lg font-semibold">保存过的确认计划</h2>{!state.items.length&&<p className="text-sm leading-7 text-muted-foreground">还没有计划。先选一轮自己保存的假设演练，再写你要怎样碰到现实。</p>}
   <div className="flex flex-wrap gap-2">{state.items.map(r=>dirty?<ConfirmButton key={r.id} disabled={blocked} variant="outline" confirmLabel="确认切换并舍弃未保存输入" className="h-auto max-w-full whitespace-normal break-words text-left" onClick={()=>void open(r.id)}>{r.plan.question}</ConfirmButton>:<Button key={r.id} disabled={blocked} variant="outline" className="h-auto max-w-full whitespace-normal break-words text-left" onClick={()=>void open(r.id)}>{r.plan.question}</Button>)}</div>
   <div className="flex flex-wrap gap-2"><Button disabled={blocked} variant="outline" onClick={()=>{setBusy(true);void refresh().catch(e=>setMessage(errorText(e))).finally(()=>setBusy(false));}}>重新读取列表</Button>{state.nextCursor&&<Button disabled={blocked} variant="outline" onClick={()=>{setBusy(true);void refresh(true).catch(e=>setMessage(errorText(e))).finally(()=>setBusy(false));}}>更多计划</Button>}<ConfirmButton disabled={blocked} variant="outline" confirmLabel="确认新建并清空未保存输入" onClick={newDraft}>新建确认计划</ConfirmButton></div>
  </section>
  {message&&<p role="status" className="whitespace-pre-wrap break-words rounded-lg border p-4 text-sm leading-7">{message}</p>}
  {pending&&<section className="space-y-3 rounded-lg border p-4 text-sm leading-7"><p>本次请求尚待核对，当前输入保持锁定。重试使用同一个请求，不会另建一份计划。</p><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>void execute(pending)}>重试本次请求</Button><Button disabled={busy} variant="outline" onClick={()=>void comparePending()}>读取最新保存内容作比较</Button></div></section>}
  <form onSubmit={e=>{e.preventDefault();makePreview();}} className="space-y-5"><fieldset disabled={blocked} className="min-w-0 space-y-5"><legend className="mb-3 text-lg font-semibold">亲手写下要确认的事</legend>
   <label className="block space-y-2 text-sm"><span>本人保存的假设演练</span><select name="source" disabled={!!active||!!simulationId} className="min-h-11 w-full min-w-0 rounded-md border bg-background p-2" value={sourceId} onChange={e=>void chooseSource(e.target.value)}><option value="">请选择来源</option>{sourceId&&!sources.items.some(s=>s.id===sourceId)&&<option value={sourceId}>{sourceState?.title??'原来源（目前不可读取）'}</option>}{sources.items.filter(s=>!simulationId||s.id===simulationId).map(s=><option key={s.id} value={s.id} disabled={!s.caseAvailable}>{s.title}{s.caseAvailable?'':' · 案例目前不可读取'}</option>)}</select></label>
   {!active&&!simulationId&&sources.nextCursor&&<Button type="button" variant="outline" onClick={()=>void moreSources()}>更多来源</Button>}
   <label className="block space-y-2 text-sm"><span>选哪一轮</span><select name="round" disabled={!!active||!source} className="min-h-11 w-full min-w-0 rounded-md border bg-background p-2" value={round} onChange={e=>{++epoch.current;setRound(Number(e.target.value));setPreview(null);dirtyRef.current=true;setDirty(true);}}>{active?<option value={active.round}>第 {active.round} 轮 · 来源第 {active.sourceRevision} 版</option>:(source?.turns??[null]).map((_,i)=><option key={i+1} value={i+1}>第 {i+1} 轮</option>)}</select></label>
   {active&&<p className="text-sm leading-7 text-muted-foreground">这份计划的来源和轮次已固定。可以独立修改下面四项，也可以删除计划。删除计划也会清除结果中保留的计划正文；你独立写下的核对记录仍会保留。</p>}
   <SourceNotes source={sourceState}/>
   {!active&&source&&!source.caseAvailable&&<p className="text-sm leading-7">案例目前不可读取，暂不能从此来源新建计划。</p>}
   <PlanFields plan={draft} onChange={change}/><ActionChoiceFields value={choiceEditor.choice} onChange={value=>{if(blocked)return;++epoch.current;choiceEditor.change(value);dirtyRef.current=true;setDirty(true);}} conditionsMode="explicit" disabled={blocked} ideas={choiceEditor.ideas}/>
   {draft.dueDate&&<p className="text-sm leading-7 text-muted-foreground">{draft.dueDate<today?'已过截止日期':'截止日期'}：{draft.dueDate}（东京日期）。日期只作提醒，计划不会自动完成。</p>}
   <div className="flex flex-wrap gap-2"><Button type="submit" disabled={!canSave}>先预览确认计划</Button>{active&&<ConfirmButton type="button" variant="outline" disabled={conflict} onClick={()=>submit('erase')}>删除这份计划</ConfirmButton>}</div>
  </fieldset></form>
  {preview&&<section className="space-y-4 rounded-lg border p-5"><h2 className="text-lg font-semibold">保存前逐项核对</h2><p className="break-words text-sm leading-7">来源：{sourceState?.available?sourceState.title:'原来源目前不可读取'} · 第 {round} 轮。以下四项由你亲手填写，保存不代表已验证。</p><PlanPreview plan={preview}/>{choiceEditor.previewChoice&&<ActionChoiceSummary value={choiceEditor.previewChoice}/>}<div className="flex flex-wrap gap-2"><Button disabled={blocked||!canSave} onClick={()=>submit('save')}>确认保存这份计划</Button><Button disabled={blocked} variant="outline" onClick={()=>setPreview(null)}>返回修改</Button></div></section>}
  {remote&&<section className="space-y-4 rounded-lg border p-5"><h2 className="text-lg font-semibold">最新保存内容 · 第 {remote.revision} 版</h2><PlanPreview plan={remote.plan}/>{remote.actionChoice&&<ActionChoiceSummary value={{...remote.actionChoice,...(remote.actionChoice.choice.relatedIdeaId?choiceEditor.ideas.lookup(remote.actionChoice.choice.relatedIdeaId):{ideaAvailable:false,ideaTitle:null})}}/>}<ConfirmButton disabled={busy} variant="outline" confirmLabel={pending?'确认结束本次重试并替换为最新保存内容':'确认替换当前输入并采用最新保存内容'} onClick={()=>{setPending(null);pendingRef.current=null;install(remote);setMessage('已采用最新保存内容，请重新预览。');}}>采用最新保存内容</ConfirmButton></section>}
  {active&&!dirty&&!blocked&&!remote&&!conflict&&<Button asChild variant="outline"><Link href={`/business-lab/simulation/checks/results?caseId=${active.caseId}&planId=${active.id}&planRevision=${active.revision}`}>记录这版计划的核对结果</Link></Button>}
  <p className="text-sm text-muted-foreground"><Link href={sourceHref} className="underline">返回这份假设演练</Link></p>
 </div>;
}
