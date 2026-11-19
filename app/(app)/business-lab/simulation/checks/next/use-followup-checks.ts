'use client';

import {useEffect,useRef,useState} from 'react';
import {realityCheckPlanSchema,type RealityCheckPlan} from '@/lib/domains/business-teardowns/reality-checks/domain';
import type {FollowupCheckCommand,FollowupCheckRecord,FollowupCheckSource} from '@/lib/domains/business-teardowns/followup-checks/domain';
import {followupChecksListAction,followupCheckGetAction,followupCheckSourceAction,followupCheckSaveAction,followupCheckSourcesAction} from './actions';
import type {FollowupChecksPanelProps} from './followup-checks-panel';

const blank=():RealityCheckPlan=>({question:'',falsifier:'',method:'',dueDate:''});
const errorText=(error:unknown)=>error instanceof Error?error.message:'暂时没有完成，请重试。';
const samePlan=(a:RealityCheckPlan,b:RealityCheckPlan)=>(Object.keys(a) as (keyof RealityCheckPlan)[]).every(key=>a[key]===b[key]);
const ownOnly=(record:FollowupCheckRecord):FollowupCheckRecord=>({...record,source:null});

export function useFollowupChecks(props:FollowupChecksPanelProps){
 const {initialState,initialSources,initialRecord=null,initialSource=null,caseId,resultId}=props;
 const [state,setState]=useState(()=>({...initialState,items:initialState.items.map(ownOnly)}));
 const [sources,setSources]=useState(initialSources);
 const [active,setActive]=useState(()=>initialRecord?ownOnly(initialRecord):null);
 const [source,setSource]=useState(initialSource);
 const [sourceId,setSourceId]=useState(initialRecord?.resultId??initialSource?.id??resultId??'');
 const [draft,setDraft]=useState<RealityCheckPlan>(()=>initialRecord?.plan??blank());
 const [preview,setPreview]=useState<RealityCheckPlan|null>(null),[dirty,setDirty]=useState(false);
 const [pending,setPending]=useState<FollowupCheckCommand|null>(null),[busy,setBusy]=useState(false);
 const [remote,setRemote]=useState<FollowupCheckRecord|null>(null),[conflict,setConflict]=useState(false);
 const [message,setMessage]=useState(''),[releasable,setReleasable]=useState(false),[requestedSource,setRequestedSource]=useState<string|null>(null);
 const working=useRef(false),epoch=useRef(0),identity=useRef(initialRecord?.id??'');
 const erasedIds=useRef(new Set<string>());
 const activeRef=useRef(active),pendingRef=useRef(pending),sourceIdRef=useRef(sourceId);
 activeRef.current=active;pendingRef.current=pending;sourceIdRef.current=sourceId;
 const blocked=busy||pending!==null;
 const scoped={...(caseId?{caseId}:{}),...(resultId?{resultId}:{})};
 const canSave=!conflict&&(!!active||!!source);

 function inScope(record:FollowupCheckRecord,id:string){
  return record.id===id&&(!caseId||record.caseId===caseId)&&(!resultId||record.resultId===resultId);
 }
 function assertRecord(record:FollowupCheckRecord,id:string,anchor?:{caseId:string;resultId:string}){
  if(erasedIds.current.has(id)||!inScope(record,id)||(anchor&&(record.caseId!==anchor.caseId||record.resultId!==anchor.resultId)))throw Error('这份计划目前不可读取，当前输入仍保留。');
  return record;
 }
 function assertSource(next:FollowupCheckSource|null,id:string,expectedCase?:string){
  if(next&&(next.id!==id||(caseId&&next.caseId!==caseId)||(expectedCase&&next.caseId!==expectedCase)))throw Error('选定的调查结果目前不可读取。');
  return next;
 }
 function hideSource(){setSource(null);}
 function install(record:FollowupCheckRecord){
  ++epoch.current;const own=ownOnly(record);identity.current=record.id;
  setActive(own);activeRef.current=own;setSourceId(record.resultId);sourceIdRef.current=record.resultId;
  setDraft(record.plan);setPreview(null);setDirty(false);setRemote(null);setConflict(false);setRequestedSource(null);hideSource();
 }
 function clearOwn(id:string){
  erasedIds.current.add(id);
  ++epoch.current;setState(old=>({...old,items:old.items.filter(item=>item.id!==id)}));
  identity.current='';setActive(null);activeRef.current=null;setDraft(blank());setPreview(null);setDirty(false);
  setRemote(null);setConflict(false);setRequestedSource(null);hideSource();
  setSourceId(resultId??'');sourceIdRef.current=resultId??'';
 }
 function change(patch:Partial<RealityCheckPlan>){
  if(working.current||pendingRef.current)return;
  ++epoch.current;setDraft(old=>({...old,...patch}));setPreview(null);setDirty(true);
 }
 function compareRecord(next:FollowupCheckRecord,current:FollowupCheckRecord){
  assertRecord(next,current.id,current);
  if(next.revision<current.revision)throw Error('读取到的计划仍早于当前版本，请重新核对。');
  if(next.revision===current.revision&&!samePlan(next.plan,current.plan))throw Error('读取到的正文与当前版本不一致，请重新核对。');
  if(next.revision>current.revision){
   setRemote(ownOnly(next));setConflict(true);setPreview(null);
   setMessage('另一页面修改了计划。当前输入仍保留，请比较后明确采用最新保存内容。');
  }
 }
 async function verifyCurrent(insideRefresh=false){
  if(working.current&&!insideRefresh)return;
  hideSource();setPreview(null);
  if(pendingRef.current)return;
  const ticket=++epoch.current,current=activeRef.current,id=current?.resultId??sourceIdRef.current;
  if(!id)return;
  try{
   if(current){
    const next=await followupCheckGetAction(current.id);
    if(ticket!==epoch.current||(!insideRefresh&&working.current)||pendingRef.current)return;
    if(!next){clearOwn(current.id);setMessage('这份计划已不可读取，已从当前画面清除。');return;}
    compareRecord(next,current);
   }
   const next=assertSource(await followupCheckSourceAction(id),id,current?.caseId);
   if(ticket!==epoch.current||(!insideRefresh&&working.current)||pendingRef.current)return;
   setSource(next);
   if(!next)setMessage('原调查结果目前不可读取；你亲手写下的计划仍保留。');
  }catch(error){
   if(ticket===epoch.current&&(insideRefresh||!working.current))setMessage(`核对没有完成：${errorText(error)} 原调查文字保持隐藏，独立输入仍保留。`);
  }
 }
 const latest=useRef({verifyCurrent,compareRecord});latest.current={verifyCurrent,compareRecord};
 useEffect(()=>{const focus=()=>void latest.current.verifyCurrent();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[]);
 const priorProps=useRef({record:initialRecord,source:initialSource});
 useEffect(()=>{
  if(priorProps.current.record===initialRecord&&priorProps.current.source===initialSource)return;
  priorProps.current={record:initialRecord,source:initialSource};
  if(working.current)return;
  ++epoch.current;hideSource();setPreview(null);
  const current=activeRef.current;
  if(current&&initialRecord?.id===current.id&&!pendingRef.current){
   try{latest.current.compareRecord(initialRecord,current);}catch(error){setMessage(errorText(error));}
  }
 },[initialRecord,initialSource]);

 async function chooseSource(id:string,confirmed=false){
  if(working.current||pendingRef.current||activeRef.current)return;
  if(resultId&&id!==resultId){setMessage('当前页面只从指定的调查结果新建计划。');return;}
  if(dirty&&id!==sourceIdRef.current&&!confirmed){setRequestedSource(id);return;}
  const ticket=++epoch.current;working.current=true;setBusy(true);setRequestedSource(null);
  hideSource();setPreview(null);setSourceId(id);sourceIdRef.current=id;setMessage('');
  try{
   if(!id)return;
   const next=assertSource(await followupCheckSourceAction(id),id);
   if(ticket!==epoch.current)return;
   setSource(next);if(!next)setMessage('这条调查结果目前不可读取，独立输入仍保留。');
  }catch(error){if(ticket===epoch.current)setMessage(errorText(error));}
  finally{working.current=false;setBusy(false);}
 }
 async function open(id:string){
  if(working.current||pendingRef.current)return;
  const ticket=++epoch.current;working.current=true;setBusy(true);hideSource();setPreview(null);setMessage('');
  try{
   const next=await followupCheckGetAction(id);
   if(ticket!==epoch.current)return;
   if(!next){
    erasedIds.current.add(id);
    if(activeRef.current?.id===id)clearOwn(id);
    else setState(old=>({...old,items:old.items.filter(item=>item.id!==id)}));
    setMessage('这份计划已不可读取，已从当前画面清除。其他独立输入仍保留。');return;
   }
   assertRecord(next,id);install(next);const installed=epoch.current;
   const fresh=assertSource(await followupCheckSourceAction(next.resultId),next.resultId,next.caseId);
   if(installed===epoch.current)setSource(fresh);
  }catch(error){setMessage(errorText(error));}
  finally{working.current=false;setBusy(false);}
 }
 async function newDraft(){
  if(working.current||pendingRef.current)return;
  ++epoch.current;identity.current='';setActive(null);activeRef.current=null;setDraft(blank());setPreview(null);setDirty(false);
  setRemote(null);setConflict(false);setRequestedSource(null);hideSource();setMessage('');
  setSourceId(resultId??'');sourceIdRef.current=resultId??'';
  if(resultId)await chooseSource(resultId,true);
 }
 async function refreshList(more=false){
  const next=await followupChecksListAction({...scoped,...(more&&state.nextCursor?{before:state.nextCursor}:{})});
  const own={...next,items:next.items.filter(item=>!erasedIds.current.has(item.id)).map(ownOnly)};
  setState(old=>more?{...own,items:[...old.items.filter(item=>!erasedIds.current.has(item.id)),...own.items.filter(item=>!old.items.some(loaded=>loaded.id===item.id))]}:own);
 }
 async function refresh(){
  if(working.current||pendingRef.current)return;
  working.current=true;setBusy(true);setMessage('');
  try{await Promise.all([refreshList(),verifyCurrent(true)]);}
  catch(error){setMessage(`列表读取没有完成：${errorText(error)} 已读取的独立内容仍保留。`);}
  finally{working.current=false;setBusy(false);}
 }
 async function execute(command:FollowupCheckCommand){
  if(working.current)return;
  working.current=true;++epoch.current;setBusy(true);setPending(command);pendingRef.current=command;
  setReleasable(false);setMessage('');hideSource();let acknowledged=false;
  try{
   const receipt=await followupCheckSaveAction(command);acknowledged=true;
   if(receipt.id!==command.id||receipt.revision!==command.expectedRevision+1)throw Error('保存回执与本次请求不一致');
   if(command.operation==='erase'){
    clearOwn(command.id);setMessage('计划已删除。');
   }else{
    const saved=await followupCheckGetAction(command.id);
    if(!saved){
     if(activeRef.current?.id===command.id)clearOwn(command.id);
     throw Error('尚未读到与本次请求一致的计划');
    }
    assertRecord(saved,command.id,{resultId:command.resultId,caseId:activeRef.current?.caseId??source?.caseId??caseId??saved.caseId});
    if(saved.revision<receipt.revision)throw Error('读取的版本仍早于保存回执');
    if(saved.revision>receipt.revision){
     setRemote(ownOnly(saved));setConflict(true);setPreview(null);
     setMessage('本次已保存，随后又有修改。当前输入仍保留，请比较最新内容。');
    }else{
     if(!samePlan(saved.plan,command.plan))throw Error('读取的计划正文与本次请求不一致');
     install(saved);setMessage('计划已保存，接下来去做这次真实确认。');
     try{setSource(assertSource(await followupCheckSourceAction(saved.resultId),saved.resultId,saved.caseId));}
     catch{setMessage('计划已保存；原调查结果核对没有完成，来源文字保持隐藏。');}
    }
   }
   setPending(null);pendingRef.current=null;
   try{await refreshList();}catch{setMessage('写入已完成，列表尚未刷新。请重新读取列表。');}
  }catch(error){
   setMessage(acknowledged?`已收到保存回执，重新读取尚未完成：${errorText(error)}。输入和原请求仍保留，请重试本次请求核对。`:`${errorText(error)} 输入和原请求仍保留，请重试本次请求。`);
  }finally{working.current=false;setBusy(false);}
 }
 function submit(operation:'save'|'erase'){
  if(working.current||pendingRef.current||conflict)return;
  if(operation==='erase'&&!active)return;
  if(operation==='save'&&(!preview||!canSave))return;
  if(!identity.current)identity.current=crypto.randomUUID();
  const common={id:identity.current,requestId:crypto.randomUUID(),expectedRevision:active?.revision??0};
  const command:FollowupCheckCommand=operation==='erase'?{operation,...common}:{operation,...common,resultId:sourceId,plan:preview!,confirmed:true};
  void execute(command);
 }
 function makePreview(){
  if(working.current||pendingRef.current||!canSave)return;
  const parsed=realityCheckPlanSchema.safeParse(draft);
  if(!parsed.success){setPreview(null);setMessage('请分别填写问题、什么会推翻它、具体做法和有效截止日期（1900—2200 年）。');return;}
  ++epoch.current;setPreview(parsed.data);setMessage('请逐项核对下方预览，再明确确认保存。');
 }
 async function comparePending(){
  const command=pendingRef.current;if(working.current||!command)return;
  working.current=true;setBusy(true);hideSource();setReleasable(false);
  try{
   const next=await followupCheckGetAction(command.id);
   if(!next){
    if(activeRef.current?.id===command.id)clearOwn(command.id);
    setMessage('目前没有读到这份计划，请重试原请求核对。');return;
   }
   assertRecord(next,command.id,activeRef.current??(command.operation==='save'?{resultId:command.resultId,caseId:caseId??next.caseId}:undefined));
   if(command.operation==='save'&&command.expectedRevision===0){setMessage('已读到这份计划，本次请求仍须重试原请求核对保存回执。');return;}
   if(next.revision<=command.expectedRevision){setMessage('尚未读到更新后的计划，原请求仍保留。');return;}
   setRemote(ownOnly(next));setConflict(true);setPreview(null);setMessage('最新保存内容列在下方，原请求仍保留。');
  }catch(error){setMessage(`保存状态核对没有完成：${errorText(error)} 原请求仍保留。`);}
  finally{working.current=false;setBusy(false);}
 }
 function adoptRemote(){
  if(working.current||!remote)return;
  ++epoch.current;setPending(null);pendingRef.current=null;setReleasable(false);install(remote);setMessage('已采用最新保存内容，请重新预览。');
 }
 async function reconcilePending(){
  const command=pendingRef.current;
  if(working.current||!command||command.operation!=='save'||command.expectedRevision!==0)return;
  working.current=true;setBusy(true);setReleasable(false);hideSource();setPreview(null);let retry=false;
  try{
   const saved=await followupCheckGetAction(command.id);
   if(saved){
    assertRecord(saved,command.id,{resultId:command.resultId,caseId:caseId??saved.caseId});
    if(saved.revision!==1||!samePlan(saved.plan,command.plan))throw Error('读取结果与本次请求不一致，请保留原请求继续核对。');
    retry=true;
   }else{
    const fresh=assertSource(await followupCheckSourceAction(command.resultId),command.resultId);
    if(fresh){setMessage('原调查结果仍存在，本次请求仍须重试核对。');return;}
    if(await followupCheckGetAction(command.id))throw Error('计划状态已改变，请重试本次请求核对。');
    setReleasable(true);setMessage('两次读取均未找到本次计划，且原调查结果已不可读取。可以明确结束本次请求并保留输入。');
   }
  }catch(error){setMessage(`保存状态核对没有完成：${errorText(error)} 原请求仍保留。`);}
  finally{working.current=false;setBusy(false);}
  if(retry)await execute(command);
 }
 function releasePending(){
  if(working.current||!releasable||pendingRef.current?.operation!=='save'||pendingRef.current.expectedRevision!==0)return;
  ++epoch.current;setPending(null);pendingRef.current=null;setReleasable(false);identity.current='';hideSource();setPreview(null);setDirty(true);
  setMessage('本次请求已结束，输入仍保留。请选择仍可读取的调查结果后再预览。');
 }
 async function more(kind:'plans'|'sources'){
  if(working.current||pendingRef.current)return;
  working.current=true;setBusy(true);setMessage('');
  try{
   if(kind==='plans'&&state.nextCursor)await refreshList(true);
   else if(kind==='sources'&&sources.nextCursor){
    const next=await followupCheckSourcesAction({...(caseId?{caseId}:{}),before:sources.nextCursor});
    setSources(old=>({...next,items:[...old.items,...next.items.filter(item=>!old.items.some(loaded=>loaded.id===item.id))]}));
   }
  }catch(error){setMessage(`读取没有完成：${errorText(error)} 已读取的独立内容仍保留。`);}
  finally{working.current=false;setBusy(false);}
 }
 return {state,sources,active,source,sourceId,draft,preview,dirty,pending,busy,blocked,remote,conflict,message,releasable,requestedSource,canSave,change,chooseSource,open,newDraft,refresh,execute,submit,makePreview,comparePending,adoptRemote,reconcilePending,releasePending,more,setPreview,setRequestedSource};
}
