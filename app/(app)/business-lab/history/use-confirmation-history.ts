'use client';

import {useEffect,useRef,useState} from 'react';
import type {ConfirmationHistory,ConfirmationNode,ConfirmationNodeKey} from '@/lib/domains/business-teardowns/history/domain';
import {confirmationHistoryListAction,confirmationHistoryGetAction} from './actions';
import {confirmationIdentity,confirmationKey} from './confirmation-history-view';
import type {ConfirmationHistoryPanelProps} from './confirmation-history-panel';

const errorText=(error:unknown)=>error instanceof Error?error.message:'暂时无法读取，请重试。';
const planSource=(node:ConfirmationNode)=>`${node.caseId}:${node.kind==='plan'?node.id:node.parent.id}`;
export function useConfirmationHistory({initialState,initialNode=null,caseId}:ConfirmationHistoryPanelProps){
 const initialNodes=[...initialState.items,...(initialNode?[initialNode]:[])];
 const initialErased=new Set(initialNodes.filter(node=>node.kind==='result'&&node.snapshotErasedAt!==null).map(planSource));
 const [state,setState]=useState(()=>({...initialState,items:initialState.items.filter(node=>node.kind!=='plan'||!initialErased.has(planSource(node)))})),[selected,setSelected]=useState(initialNode?.kind==='plan'&&initialErased.has(planSource(initialNode))?null:initialNode),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [trusted,setTrusted]=useState(()=>new Set(initialState.available?[...initialState.items,...(initialNode?[initialNode]:[])].map(confirmationIdentity):[]));
 const epoch=useRef(0),working=useRef(false),selectedKey=useRef<ConfirmationNodeKey|null>(initialNode?confirmationKey(initialNode):null),erased=useRef(new Set<string>());
 const erasedPlans=useRef(initialErased),knownPlanVersions=useRef(new Map(initialNodes.filter(node=>node.kind==='plan').map(node=>[confirmationIdentity(node),node.caseId])));
 const scope=caseId?{caseId}:{};
 function planErased(node:ConfirmationNode){return erasedPlans.current.has(planSource(node));}
 function retain(nodes:ConfirmationNode[]){return nodes.filter(node=>node.kind!=='plan'||!planErased(node));}
 function remember(nodes:ConfirmationNode[]){
  let added=false;
  for(const node of nodes){
   if(node.kind==='plan')knownPlanVersions.current.set(confirmationIdentity(node),node.caseId);
   if(node.kind==='result'&&node.snapshotErasedAt!==null&&!erasedPlans.current.has(planSource(node))){erasedPlans.current.add(planSource(node));added=true;}
  }
  if(added){setState(old=>({...old,items:retain(old.items)}));setSelected(old=>old?.kind==='plan'&&planErased(old)?null:old);}
 }
 function assertNode(node:ConfirmationNode|null,key:ConfirmationNodeKey){
  if(node&&(node.id!==key.id||node.kind!==key.kind||(key.kind==='plan'&&node.revision!==key.revision)||(caseId&&node.caseId!==caseId)))throw Error('这条确认记录与指定版本或案例不一致。');
  return node;
 }
 function assertPage(page:ConfirmationHistory){
  const keys=page.items.map(confirmationIdentity);
  if(page.items.length>20||new Set(keys).size!==keys.length||page.items.some(node=>caseId&&node.caseId!==caseId)||(!page.available&&(page.items.length!==0||page.nextCursor!==null)))throw Error('确认履历与指定案例不一致。');
  return page;
 }
 function forget(key:ConfirmationNodeKey){
  const identity=confirmationIdentity(key);erased.current.add(identity);
  const knownCase=key.kind==='plan'?knownPlanVersions.current.get(identity):undefined;
  if(knownCase)erasedPlans.current.add(`${knownCase}:${key.id}`);
  setState(old=>({...old,items:retain(old.items.filter(node=>confirmationIdentity(node)!==identity))}));
  setTrusted(old=>{const next=new Set(old);next.delete(identity);return next;});
  setSelected(old=>old&&confirmationIdentity(old)===identity?null:old);
 }
 function begin(){const ticket=++epoch.current;working.current=true;setBusy(true);setMessage('');return ticket;}
 function finish(ticket:number){if(ticket===epoch.current){working.current=false;setBusy(false);}}
 async function refresh(){
  const ticket=begin(),key=selectedKey.current;
  // Hide every cached body before starting any fresh authenticated read.
  setTrusted(new Set());
  const exact=key?confirmationHistoryGetAction(key).then(node=>{
   if(ticket!==epoch.current)return null;
   const checked=assertNode(node,key);if(!checked)forget(key);else remember([checked]);return checked;
  }):Promise.resolve(null);
  try{
   const [listed,opened]=await Promise.allSettled([confirmationHistoryListAction(scope).then(assertPage).then(page=>{if(ticket===epoch.current)remember(page.items);return page;}),exact]);
   if(ticket!==epoch.current)return;
   if(listed.status==='fulfilled'&&!listed.value.available){setState(listed.value);setSelected(null);return;}
   if(listed.status==='rejected')throw listed.reason;
   if(opened.status==='rejected')throw opened.reason;
   const items=retain(listed.value.items.filter(node=>!erased.current.has(confirmationIdentity(node))));
   const current=opened.value&&!erased.current.has(confirmationIdentity(opened.value))&&!(opened.value.kind==='plan'&&planErased(opened.value))?opened.value:null;
   setState({...listed.value,items});setSelected(current);
   setTrusted(new Set([...items,...(current?[current]:[])].map(confirmationIdentity)));
   if(key&&!current)setMessage('指定的原记录目前不可读取，已清除其缓存文字。');
  }catch(error){if(ticket===epoch.current)setMessage(`核对没有完成：${errorText(error)} 文字保持隐藏，请手动重新读取。`);}
  finally{finish(ticket);}
 }
 async function open(key:ConfirmationNodeKey){
  if(working.current)return;
  const ticket=begin();selectedKey.current=key;setSelected(null);
  const identity=confirmationIdentity(key);setTrusted(old=>{const next=new Set(old);next.delete(identity);return next;});
  try{
   const node=await confirmationHistoryGetAction(key);
   if(ticket!==epoch.current)return;
   const checked=assertNode(node,key);
   if(!checked){forget(key);setMessage('指定的原记录目前不可读取，已清除其缓存文字。');return;}
   remember([checked]);
   if(erased.current.has(identity)||(checked.kind==='plan'&&planErased(checked))){setMessage('指定的原记录目前不可读取，已清除其缓存文字。');return;}
   setSelected(checked);setState(old=>({...old,items:old.items.map(item=>confirmationIdentity(item)===identity?checked:item)}));
   setTrusted(old=>new Set([...old,identity]));
  }catch(error){if(ticket===epoch.current)setMessage(`打开没有完成：${errorText(error)} 文字保持隐藏，请手动重新读取。`);}
  finally{finish(ticket);}
 }
 async function more(){
  if(working.current||!state.nextCursor)return;
  const ticket=begin(),before=state.nextCursor;
  try{
   const page=assertPage(await confirmationHistoryListAction({...scope,before}));
   if(ticket!==epoch.current)return;
   if(!page.available){setState(page);setTrusted(new Set());setSelected(null);return;}
   remember(page.items);
   const fresh=retain(page.items.filter(node=>!erased.current.has(confirmationIdentity(node))));
   setState(old=>{const retained=retain(old.items),seen=new Set(retained.map(confirmationIdentity));return {...page,items:[...retained,...fresh.filter(node=>!seen.has(confirmationIdentity(node)))]};});
   setTrusted(old=>new Set([...old,...fresh.map(confirmationIdentity)]));
  }catch(error){if(ticket===epoch.current)setMessage(`下一页没有读取：${errorText(error)}`);}
  finally{finish(ticket);}
 }
 const focusState=useRef({refresh});focusState.current={refresh};
 useEffect(()=>{const requestEpoch=epoch,focus=()=>{void focusState.current.refresh();};window.addEventListener('focus',focus);return()=>{window.removeEventListener('focus',focus);++requestEpoch.current;};},[]);
 return {state,selected,busy,message,trusted,refresh,more,open,planErased};
}
