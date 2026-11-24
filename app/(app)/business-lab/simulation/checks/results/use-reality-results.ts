'use client';

import {useEffect,useRef,useState} from 'react';
import {realityResultBodySchema,type RealityResultBody,type RealityResultCommand,type RealityResultRecord,type RealityResultVersion} from '@/lib/domains/business-teardowns/reality-results/domain';
import {realityResultsListAction,realityResultGetAction,realityResultPlansAction,realityResultVersionsAction,realityResultVersionAction,realityResultSaveAction} from './actions';
import type {RealityResultsPanelProps} from './reality-results-panel';
import {actionReviewSchema,type ActionReview} from '@/lib/domains/business-teardowns/action-choices/domain';
import type {ActionReviewDraft} from '../../../action-choices/action-review-fields';

const blank=():RealityResultBody=>({checkedOn:'',examined:'',found:'',sourceNote:'',sourceUrl:null,learned:''});
const errorText=(error:unknown)=>error instanceof Error?error.message:'暂时没有完成，请重试。';
const sameBody=(a:RealityResultBody,b:RealityResultBody)=>(Object.keys(a) as (keyof RealityResultBody)[]).every(key=>a[key]===b[key]);
const sameReview=(a:ActionReview|undefined,b:ActionReview|undefined)=>JSON.stringify(a??null)===JSON.stringify(b??null);
export function useRealityResults(props:RealityResultsPanelProps){
 const {initialState,initialPlans,initialVersions,initialRecord=null,initialSource=null,caseId,planId,initialPlanRevision,today}=props;
 const [state,setState]=useState(initialState),[plans,setPlans]=useState(initialPlans),[versions,setVersions]=useState(initialVersions);
 const [active,setActive]=useState(initialRecord),[source,setSource]=useState(initialSource);
 const [selectedPlan,setSelectedPlan]=useState(initialRecord?.planId??initialSource?.planId??planId??'');
 const [selectedRevision,setSelectedRevision]=useState(initialRecord?.planRevision??initialSource?.revision??initialPlanRevision??0);
 const [verified,setVerified]=useState(!!initialSource&&!initialRecord?.snapshotErasedAt);
 const [draft,setDraft]=useState<RealityResultBody>(blank),[preview,setPreview]=useState<RealityResultBody|null>(null),[dirty,setDirty]=useState(false);
 const [reviewDraft,setReviewDraft]=useState<ActionReviewDraft|null>(null),[reviewPreview,setReviewPreview]=useState<ActionReview|null>(null);
 const [pending,setPending]=useState<RealityResultCommand|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [releasable,setReleasable]=useState(false);
 const working=useRef(false),epoch=useRef(0),activeRef=useRef(active),pendingRef=useRef(pending);
 const erasedIds=useRef(new Set<string>());
 activeRef.current=active;pendingRef.current=pending;
 const blocked=busy||pending!==null;
 const scoped={...(caseId?{caseId}:{}),...(planId?{planId}:{})};
 const canCreate=verified&&!!source&&!active;
 function inScope(record:RealityResultRecord,id:string){return record.id===id&&(!caseId||record.caseId===caseId)&&(!planId||record.planId===planId);}
 function assertSource(next:RealityResultVersion|null,id:string,revision?:number,expectedCase?:string){
  if(next&&(next.planId!==id||(revision&&next.revision!==revision)||(caseId&&next.caseId!==caseId)||(expectedCase&&next.caseId!==expectedCase)))throw Error('选定的计划版本目前不可读取。');
  return next;
 }
 function hideSource(){setVerified(false);setSource(null);setPreview(null);setReviewPreview(null);}
 function forget(id:string){
  erasedIds.current.add(id);setState(old=>({...old,items:old.items.filter(item=>item.id!==id)}));
  if(activeRef.current?.id===id){setActive(null);activeRef.current=null;setPreview(null);hideSource();}
 }
 function install(record:RealityResultRecord){
  ++epoch.current;setActive(record);activeRef.current=record;setSelectedPlan(record.planId);setSelectedRevision(record.planRevision);hideSource();setDraft(blank());setReviewDraft(null);setPreview(null);setDirty(false);
 }
 function change(patch:Partial<RealityResultBody>){if(working.current||pendingRef.current||activeRef.current)return;++epoch.current;setDraft(old=>({...old,...patch}));setPreview(null);setReviewPreview(null);setDirty(true);}
 function changeReview(value:ActionReviewDraft|null){if(working.current||pendingRef.current||activeRef.current)return;++epoch.current;setReviewDraft(value);setPreview(null);setReviewPreview(null);setDirty(true);}
 async function verifyCurrent(){
  if(working.current||pendingRef.current){hideSource();return;}
  const ticket=++epoch.current,current=activeRef.current,id=current?.planId??selectedPlan,revision=current?.planRevision??selectedRevision;
  hideSource();if(!id)return;
  try{
   if(current){
    const next=await realityResultGetAction(current.id);
    if(ticket!==epoch.current||working.current||pendingRef.current)return;
    if(!next){forget(current.id);setMessage('这条调查结果已不可读取，已从当前画面清除。');return;}
    if(!inScope(next,current.id)||next.planId!==current.planId||next.planRevision!==current.planRevision||next.revision!==1||!sameBody(next.body,current.body)||!sameReview(next.actionReview,current.actionReview)){setPreview(null);setMessage('这条调查结果目前不可读取，已经显示的独立正文仍保留。');return;}
    setActive(old=>old?.id===next.id?{...old,planSnapshot:next.planSnapshot,snapshotErasedAt:next.snapshotErasedAt,planCurrentRevision:next.planCurrentRevision,expectations:next.expectations,actionChoice:next.actionChoice}:old);
    if(!next.planSnapshot||next.snapshotErasedAt){setPreview(null);return;}
   }
   const next=assertSource(await realityResultVersionAction({planId:id,...(revision?{revision}:{})}),id,revision,current?.caseId);
   if(ticket!==epoch.current||working.current||pendingRef.current)return;
   setSource(next);setVerified(!!next);if(!next){setPreview(null);setMessage('原计划版本目前不可读取，调查正文仍保留。');}
  }catch(error){if(ticket===epoch.current&&!working.current){setPreview(null);setMessage(`核对没有完成：${errorText(error)} 原计划文字保持隐藏，调查正文仍保留。`);}}
 }
 useEffect(()=>{
  if(initialRecord&&activeRef.current?.id===initialRecord.id&&(!initialRecord.planSnapshot||initialRecord.snapshotErasedAt)){
   ++epoch.current;hideSource();setPreview(null);setActive(old=>old?.id===initialRecord.id?{...old,planSnapshot:null,snapshotErasedAt:initialRecord.snapshotErasedAt,expectations:undefined,actionChoice:undefined}:old);
  }
 },[initialRecord]);
 const focusState=useRef({busy,verifyCurrent});focusState.current={busy,verifyCurrent};
 useEffect(()=>{const focus=()=>{if(!focusState.current.busy)void focusState.current.verifyCurrent();};window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[]);

 async function choosePlan(id:string,revision?:number){
  if(working.current||pendingRef.current||activeRef.current)return;
  if(planId&&id!==planId){setMessage('当前页面只从指定计划新记调查结果。');return;}
  const ticket=++epoch.current;hideSource();setSelectedPlan(id);setSelectedRevision(revision??0);setPreview(null);setDirty(true);setMessage('');
  if(reviewDraft){setReviewDraft(null);setMessage('已选择计划版本，请按这一版重新填写行动对照。独立调查正文仍保留。');}
  if(!revision)setVersions({items:[],nextCursor:null});
  if(!id)return;
  setBusy(true);
  try{
   const next=assertSource(await realityResultVersionAction({planId:id,...(revision?{revision}:{})}),id,revision);
   if(ticket!==epoch.current)return;
   setSource(next);setVerified(!!next);if(next)setSelectedRevision(next.revision);else setMessage('原计划版本目前不可读取，调查正文仍保留。');
   if(next&&(!revision||!versions.items.length)){const page=await realityResultVersionsAction({planId:id});if(ticket===epoch.current)setVersions(page);}
  }catch(error){if(ticket===epoch.current)setMessage(errorText(error));}finally{if(ticket===epoch.current)setBusy(false);}
 }
 async function open(id:string){
  if(working.current||pendingRef.current)return;
  const ticket=++epoch.current;setBusy(true);hideSource();setPreview(null);setMessage('');
  try{
   const next=await realityResultGetAction(id);
   if(ticket!==epoch.current)return;
   if(!next){forget(id);setMessage('这条调查结果已不可读取，已从列表清除，其他独立输入仍保留。');return;}
   if(!inScope(next,id)||erasedIds.current.has(id))throw Error('这条调查结果目前不可读取，当前输入仍保留。');
   install(next);const installed=epoch.current;
   if(next.planSnapshot&&!next.snapshotErasedAt){
    const version=assertSource(await realityResultVersionAction({planId:next.planId,revision:next.planRevision}),next.planId,next.planRevision,next.caseId);
    if(installed!==epoch.current)return;setSource(version);setVerified(!!version);
   }
   setVersions({items:[],nextCursor:null});
  }catch(error){setMessage(errorText(error));}finally{setBusy(false);}
 }
 async function newDraft(insideWrite=false){
  if(!insideWrite&&(working.current||pendingRef.current))return;
  ++epoch.current;setActive(null);activeRef.current=null;setDraft(blank());setReviewDraft(null);setPreview(null);setDirty(false);hideSource();setMessage('');
  const id=planId??selectedPlan,revision=selectedRevision;
  setSelectedPlan(id);setSelectedRevision(revision);
  if(id&&!insideWrite){await choosePlan(id,revision||undefined);setDirty(false);}
 }
 async function refreshList(more=false){
  const page=await realityResultsListAction({...scoped,...(more&&state.nextCursor?{before:state.nextCursor}:{})});
  const next={...page,items:page.items.filter(item=>!erasedIds.current.has(item.id))};
  setState(old=>more?{...next,items:[...old.items.filter(item=>!erasedIds.current.has(item.id)),...next.items.filter(item=>!old.items.some(loaded=>loaded.id===item.id))]}:next);
 }
 async function refresh(){
  if(blocked)return;setBusy(true);setMessage('');
  try{await Promise.all([refreshList(),verifyCurrent()]);}catch(error){setMessage(`列表读取没有完成：${errorText(error)}`);}finally{setBusy(false);}
 }
 async function execute(command:RealityResultCommand){
  if(working.current)return;
  working.current=true;++epoch.current;setBusy(true);setPending(command);pendingRef.current=command;setReleasable(false);setMessage('');let acknowledged=false;
  try{
   const receipt=await realityResultSaveAction(command);acknowledged=true;
   if(receipt.id!==command.id||receipt.revision!==(command.operation==='append'?1:2))throw Error('保存回执与本次请求不一致');
   if(command.operation==='erase'){forget(command.id);await newDraft(true);setMessage('调查结果已擦除。');}
   else{
    const saved=await realityResultGetAction(command.id);
    if(!saved||!inScope(saved,command.id)||saved.revision!==1||saved.planId!==command.planId||saved.planRevision!==command.planRevision||!sameBody(saved.body,command.body)||!sameReview(saved.actionReview,command.actionReview))throw Error('尚未读到与本次请求一致的调查结果');
    install(saved);setMessage('调查结果已保存。补充或修正请另记一条。');
    if(saved.planSnapshot&&!saved.snapshotErasedAt){
     try{const version=assertSource(await realityResultVersionAction({planId:saved.planId,revision:saved.planRevision}),saved.planId,saved.planRevision,saved.caseId);setSource(version);setVerified(!!version);}
     catch{setMessage('调查结果已保存；原计划版本核对没有完成，条件文字保持隐藏。');}
    }
   }
   setPending(null);pendingRef.current=null;
   try{await refreshList();}catch{setMessage('写入已完成，列表尚未刷新。请重新读取列表。');}
  }catch(error){setMessage(acknowledged?`已收到保存回执，重新读取尚未完成：${errorText(error)}。原请求仍保留，请重试本次请求核对。`:`${errorText(error)} 输入和原请求仍保留，请重试本次请求。`);}
  finally{working.current=false;setBusy(false);}
 }
 async function reconcilePending(){
  const command=pendingRef.current;
  if(working.current||!command||command.operation!=='append')return;
  working.current=true;setBusy(true);setReleasable(false);hideSource();setPreview(null);
  let retry=false;
  try{
   const saved=await realityResultGetAction(command.id);
   if(saved){
    if(!inScope(saved,command.id)||saved.planId!==command.planId||saved.planRevision!==command.planRevision||saved.revision!==1||!sameBody(saved.body,command.body)||!sameReview(saved.actionReview,command.actionReview))throw Error('读取结果与本次请求不一致，请保留原请求继续核对。');
    retry=true;
   }else{
    const version=assertSource(await realityResultVersionAction({planId:command.planId,revision:command.planRevision}),command.planId,command.planRevision);
    if(version){setMessage('原计划版本仍存在，本次请求仍须重试核对。');return;}
    if(await realityResultGetAction(command.id))throw Error('调查结果状态已改变，请重试本次请求核对。');
    setReleasable(true);setMessage('两次读取均未找到本次结果，且原计划版本已不可读取。可以明确结束本次请求并保留输入。');
   }
  }catch(error){setMessage(`保存状态核对没有完成：${errorText(error)} 原请求仍保留。`);}
  finally{working.current=false;setBusy(false);}
  if(retry)await execute(command);
 }
 function releasePending(){
  if(working.current||!releasable||pendingRef.current?.operation!=='append')return;
  ++epoch.current;setPending(null);pendingRef.current=null;setReleasable(false);hideSource();setPreview(null);setDirty(true);setMessage('本次请求已结束，输入仍保留。请选择仍可读取的原计划版本后再预览。');
 }
 function makePreview(){
  if(blocked||!canCreate)return;
  const parsed=realityResultBodySchema.safeParse(draft);
  if(!parsed.success||parsed.data.checkedOn>today){setPreview(null);setMessage('请填写真实有效且不晚于今天的调查日期、四项独立记录，以及有效的 HTTPS 网址（可不填）。');return;}
  let review:ActionReview|null=null;
  if(reviewDraft){const parsedReview=actionReviewSchema.safeParse(reviewDraft);if(!source?.actionChoice||!parsedReview.success||(parsedReview.data.execution&&parsedReview.data.execution.actedOn>today)){setPreview(null);setReviewPreview(null);setMessage('请按选定版本填写行动对照；已执行事项与日期须一起填写，日期不得晚于今天。');return;}review=parsedReview.data;}
  setReviewPreview(review);
  ++epoch.current;setPreview(parsed.data);setMessage('请对照原条件与调查结果，再明确确认保存。');
 }
 function append(){
  if(blocked||!preview||!canCreate||!source)return;
  void execute({operation:'append',id:crypto.randomUUID(),requestId:crypto.randomUUID(),planId:source.planId,planRevision:source.revision,body:preview,confirmed:true,...(reviewPreview?{actionReview:reviewPreview}:{})});
 }
 function erase(){if(blocked||!active)return;void execute({operation:'erase',id:active.id,requestId:crypto.randomUUID(),expectedRevision:1});}
 async function more(kind:'results'|'plans'|'versions'){
  if(blocked)return;setBusy(true);setMessage('');
  try{
   if(kind==='results'){if(state.nextCursor)await refreshList(true);}
   else if(kind==='plans'&&plans.nextCursor){const next=await realityResultPlansAction({...(caseId?{caseId}:{}),before:plans.nextCursor});setPlans(old=>({...next,items:[...old.items,...next.items.filter(item=>!old.items.some(loaded=>loaded.id===item.id))]}));}
   else if(kind==='versions'&&versions.nextCursor&&selectedPlan){const ticket=epoch.current;const next=await realityResultVersionsAction({planId:selectedPlan,before:versions.nextCursor});if(ticket===epoch.current)setVersions(old=>({...next,items:[...old.items,...next.items.filter(item=>!old.items.some(loaded=>loaded.revision===item.revision))]}));}
  }catch(error){setMessage(`读取没有完成：${errorText(error)} 已读取内容仍保留。`);}finally{setBusy(false);}
 }
 return {state,plans,versions,active,source,selectedPlan,selectedRevision,verified,draft,preview,reviewDraft,reviewPreview,changeReview,dirty,pending,busy,blocked,message,canCreate,releasable,reconcilePending,releasePending,change,choosePlan,open,newDraft,refresh,execute,makePreview,append,erase,more,setPreview,verifyCurrent};
}
