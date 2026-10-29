"use client";
import { useRef,useState } from "react";
import { useRouter } from "next/navigation";
import { createReplayAction } from "./replay-actions";
import { runReplayRequest,tokyoReplayCutoff } from "@/lib/domains/signals/events/replay-client-requests";
export function ReplayStart({eventId}:{eventId:string}) {
 const router=useRouter(); const [cutoff,setCutoff]=useState(""); const [mode,setMode]=useState<"archived"|"recovered">("archived");
 const [consent,setConsent]=useState(false); const [error,setError]=useState(""); const [pending,setPending]=useState(false); const busy=useRef(false); const request=useRef<string>();
 function create() {
  void runReplayRequest(busy,setPending,setError,async()=>{
   request.current??=crypto.randomUUID();
   const response=await createReplayAction(eventId,tokyoReplayCutoff(cutoff),mode,request.current);
   if(response.ok) router.push(`/signals/events/${eventId}/replay/${response.data.id}`);
   else setError(response.message);
  });
 }
 return <section className="space-y-3 rounded-lg border p-4"><h2 className="font-medium">历史材料回放</h2>
 <p className="text-sm text-muted-foreground">先看截止时点的材料，记录不可改写的练习判断，再逐条揭示后续材料。练习判断不会写入真实预测。</p>
 <label className="block text-sm">截止时间（东京，Asia/Tokyo）<input aria-label="截止时间（东京）" disabled={pending} type="datetime-local" value={cutoff} onChange={e=>{setCutoff(e.target.value);request.current=undefined;}} className="ml-2 rounded border bg-background p-2"/></label>
 <select aria-label="回放模式" disabled={pending} value={mode} onChange={e=>{setMode(e.target.value as typeof mode);request.current=undefined;}} className="rounded border bg-background p-2"><option value="archived">当时存档</option><option value="recovered">回溯补录</option></select>
 <p className="text-sm text-muted-foreground">当时存档按保存时间和归属记录重建；回溯补录使用今天的策展集合，允许后来保存的旧报道，带有事后选择偏差。两种模式都不是干净的 AI 盲测，原文链接也可能已经更新。</p>
 <label className="block text-sm"><input type="checkbox" disabled={pending} checked={consent} onChange={e=>setConsent(e.target.checked)}/> 我理解这些限制，并避免在回放期间查阅实时材料</label>
 <button disabled={pending||!cutoff||!consent} className="rounded border px-3 py-2 disabled:opacity-50" onClick={create}>{pending?"正在冻结材料…":"冻结并开始回放"}</button>
 {error&&<p role="alert">{error}</p>}</section>;
}
