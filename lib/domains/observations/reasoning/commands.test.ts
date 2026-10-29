import { beforeEach, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { rpc } }));
import { saveReasoning } from "./commands";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
beforeEach(() => rpc.mockReset());
it("validates locally and sends normalized inputs to the atomic RPC", async () => {
  rpc.mockResolvedValue({data:{id},error:null});
  await saveReasoning(id,id,{requestId:id,expectedRevision:0,kind:"claim",payload:{text:"我的判断",refs:[{snapshotId:id,quote:"原文"}],claimIds:[]}});
  expect(rpc).toHaveBeenCalledWith("append_event_reasoning",expect.objectContaining({p_user_id:id,p_event_id:id,p_expected_revision:0,p_kind:"claim"}));
});
it("rejects fractional revisions before a database call", async () => {
  await expect(saveReasoning(id,id,{requestId:id,expectedRevision:0.5,kind:"claim",payload:{}})).rejects.toThrow();expect(rpc).not.toHaveBeenCalled();
});
it("does not swallow database ownership or conflict errors", async () => {
  rpc.mockResolvedValue({data:null,error:{message:"stale reasoning revision"}});
  await expect(saveReasoning(id,id,{requestId:id,expectedRevision:0,kind:"claim",payload:{text:"判断",refs:[{snapshotId:id,quote:"原文"}],claimIds:[]}})).rejects.toThrow("stale");
});
