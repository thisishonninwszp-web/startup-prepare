import { describe,expect,it } from "vitest";
import { runReplayRequest,tokyoReplayCutoff } from "./replay-client-requests";
describe("replay async controls",()=>{
 it("holds busy state and suppresses duplicate requests until the action settles",async()=>{
  let release!:()=>void; const held=new Promise<void>(resolve=>{release=resolve;});
  const gate={current:false}; const busy:boolean[]=[]; const errors:string[]=[]; let calls=0;
  const operation=()=>{calls++;return held;};
  const first=runReplayRequest(gate,v=>busy.push(v),v=>errors.push(v),operation);
  expect(gate.current).toBe(true); expect(busy).toEqual([true]);
  expect(await runReplayRequest(gate,v=>busy.push(v),v=>errors.push(v),operation)).toBe(false);
  expect(calls).toBe(1); expect(busy).toEqual([true]);
  release(); expect(await first).toBe(true); expect(gate.current).toBe(false); expect(busy).toEqual([true,false]);
 });
 it("catches transport failures and clears busy in finally so the same input can retry",async()=>{
  const gate={current:false}; const busy:boolean[]=[]; const errors:string[]=[];
  expect(await runReplayRequest(gate,v=>busy.push(v),v=>errors.push(v),async()=>{throw new Error("网络中断");})).toBe(false);
  expect(errors.at(-1)).toBe("网络中断"); expect(busy).toEqual([true,false]); expect(gate.current).toBe(false);
  expect(await runReplayRequest(gate,()=>{},()=>{},async()=>{})).toBe(true);
 });
 it("interprets the entered minute explicitly as Tokyo rather than the browser timezone",()=>{
  expect(tokyoReplayCutoff("2026-01-01T00:00")).toBe("2025-12-31T15:00:00.000Z");
 });
});
