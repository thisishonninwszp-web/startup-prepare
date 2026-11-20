'use client';

import {useEffect,useRef,useState} from 'react';
import {resultMethodDraftSchema,type ResultMethodCommand,type ResultMethodDraft,type ResultMethodRecord,type ResultMethodSource} from '@/lib/domains/business-teardowns/result-methods/domain';
import {resultMethodsListAction,resultMethodGetAction,resultMethodSourceAction,resultMethodSaveAction,resultMethodSourcesAction} from './actions';
import type {ResultMethodsPanelProps} from './result-methods-panel';

const blank=():ResultMethodDraft=>({method:'',scenario:'',conditions:'',failureConditions:'',unknowns:''});
const ownOnly=(record:ResultMethodRecord):ResultMethodRecord=>({...record,source:null});
const sameDraft=(a:ResultMethodDraft,b:ResultMethodDraft)=>(Object.keys(blank()) as (keyof ResultMethodDraft)[]).every(key=>a[key]===b[key]);
const errorText=(error:unknown)=>error instanceof Error?error.message:'暂时没有完成，请重试。';

export function useResultMethods(props:ResultMethodsPanelProps){
 const {initialState,initialSources,initialRecord=null,initialSource=null,caseId,resultId}=props;
 const [state,setState]=useState(()=>({...initialState,items:initialState.items.map(ownOnly)})),[sources,setSources]=useState(initialSources);
 const [active,setActive]=useState(()=>initialRecord?ownOnly(initialRecord):null),[source,setSource]=useState(initialSource);
 const [sourceId,setSourceId]=useState(initialRecord?.resultId??initialSource?.id??resultId??'');
 const [draft,setDraft]=useState<ResultMethodDraft>(blank),[preview,setPreview]=useState<ResultMethodDraft|null>(null),[dirty,setDirty]=useState(false);
 const [pending,setPending]=useState<ResultMethodCommand|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [releasable,setReleasable]=useState(false),[requestedSource,setRequestedSource]=useState<string|null>(null);
 const working=useRef(false),epoch=useRef(0),erasedIds=useRef(new Set<string>()),pendingCase=useRef<string|undefined>(undefined);
 const sourceGeneration=useRef(0);
 const activeRef=useRef(active),pendingRef=useRef(pending),sourceIdRef=useRef(sourceId);
 activeRef.current=active;pendingRef.current=pending;sourceIdRef.current=sourceId;
 const blocked=busy||pending!==null,canCreate=!active&&!!source;
 const scoped={...(caseId?{caseId}:{}),...(resultId?{resultId}:{})};
 function assertRecord(next:ResultMethodRecord,id:string,anchor?:{caseId?:string;resultId:string}){
  if(erasedIds.current.has(id)||next.id!==id||(caseId&&next.caseId!==caseId)||(resultId&&next.resultId!==resultId)||(anchor&&((anchor.caseId&&next.caseId!==anchor.caseId)||next.resultId!==anchor.resultId)))throw Error('这份方法目前不可读取，独立输入仍保留。');
  return next;
 }
 function assertSource(next:ResultMethodSource|null,id:string,expectedCase?:string){
  if(next&&(next.id!==id||(caseId&&next.caseId!==caseId)||(resultId&&next.id!==resultId)||(expectedCase&&next.caseId!==expectedCase)))throw Error('选定的调查结果目前不可读取。');
  return next;
 }
 function hideSource(){++sourceGeneration.current;setSource(null);}
 function forget(id:string){
  erasedIds.current.add(id);setState(old=>({...old,items:old.items.filter(item=>item.id!==id)}));
  if(activeRef.current?.id!==id)return;
  ++epoch.current;setActive(null);activeRef.current=null;setDraft(blank());setPreview(null);setDirty(false);setRequestedSource(null);hideSource();setSourceId(resultId??'');sourceIdRef.current=resultId??'';
 }
 function install(record:ResultMethodRecord){
  ++epoch.current;const own=ownOnly(record);setActive(own);activeRef.current=own;setSourceId(record.resultId);sourceIdRef.current=record.resultId;
  setDraft(blank());setPreview(null);setDirty(false);setRequestedSource(null);hideSource();
 }
 function change(patch:Partial<ResultMethodDraft>){
  if(working.current||pendingRef.current||activeRef.current)return;
  ++epoch.current;setDraft(old=>({...old,...patch}));setPreview(null);setDirty(true);
 }
 async function verifyCurrent(insideRefresh=false){
  hideSource();setPreview(null);
  if((working.current&&!insideRefresh)||pendingRef.current)return;
  const ticket=++epoch.current,sourceTicket=sourceGeneration.current,current=activeRef.current,id=current?.resultId??sourceIdRef.current;
  if(!id)return;
  try{
   if(current){
    const next=await resultMethodGetAction(current.id);
    if(ticket!==epoch.current||pendingRef.current||(!insideRefresh&&working.current))return;
    if(!next){forget(current.id);setMessage('这份方法已不可读取，已从当前画面清除。');return;}
    assertRecord(next,current.id,current);
    if(next.parentMethodId!==current.parentMethodId||!sameDraft(next.draft,current.draft))throw Error('读取到的方法与当前保存内容不一致，请重新核对。');
   }
   const next=assertSource(await resultMethodSourceAction(id),id,current?.caseId);
   if(ticket!==epoch.current||sourceTicket!==sourceGeneration.current||pendingRef.current||(!insideRefresh&&working.current))return;
   setSource(next);if(!next)setMessage('原调查结果目前不可读取；你亲手写下的方法仍保留，也可以继续拿它寻找反例。');
  }catch(error){if(ticket===epoch.current)setMessage(`核对没有完成：${errorText(error)} 原调查文字保持隐藏，独立内容仍保留。`);}
 }
 const latest=useRef({verifyCurrent,assertRecord});latest.current={verifyCurrent,assertRecord};
 useEffect(()=>{const focus=()=>void latest.current.verifyCurrent();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[]);
 const prior=useRef({initialRecord,initialSource});
 useEffect(()=>{
  if(prior.current.initialRecord===initialRecord&&prior.current.initialSource===initialSource)return;
  prior.current={initialRecord,initialSource};hideSource();
  if(working.current)return;
  ++epoch.current;setPreview(null);
  if(initialRecord&&activeRef.current?.id===initialRecord.id&&!pendingRef.current){
   try{latest.current.assertRecord(initialRecord,activeRef.current.id,activeRef.current);if(!sameDraft(initialRecord.draft,activeRef.current.draft))throw Error('读取到的方法与当前保存内容不一致。');}catch(error){setMessage(errorText(error));}
  }
 },[initialRecord,initialSource]);
 async function chooseSource(id:string,confirmed=false){
  if(working.current||pendingRef.current||activeRef.current)return;
  if(resultId&&id!==resultId){setMessage('当前页面只从指定的调查结果新写方法。');return;}
  if(dirty&&id!==sourceIdRef.current&&!confirmed){setRequestedSource(id);return;}
  const ticket=++epoch.current;working.current=true;setBusy(true);hideSource();setPreview(null);setRequestedSource(null);setSourceId(id);sourceIdRef.current=id;setMessage('');
  const sourceTicket=sourceGeneration.current;
  try{if(id){const next=assertSource(await resultMethodSourceAction(id),id);if(ticket!==epoch.current||sourceTicket!==sourceGeneration.current)return;setSource(next);if(!next)setMessage('这条调查结果目前不可读取，独立输入仍保留。');}}
  catch(error){if(ticket===epoch.current)setMessage(errorText(error));}finally{working.current=false;setBusy(false);}
 }
 async function open(id:string){
  if(working.current||pendingRef.current)return;
  const ticket=++epoch.current;working.current=true;setBusy(true);hideSource();setPreview(null);setMessage('');
  try{
   const next=await resultMethodGetAction(id);if(ticket!==epoch.current)return;
   if(!next){forget(id);setMessage('这份方法已不可读取，已从列表清除。其他独立输入仍保留。');return;}
   assertRecord(next,id);install(next);const installed=epoch.current,sourceTicket=sourceGeneration.current;
   const fresh=assertSource(await resultMethodSourceAction(next.resultId),next.resultId,next.caseId);
   if(installed===epoch.current&&sourceTicket===sourceGeneration.current){setSource(fresh);if(!fresh)setMessage('原调查结果目前不可读取；这份独立方法仍可阅读和寻找反例。');}
  }catch(error){setMessage(errorText(error));}finally{working.current=false;setBusy(false);}
 }
 async function newDraft(){
  if(working.current||pendingRef.current)return;
  ++epoch.current;setActive(null);activeRef.current=null;setDraft(blank());setPreview(null);setDirty(false);hideSource();setRequestedSource(null);setMessage('');setSourceId(resultId??'');sourceIdRef.current=resultId??'';
  if(resultId)await chooseSource(resultId,true);
 }
 async function refreshList(more=false){
  const next=await resultMethodsListAction({...scoped,...(more&&state.nextCursor?{before:state.nextCursor}:{})});
  const own={...next,items:next.items.filter(item=>!erasedIds.current.has(item.id)).map(ownOnly)};
  setState(old=>more?{...own,items:[...old.items.filter(item=>!erasedIds.current.has(item.id)),...own.items.filter(item=>!old.items.some(loaded=>loaded.id===item.id))]}:own);
 }
 async function refresh(){
  if(working.current||pendingRef.current)return;
  working.current=true;setBusy(true);setMessage('');
  try{await Promise.all([refreshList(),verifyCurrent(true)]);}catch(error){setMessage(`列表读取没有完成：${errorText(error)} 已读取的独立内容仍保留。`);}finally{working.current=false;setBusy(false);}
 }
 async function execute(command:ResultMethodCommand){
  if(working.current)return;
  if(!pendingRef.current)pendingCase.current=activeRef.current?.caseId??source?.caseId??caseId;
  working.current=true;++epoch.current;setBusy(true);setPending(command);pendingRef.current=command;setReleasable(false);hideSource();setMessage('');let acknowledged=false;
  try{
   const receipt=await resultMethodSaveAction(command);acknowledged=true;
   if(receipt.id!==command.id||receipt.revision!==(command.operation==='append'?1:2))throw Error('保存回执与本次请求不一致');
   if(command.operation==='erase'){forget(command.id);setMessage('这份方法的五项文字已永久擦除。');}
   else{
    const saved=await resultMethodGetAction(command.id);
    if(!saved){if(activeRef.current?.id===command.id)forget(command.id);throw Error('尚未读到与本次请求一致的方法');}
    assertRecord(saved,command.id,{resultId:command.resultId,caseId:pendingCase.current});
    if(!sameDraft(saved.draft,command.draft)||saved.parentMethodId!==null)throw Error('读取的方法正文与本次请求不一致');
    install(saved);setMessage('方法已保存。补充或修正请另写一份。');
    try{const sourceTicket=sourceGeneration.current;const fresh=assertSource(await resultMethodSourceAction(saved.resultId),saved.resultId,saved.caseId);if(sourceTicket===sourceGeneration.current)setSource(fresh);}catch{setMessage('方法已保存；原调查结果核对没有完成，来源文字保持隐藏。');}
   }
   setPending(null);pendingRef.current=null;pendingCase.current=undefined;
   try{await refreshList();}catch{setMessage('写入已完成，列表尚未刷新。请重新读取列表。');}
  }catch(error){setMessage(acknowledged?`已收到保存回执，重新读取尚未完成：${errorText(error)}。输入和原请求仍保留，请重试本次请求核对。`:`${errorText(error)} 输入和原请求仍保留，请重试本次请求。`);}
  finally{working.current=false;setBusy(false);}
 }
 function makePreview(){
  if(working.current||pendingRef.current||!canCreate)return;
  const parsed=resultMethodDraftSchema.safeParse(draft);
  if(!parsed.success){setPreview(null);setMessage('请分别填写五项内容；每项不超过 6000 字，合计过长时请缩短。');return;}
  ++epoch.current;setPreview(parsed.data);setMessage('请逐项核对下方预览，再明确确认保存。');
 }
 function append(){if(working.current||pendingRef.current||!preview||!canCreate||!source)return;void execute({operation:'append',id:crypto.randomUUID(),requestId:crypto.randomUUID(),resultId:source.id,draft:preview,confirmed:true});}
 function erase(){if(working.current||pendingRef.current||!active)return;void execute({operation:'erase',id:active.id,requestId:crypto.randomUUID(),expectedRevision:1});}
 async function reconcilePending(){
  const command=pendingRef.current;if(working.current||!command||command.operation!=='append')return;
  working.current=true;setBusy(true);setReleasable(false);hideSource();setPreview(null);let retry=false;
  try{
   const saved=await resultMethodGetAction(command.id);
   if(saved){assertRecord(saved,command.id,{resultId:command.resultId,caseId:pendingCase.current});if(!sameDraft(saved.draft,command.draft)||saved.parentMethodId!==null)throw Error('读取结果与本次请求不一致，请继续核对。');retry=true;}
   else{
    const fresh=assertSource(await resultMethodSourceAction(command.resultId),command.resultId,pendingCase.current);
    if(fresh){setMessage('原调查结果仍存在，本次请求仍须重试核对。');return;}
    if(await resultMethodGetAction(command.id))throw Error('方法状态已改变，请重试本次请求核对。');
    setReleasable(true);setMessage('两次读取均未找到本次方法，且原调查结果已不可读取。可以明确结束本次请求并保留输入。');
   }
  }catch(error){setMessage(`保存状态核对没有完成：${errorText(error)} 原请求仍保留。`);}finally{working.current=false;setBusy(false);}
  if(retry)await execute(command);
 }
 function releasePending(){
  if(working.current||!releasable||pendingRef.current?.operation!=='append')return;
  ++epoch.current;setPending(null);pendingRef.current=null;pendingCase.current=undefined;setReleasable(false);hideSource();setPreview(null);setDirty(true);setMessage('本次请求已结束，输入仍保留。请选择仍可读取的调查结果后再预览。');
 }
 async function more(kind:'methods'|'sources'){
  if(working.current||pendingRef.current)return;
  working.current=true;setBusy(true);setMessage('');
  try{
   if(kind==='methods'&&state.nextCursor)await refreshList(true);
   else if(kind==='sources'&&sources.nextCursor){const next=await resultMethodSourcesAction({...(caseId?{caseId}:{}),before:sources.nextCursor});setSources(old=>({...next,items:[...old.items,...next.items.filter(item=>!old.items.some(loaded=>loaded.id===item.id))]}));}
  }catch(error){setMessage(`读取没有完成：${errorText(error)} 已读取的独立内容仍保留。`);}finally{working.current=false;setBusy(false);}
 }
 return {state,sources,active,source,sourceId,draft,preview,dirty,pending,busy,blocked,message,releasable,requestedSource,canCreate,change,chooseSource,open,newDraft,refresh,execute,makePreview,append,erase,reconcilePending,releasePending,more,setPreview,setRequestedSource};
}
