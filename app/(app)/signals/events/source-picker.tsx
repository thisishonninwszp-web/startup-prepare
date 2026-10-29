'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {listReasoningSourcesAction,getReasoningSourceAction} from './reasoning-source-actions';
import type {ReasoningSource,ReasoningSourceSummary} from '@/lib/domains/observations/reasoning-sources';
export function ReasoningSourcePicker(props:{eventId:string;onSelect:(source:ReasoningSource)=>void;label?:string}){
 return <SourcePicker key={props.eventId} {...props}/>;
}
function SourcePicker({eventId,onSelect,label='选择已保存来源'}:{eventId:string;onSelect:(source:ReasoningSource)=>void;label?:string}){
 const [items,setItems]=useState<ReasoningSourceSummary[]>([]),[cursor,setCursor]=useState<string|null>(null),[selected,setSelected]=useState<ReasoningSource|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const lock=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function load(more=false){if(lock.current)return;lock.current=true;setBusy(true);setMessage('');try{const r=await listReasoningSourcesAction(eventId,more?cursor??undefined:undefined);if(!mounted.current)return;setItems(old=>more?[...old,...r.items]:r.items);setCursor(r.nextCursor);}catch{if(mounted.current)setMessage('来源目录暂不可用，请重试。');}finally{lock.current=false;if(mounted.current)setBusy(false);}}
 async function select(id:string){if(lock.current)return;lock.current=true;setBusy(true);setMessage('');try{const source=await getReasoningSourceAction(eventId,id);if(!mounted.current)return;onSelect(source);setSelected(source);}catch{if(mounted.current)setMessage('未能读取来源原文，请重试。');}finally{lock.current=false;if(mounted.current)setBusy(false);}}
 return <div className="space-y-2 rounded border p-3 text-xs"><Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>void load()}>{label}</Button><p className="text-muted-foreground">只列本事件曾保存的来源；摘录范围以原文快照为准。</p><div className="max-h-56 space-y-2 overflow-y-auto">{items.map(s=><button key={s.id} type="button" disabled={busy} className="block w-full break-words rounded border p-2 text-left hover:bg-muted" onClick={()=>void select(s.id)}>{s.title}<span className="block text-muted-foreground">{s.captured_at.slice(0,10)} · {s.id.slice(0,8)}</span></button>)}</div>{cursor&&<Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>void load(true)}>读取更多来源</Button>}{selected&&<details><summary className="cursor-pointer">已选：{selected.title}</summary><p className="mt-2 text-muted-foreground">捕获范围：{selected.capture_scope === "summary" ? "发布方简介" : selected.capture_scope === "excerpt" ? "正文摘录" : selected.capture_scope === "body" ? "已保存正文" : "以来源快照为准"}</p><p className="my-2 whitespace-pre-wrap break-words">{selected.captured_text}</p><a className="underline" href={`/signals/events/${eventId}/sources/${selected.id}`}>打开冻结快照</a></details>}{busy&&<p role="status">正在读取来源……</p>}{message&&<p role="status">{message}</p>}</div>;
}
