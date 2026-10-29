"use server";
import { createClient } from "@/lib/supabase/server";
import { createReplay,readReplay,guessReplay,advanceReplay } from "@/lib/domains/signals/events/replay";
import { replayExport } from "@/lib/domains/signals/events/replay-domain";
import { eventsEnabled } from "./enabled";
async function viewer() {
 if (!eventsEnabled()) throw new Error("事件档案暂未开启");
 const { data: { user },error } = await createClient().auth.getUser();
 if (error || !user) throw new Error("请先登录");
 return user.id;
}
async function result<T>(operation: () => Promise<T>) {
 try { return {ok:true as const,data:await operation()}; }
 catch(error) { return {ok:false as const,message:error instanceof Error ? error.message : "操作未完成，请重试"}; }
}
export async function createReplayAction(eventId:string,cutoff:string,mode:"archived"|"recovered",requestId:string) {
 return result(async()=>createReplay(await viewer(),eventId,cutoff,mode,requestId));
}
export async function guessReplayAction(eventId:string,sessionId:string,guess:string,requestId:string) {
 return result(async()=>guessReplay(await viewer(),eventId,sessionId,guess,requestId));
}
export async function advanceReplayAction(eventId:string,sessionId:string,requestId:string) {
 return result(async()=>advanceReplay(await viewer(),eventId,sessionId,requestId));
}
export async function exportReplayAction(eventId:string,sessionId:string) {
 return result(async()=>replayExport(await readReplay(await viewer(),eventId,sessionId)));
}
