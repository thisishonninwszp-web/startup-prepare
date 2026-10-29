import { expect, it, vi, beforeEach } from "vitest";
const rpc = vi.hoisted(() => vi.fn());vi.mock("@/lib/supabase",()=>({supabaseAdmin:{rpc}}));
import { loadReasoning } from "./queries";
const id="aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
beforeEach(()=>rpc.mockReset());
it("drains correction impact pages with monotonic cursor without dropping entry history",async()=>{
  rpc.mockResolvedValueOnce({data:{available:true,entries:[{id:"one"}],nextRevision:1,currentRevision:3,impacts:[{id:"impact1",revision:1}],nextImpactRevision:1},error:null});
  rpc.mockResolvedValueOnce({data:{entries:[{id:"one"}],impacts:[{id:"impact2",revision:2}],nextImpactRevision:null},error:null});
  const state=await loadReasoning(id,id,0,1);expect(state.entries).toEqual([{id:"one"}]);expect(state.impacts.map(r=>r.id)).toEqual(["impact1","impact2"]);expect(state.currentRevision).toBe(3);expect(rpc.mock.calls[1][1].p_after_impact_revision).toBe(1);
});
it("reports missing migration clearly, while propagating unrelated errors",async()=>{
  rpc.mockResolvedValueOnce({data:null,error:{code:"PGRST202",message:"Could not find function public.list_event_reasoning"}});
  expect((await loadReasoning(id,id)).available).toBe(false);
  rpc.mockResolvedValueOnce({data:null,error:{message:"permission denied"}});await expect(loadReasoning(id,id)).rejects.toThrow("permission denied");
});
