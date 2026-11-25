'use client';
import {useEffect,useRef,useState} from 'react';
import {useActionChoiceEditor} from '../action-choices/use-action-choice-ideas';
import type {ActionChoiceInput} from '@/lib/domains/business-teardowns/action-choices/domain';
import {explanationDraftSchema,type ExplanationAnchor,type ExplanationCommand,type ExplanationList,type ExplanationPlanDraft,type ExplanationPlanRecord,type ExplanationSource} from '@/lib/domains/business-teardowns/explanations/domain';
import {explanationListAction,explanationGetAction,explanationSourceAction,explanationSaveAction} from './actions';
export type ExplanationPlansProps={initialState:ExplanationList;initialRecord?:ExplanationPlanRecord|null;initialSource?:ExplanationSource|null;anchor?:ExplanationAnchor;caseId?:string;exactRevision?:number};
const blank=():ExplanationPlanDraft=>({question:'',expectedA:'',expectedB:'',uncontrolled:'',falsifier:'',method:'',dueDate:''});
export function useExplanationPlans(props:ExplanationPlansProps){
 const [state,setState]=useState(props.initialState),[active,setActive]=useState(props.initialRecord??null),[source,setSource]=useState((props.initialSource===undefined?props.initialRecord?.source??null:props.initialSource));
 const [draft,setDraft]=useState<ExplanationPlanDraft>(props.initialRecord?.draft??blank()),[preview,setPreview]=useState<ExplanationPlanDraft|null>(null),[pending,setPending]=useState<ExplanationCommand|null>(null);
 const [busy,setBusy]=useState(false),[trusted,setTrusted]=useState(true),[message,setMessage]=useState(''),[editing,setEditing]=useState(!props.initialRecord);
 const choiceEditor=useActionChoiceEditor(props.initialRecord?.actionChoice,'expectations',()=>setPreview(null));
 const [remote,setRemote]=useState<ExplanationPlanRecord|null>(null);
 const activeId=useRef(props.initialRecord?.id??null),anchor=useRef<ExplanationAnchor|undefined>(props.initialRecord?.anchor??props.anchor),generation=useRef(0),working=useRef(false),erased=useRef(new Set<string>()),mounted=useRef(true);
 const scope=props.caseId?{caseId:props.caseId}:{};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 function hide(){generation.current++;setRemote(null);setSource(null);setTrusted(false);setPreview(null);}
 function keep(page:ExplanationList){if(!page.available)throw Error('比较计划暂时不可读取。');if(page.items.some(item=>props.caseId&&item.caseId!==props.caseId))throw Error('比较计划与指定案例不一致。');return {...page,items:page.items.filter(item=>!erased.current.has(item.id))};}
 function assertRecord(record:ExplanationPlanRecord|null,id:string){if(record&&(record.id!==id||(props.caseId&&record.caseId!==props.caseId)))throw Error('读取的比较计划与请求不一致。');return record;}
 function forget(id:string){erased.current.add(id);setState(old=>({...old,items:old.items.filter(item=>item.id!==id)}));if(activeId.current===id){activeId.current=null;setActive(null);setDraft(blank());choiceEditor.reset();setRemote(null);setPreview(null);setEditing(true);anchor.current=props.anchor;}}
 function install(record:ExplanationPlanRecord,metadataTicket?:number){activeId.current=record.id;anchor.current=record.anchor;setActive(record);setDraft(record.draft);choiceEditor.install(record.actionChoice,metadataTicket);setRemote(null);setSource(record.source);setEditing(false);setPreview(null);setTrusted(true);}
 async function refresh(){
  hide();if(working.current)return;working.current=true;setBusy(true);setMessage('');const ticket=generation.current,metadataTicket=choiceEditor.ideas.generation();
  try{const page=keep(await explanationListAction(scope));const id=activeId.current;const record=id?assertRecord(await explanationGetAction(id,props.exactRevision),id):null;const freshSource=!id&&anchor.current?await explanationSourceAction(anchor.current):null;
   if(!mounted.current||ticket!==generation.current)return;setState(page);if(id){if(record&&!erased.current.has(id)){choiceEditor.verifyLinked(record.actionChoice,metadataTicket);if(active&&record.revision!==active.revision){setRemote(record);setMessage('另一页面修改了计划。当前输入仍保留，请比较后明确采用最新保存内容。');}else{setActive(record);if(!editing){setDraft(record.draft);choiceEditor.install(record.actionChoice,metadataTicket);}}setSource(record.source);}else forget(id);}else setSource(freshSource);setTrusted(true);
  }catch(error){if(mounted.current&&ticket===generation.current)setMessage(error instanceof Error?error.message:'暂时未能核对，请重试。');}
  finally{if(mounted.current){working.current=false;setBusy(false);}}
 }
 const latestRefresh=useRef(refresh);latestRefresh.current=refresh;
 useEffect(()=>{const focus=()=>void latestRefresh.current();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[props.caseId]);
 const incomingSource=JSON.stringify((props.initialSource===undefined?props.initialRecord?.source??null:props.initialSource)),priorSource=useRef(incomingSource);
 useEffect(()=>{if(priorSource.current===incomingSource)return;priorSource.current=incomingSource;void latestRefresh.current();},[incomingSource]);
 const incomingRecord=JSON.stringify(props.initialRecord??null),priorRecord=useRef(incomingRecord);
 useEffect(()=>{if(priorRecord.current===incomingRecord)return;priorRecord.current=incomingRecord;void latestRefresh.current();},[incomingRecord]);
 async function open(id:string){
  if(working.current||pending||props.exactRevision!==undefined)return;hide();working.current=true;setBusy(true);setMessage('');const ticket=generation.current,metadataTicket=choiceEditor.ideas.generation();
  try{const record=assertRecord(await explanationGetAction(id),id);if(!mounted.current||ticket!==generation.current)return;if(!record){forget(id);activeId.current=null;setActive(null);setDraft(blank());choiceEditor.reset();setRemote(null);setEditing(true);anchor.current=props.anchor;setMessage('这份比较计划已不存在。重新读取后再查看其他记录。');}else if(!erased.current.has(id))install(record,metadataTicket);}
  catch(error){if(mounted.current&&ticket===generation.current)setMessage(error instanceof Error?error.message:'暂时没有读到。');}finally{if(mounted.current){working.current=false;setBusy(false);}}
 }
 async function execute(command:ExplanationCommand){
  if(working.current)return;working.current=true;setBusy(true);setMessage('');setPending(command);const ticket=generation.current,metadataTicket=choiceEditor.ideas.generation();
  try{const receipt=await explanationSaveAction(command);if(!mounted.current)return;if(receipt.id!==command.id||receipt.revision!==command.expectedRevision+1)throw Error('保存回执尚未核对，请重试本次请求。');
   if(command.operation==='erase'){forget(command.id);setSource(null);setPending(null);setTrusted(trusted&&ticket===generation.current);setMessage('已擦除比较计划及各版预测。独立调查结果仍保留。');return;}
   const record=assertRecord(await explanationGetAction(command.id),command.id);if(!mounted.current)return;if(!record||record.revision!==receipt.revision)throw Error('保存回执已返回，尚未读到相同版本。请重试本次请求。');
   setPending(null);activeId.current=record.id;anchor.current=record.anchor;
   // Focus invalidates every pending source read, including post-write reconciliation.
   if(ticket===generation.current){install(record,metadataTicket);setState(old=>({...old,items:[record,...(trusted?old.items.filter(item=>item.id!==record.id&&!erased.current.has(item.id)):[])],nextCursor:trusted?old.nextCursor:null}));}
   else{setActive(null);setTrusted(false);setEditing(false);setMessage('保存已确认。重新读取后再查看原文。');}
  }catch(error){if(mounted.current)setMessage(error instanceof Error?error.message:'请求结果尚未确认，请使用原请求重试。');}
  finally{if(mounted.current){working.current=false;setBusy(false);}}
 }
 const blocked=busy||pending!==null;
 function change(key:keyof ExplanationPlanDraft,value:string){if(working.current||blocked||props.exactRevision!==undefined)return;setDraft(old=>({...old,[key]:value}));setPreview(null);choiceEditor.invalidate();}
 function makePreview(){if(working.current||blocked||remote||(!trusted&&activeId.current!==null)||(!activeId.current&&!source))return;const parsed=explanationDraftSchema.safeParse(draft);if(!parsed.success){setMessage('请填写两种解释分别预期的观察、问题、反证条件、做法和有效日期。');return;}try{choiceEditor.makePreview(parsed.data);}catch(error){setMessage(error instanceof Error?error.message:'行动约定暂不可用');return;}setPreview(parsed.data);setMessage('');}
 async function save(){if(working.current||blocked||remote||!preview||!anchor.current||props.exactRevision!==undefined)return;working.current=true;setBusy(true);try{const extension=await choiceEditor.command();working.current=false;await execute({...extension,operation:'save',id:activeId.current??crypto.randomUUID(),requestId:crypto.randomUUID(),expectedRevision:active?.revision??0,anchor:anchor.current,draft:preview,confirmed:true});}catch(error){working.current=false;setBusy(false);setMessage(error instanceof Error?error.message:'行动约定暂不可用');}}
 async function erase(){if(blocked||!active||props.exactRevision!==undefined)return;await execute({operation:'erase',id:active.id,requestId:crypto.randomUUID(),expectedRevision:active.revision});}
 async function more(){if(blocked||!trusted||!state.nextCursor)return;working.current=true;setBusy(true);const ticket=generation.current;try{const next=keep(await explanationListAction({...scope,before:state.nextCursor}));if(mounted.current&&ticket===generation.current)setState(old=>({...next,items:[...old.items,...next.items.filter(item=>!old.items.some(prior=>prior.id===item.id))]}));}catch(error){if(mounted.current&&ticket===generation.current)setMessage(error instanceof Error?error.message:'更多记录暂时未读到。');}finally{if(mounted.current){working.current=false;setBusy(false);}}}
 function edit(){if(blocked||!trusted||!active||props.exactRevision!==undefined)return;setDraft(active.draft);choiceEditor.install(active.actionChoice);setEditing(true);setPreview(null);}
 function newDraft(){if(blocked)return;const wasTrusted=trusted;hide();activeId.current=null;anchor.current=props.anchor;setActive(null);setDraft(blank());choiceEditor.reset();setRemote(null);setEditing(true);setTrusted(wasTrusted);if(props.anchor)void refresh();}
 function changeChoice(value:ActionChoiceInput|null){if(working.current||blocked||props.exactRevision!==undefined)return;choiceEditor.change(value);}
 function adoptRemote(){if(blocked||!remote)return;install(remote);setEditing(true);}
 const dirty=editing&&(JSON.stringify(draft)!==JSON.stringify(active?.draft??blank())||choiceEditor.dirty);
 return {choice:choiceEditor.choice,previewChoice:choiceEditor.previewChoice,ideas:choiceEditor.ideas,changeChoice,remote,adoptRemote,state,active,source,draft,preview,pending,busy,blocked,trusted,message,editing,dirty,change,makePreview,save,erase,execute,refresh,open,more,edit,newDraft,canSave:!remote&&(!!activeId.current||source!==null)};
}
