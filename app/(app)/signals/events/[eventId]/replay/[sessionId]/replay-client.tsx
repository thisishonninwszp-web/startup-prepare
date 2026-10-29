"use client";
import { useRef,useState } from "react";
import type { ReplayView } from "@/lib/domains/signals/events/replay-domain";
import { runReplayRequest } from "@/lib/domains/signals/events/replay-client-requests";
import { advanceReplayAction,guessReplayAction,exportReplayAction } from "../../../replay-actions";
export function ReplayClient({eventId,initial}:{eventId:string;initial:ReplayView}) {
 const [view,setView]=useState(initial); const [guess,setGuess]=useState(""); const [error,setError]=useState(""); const [pending,setPending]=useState(false); const busy=useRef(false);
 const guessId=useRef<string>(); const advanceId=useRef<string>();
 function save() {void runReplayRequest(busy,setPending,setError,async()=>{guessId.current??=crypto.randomUUID();const r=await guessReplayAction(eventId,view.id,guess,guessId.current);if(r.ok){setView(r.data);}else setError(r.message);});}
 function advance() {void runReplayRequest(busy,setPending,setError,async()=>{advanceId.current??=crypto.randomUUID();const r=await advanceReplayAction(eventId,view.id,advanceId.current);if(r.ok){setView(r.data);advanceId.current=undefined;}else setError(r.message);});}
 function download() {void runReplayRequest(busy,setPending,setError,async()=>{const r=await exportReplayAction(eventId,view.id);if(!r.ok){setError(r.message);return;}const url=URL.createObjectURL(new Blob([r.data],{type:"application/json;charset=utf-8"}));try{const a=document.createElement("a");a.href=url;a.download="historical-replay.json";a.click();}finally{URL.revokeObjectURL(url);}});}
 return <div className="space-y-5"><p>截止：{view.cutoff} · {view.mode==="archived"?"当时存档":"回溯补录（事后策展集合）"}</p>
 <p className="text-sm text-muted-foreground">材料已冻结。后存旧闻并不等于当时知道；回放不构成干净的 AI 盲测。请依据页面内保存的文字判断，原文链接可能包含后续更新。</p>
 <div className="space-y-4">{view.materials.map((m,i)=><article key={i} className="space-y-2 rounded border p-4"><p className="text-xs text-muted-foreground">{m.availableAt} · {m.source}{m.retrospective?" · 回溯补录":""}</p><h2 className="font-medium">{m.title}</h2><p className="whitespace-pre-wrap">{m.text}</p><p className="text-xs">发表：{m.publishedAt??"未知"} · 保存：{m.capturedAt??"无"}</p>{m.url&&<a href={m.url} target="_blank" rel="noopener noreferrer" className="text-sm underline">原文（可能已更新）</a>}</article>)}{view.materials.length===0&&<p>截止时点没有符合此模式的已存材料。</p>}</div>
 {view.guess?<section className="rounded border p-4"><h2>已锁定的练习判断</h2><p className="whitespace-pre-wrap">{view.guess}</p></section>:<section className="space-y-2"><label htmlFor="practice-guess">根据已揭示材料，你认为接下来会发生什么？</label><textarea id="practice-guess" disabled={pending} maxLength={4000} value={guess} onChange={e=>{setGuess(e.target.value);guessId.current=undefined;}} className="block min-h-28 w-full rounded border bg-background p-3"/><button disabled={pending||!guess.trim()} onClick={save} className="rounded border px-3 py-2 disabled:opacity-50">锁定练习判断</button><p className="text-xs">保存后不可修改，与真实预测分开保存。</p></section>}
 <div className="flex gap-3">{view.guess&&<button disabled={pending||view.complete} onClick={advance} className="rounded border px-3 py-2 disabled:opacity-50">{view.complete?"已揭示全部冻结材料":"揭示下一条材料"}</button>}<button disabled={pending} onClick={download} className="rounded border px-3 py-2">导出已揭示材料和判断</button></div>{error&&<p role="alert">{error}</p>}</div>;
}
