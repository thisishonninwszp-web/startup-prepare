import { replayInput } from "./replay-domain";
export async function runReplayRequest(gate:{current:boolean},setBusy:(value:boolean)=>void,setError:(value:string)=>void,operation:()=>Promise<void>):Promise<boolean> {
 if(gate.current) return false;
 gate.current=true;
 setBusy(true);
 setError("");
 try { await operation(); return true; }
 catch(error) { setError(error instanceof Error?error.message:"操作未完成，请保留输入后重试"); return false; }
 finally { gate.current=false; setBusy(false); }
}
export function tokyoReplayCutoff(value:string):string {
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("请输入有效的东京截止时间");
 return replayInput(`${value}:00+09:00`,"archived").cutoff;
}
