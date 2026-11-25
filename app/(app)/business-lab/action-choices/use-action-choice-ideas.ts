'use client';
import {useEffect,useRef,useState} from 'react';
import {actionChoiceInputSchema,type ActionChoiceInput,type ActionChoiceView,type ActionChoiceIdeas} from '@/lib/domains/business-teardowns/action-choices/domain';
import {loadActionChoiceIdeasAction} from './actions';

export function useActionChoiceIdeas(initial?:ActionChoiceView,onInvalidate?:()=>void){
 const [page,setPage]=useState<ActionChoiceIdeas|null>(null),[linked,setLinked]=useState<ActionChoiceView|null>(initial??null),[loading,setLoading]=useState(false),[message,setMessage]=useState('');
 const epoch=useRef(0),mounted=useRef(true),current=useRef<ActionChoiceIdeas|null>(null),failure=useRef<Error|null>(null),inflight=useRef<Promise<ActionChoiceIdeas>|null>(null),invalidate=useRef(onInvalidate);
 // Exact plan reads override candidate pages until a new context refresh, even
 // after resetting or switching the independent draft.
 const verifiedIdeas=useRef(new Map<string,{ideaAvailable:boolean;ideaTitle:string|null}>());
 invalidate.current=onInvalidate;
 function verifyLinked(value?:ActionChoiceView,ticket?:number){if(ticket!==undefined&&ticket!==epoch.current)return;if(value?.choice.relatedIdeaId)verifiedIdeas.current.set(value.choice.relatedIdeaId,{ideaAvailable:value.ideaAvailable,ideaTitle:value.ideaTitle});setLinked(value??null);}
 function hide(){++epoch.current;current.current=null;verifiedIdeas.current.clear();setPage(null);verifyLinked();failure.current=null;invalidate.current?.();}
 async function refresh():Promise<ActionChoiceIdeas>{
  hide();const ticket=epoch.current;setLoading(true);setMessage('');
  const request=loadActionChoiceIdeasAction();inflight.current=request;
  try{const next=await request;if(mounted.current&&ticket===epoch.current){current.current=next;setPage(next);}return next;}
  catch(error){if(mounted.current&&ticket===epoch.current){failure.current=error instanceof Error?error:Error('本人想法暂未读到');setMessage(`本人想法核对没有完成：${failure.current.message}。旧标题保持隐藏，独立输入仍保留。`);}throw error;}
  finally{if(mounted.current&&ticket===epoch.current){setLoading(false);inflight.current=null;}}
 }
 async function ensure():Promise<ActionChoiceIdeas>{
  if(current.current)return current.current;if(failure.current)throw failure.current;
  const request=inflight.current??refresh(),ticket=epoch.current;
  try{await request;}catch(error){if(ticket!==epoch.current)return ensure();throw error;}
  if(ticket!==epoch.current)return ensure();
  if(!current.current)throw Error('本人想法核对尚未完成，请重新读取。');return current.current;
 }
 async function more(){
  const before=current.current?.nextCursor;if(!before||loading)return;const ticket=epoch.current;setLoading(true);setMessage('');
  try{const next=await loadActionChoiceIdeasAction({before});if(!mounted.current||ticket!==epoch.current||current.current?.nextCursor!==before)return;const merged={...next,items:[...current.current.items,...next.items.filter(item=>!current.current!.items.some(old=>old.id===item.id))]};current.current=merged;setPage(merged);}
  catch(error){if(mounted.current&&ticket===epoch.current)setMessage(`更多本人想法暂未读到：${error instanceof Error?error.message:'请重试'}。`);}
  finally{if(mounted.current&&ticket===epoch.current)setLoading(false);}
 }
 const latest=useRef(refresh);latest.current=refresh;
 useEffect(()=>{mounted.current=true;const focus=()=>void latest.current().catch(()=>{});window.addEventListener('focus',focus);void latest.current().catch(()=>{});return()=>{mounted.current=false;window.removeEventListener('focus',focus);};},[]);
 // The initial plan DTO is already a fresh owned read. Subsequent focus hides it
 // until the containing editor independently verifies that exact plan again.
 const started=useRef(false);useEffect(()=>{if(!started.current){started.current=true;verifyLinked(initial);}},[initial]);
 const items=(page?.items??[]).flatMap(item=>{const verified=verifiedIdeas.current.get(item.id);return verified?(verified.ideaAvailable?[{...item,title:verified.ideaTitle??''}]:[]):[item];});
 return {available:page?.available??null,items,nextCursor:page?.nextCursor??null,linked,loading,message,refresh:async()=>{try{await refresh();}catch{}},more,ensure,verifyLinked,generation:()=>epoch.current,lookup:(id:string)=>{const verified=verifiedIdeas.current.get(id);if(verified)return verified;const item=current.current?.items.find(item=>item.id===id);return item?{ideaAvailable:true,ideaTitle:item.title}:{ideaAvailable:false,ideaTitle:null};}};
}

export function useActionChoiceEditor(initial:ActionChoiceView|undefined,mode:'explicit'|'expectations',onInvalidate:()=>void){
 const [choice,setChoice]=useState<ActionChoiceInput|null>(initial?.choice??null),[previewChoice,setPreviewChoice]=useState<ActionChoiceView|null>(null);
 const stored=useRef(initial?.choice??null);
 const ideas=useActionChoiceIdeas(initial,()=>{setPreviewChoice(null);onInvalidate();});
 function invalidate(){setPreviewChoice(null);}
 function change(value:ActionChoiceInput|null){setChoice(value);invalidate();onInvalidate();}
 function install(value?:ActionChoiceView,ticket?:number){stored.current=value?.choice??null;setChoice(value?.choice??null);invalidate();if(!value)ideas.verifyLinked();else if(ticket!==undefined)ideas.verifyLinked(value,ticket);}
 function makePreview(expectations?:{expectedA:string;expectedB:string}){
  if(!choice){setPreviewChoice(null);return null;}
  if(ideas.available!==true)throw Error('行动约定暂不可用，请先重新读取本人想法；独立输入仍保留。');
  const parsed=actionChoiceInputSchema.safeParse(choice);if(!parsed.success||parsed.data.conditions.kind!==mode)throw Error('请亲手填完选择、三项具体行动、观察条件，并明确选择三个分支行动。');
  const value=parsed.data,conditions=value.conditions;
  const view:ActionChoiceView={choice:value,conditionA:conditions.kind==='explicit'?conditions.a:expectations?.expectedA??'',conditionB:conditions.kind==='explicit'?conditions.b:expectations?.expectedB??'',...(value.relatedIdeaId?ideas.lookup(value.relatedIdeaId):{ideaAvailable:false,ideaTitle:null})};
  setPreviewChoice(view);return view;
 }
 async function command(pinned:ActionChoiceView|null=previewChoice):Promise<{actionChoice?:ActionChoiceInput|null}>{
  const capability=await ideas.ensure();
  if(!capability.available){if(choice||stored.current||pinned)throw Error('行动约定暂不可用，已填写的选择不能丢弃；请执行迁移 151 后重试。');return {};}
  if(choice&&!pinned)throw Error('行动约定已改变，请重新预览后再确认保存。');
  return {actionChoice:pinned?.choice??null};
 }
 return {choice,previewChoice,ideas,change,install,reset:()=>install(),invalidate,makePreview,command,verifyLinked:(value:ActionChoiceView|undefined,ticket:number)=>ideas.verifyLinked(value,ticket),dirty:JSON.stringify(choice)!==JSON.stringify(stored.current)};
}
