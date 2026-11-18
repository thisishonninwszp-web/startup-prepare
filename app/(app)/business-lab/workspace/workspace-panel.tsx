'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {workspaceHref,WORKSPACE_LABELS,type WorkspaceState} from '@/lib/domains/business-teardowns/workspace/domain';
import {loadCaseWorkspaceAction} from './actions';
export function BusinessWorkspacePanel({caseId,initialState}:{caseId:string;initialState:WorkspaceState}){
 const [state,setState]=useState(initialState),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const generation=useRef(0),inFlight=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function more(){if(inFlight.current||!state.nextCursor)return;inFlight.current=true;setBusy(true);setMessage('');const ticket=++generation.current;try{const next=await loadCaseWorkspaceAction({caseId,before:state.nextCursor});if(!mounted.current||ticket!==generation.current)return;if(!next.available){setMessage('保存过的工作暂时不可读取。当前这页仍保留，请稍后重试。');return;}setState(old=>({...next,items:[...old.items,...next.items.filter(item=>!old.items.some(prior=>prior.kind===item.kind&&prior.id===item.id))]}));}catch(error){if(mounted.current&&ticket===generation.current)setMessage(error instanceof Error?error.message:'暂时没有读到，请重试。');}finally{inFlight.current=false;if(mounted.current&&ticket===generation.current)setBusy(false);}}
 if(!state.available)return <p className="rounded-lg border p-4 text-sm leading-7">案例续写暂时不可读取（需要迁移 133）。各项练习仍可单独打开。</p>;
 if(!state.items.length)return null;
 return <section aria-label="继续这个案例的工作" className="space-y-4 rounded-lg border p-5"><div className="space-y-2"><h2 className="text-xl font-semibold">继续这个案例的工作</h2><p className="text-sm leading-7 text-muted-foreground">这里是你保存过的回答、假设、制作课题与方法。保存过计划，并不代表已经做过；方法草稿也需要另行确认。</p></div><ul className="space-y-3">{state.items.map(item=><li key={`${item.kind}:${item.id}`} className="space-y-2 border-b pb-4 last:border-0 last:pb-0"><p className="text-sm text-muted-foreground">{WORKSPACE_LABELS[item.kind]} · <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString('zh-CN',{timeZone:'Asia/Tokyo'})}</time></p><h3 className="font-medium">{item.title||WORKSPACE_LABELS[item.kind]}</h3><p className="whitespace-pre-wrap text-sm leading-7">{item.excerpt}</p>{item.nextCheck&&<p className="whitespace-pre-wrap text-sm leading-7">你写下的下一步：{item.nextCheck}</p>}{!item.sourceAvailable&&<p className="text-sm leading-7 text-muted-foreground">原出处已改变或暂不可读取。这里仅保留你独立写下的文字。</p>}<Button asChild size="sm" variant="outline"><Link href={workspaceHref(item)}>{item.kind==='learning'||item.kind==='lesson'?'打开这条方法，继续找反例':'打开这份记录'}</Link></Button></li>)}</ul>{message&&<p role="alert" className="text-sm leading-7">{message}</p>}{state.nextCursor&&<Button variant="outline" disabled={busy} onClick={()=>void more()}>更多保存的工作</Button>}</section>;
}
