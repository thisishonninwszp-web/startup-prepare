import { expect, it } from "vitest";
import { reasoningPayload } from "./reasoning-fields";
const ref = (snapshotId: string, quote: string) => ({ snapshotId, quote });
it("keeps new facts separate from source independence", () => {
  const data = new FormData(); data.set("text", "新增停产日期"); data.set("increment", "停产日期"); data.set("independence", "shared"); data.set("independenceBasis", "明确转载");
  expect(reasoningPayload("increment", data, [ref("a", "旧文"), ref("b", "新文")])).toMatchObject({ increment: "停产日期", independence: "shared", baseline: ref("a", "旧文"), addition: ref("b", "新文") });
});
it("keeps missing comparison definitions and unknown mechanism endpoints explicit", () => {
  const data = new FormData(); data.set("verdict", "not_comparable"); data.set("definition.left", "未知"); data.set("definition.right", "订单数"); data.set("link1.text", "导致需求"); data.set("link1.unknown", "末环尚未发生");
  expect(reasoningPayload("comparability", data, []).dimensions).toMatchObject({ definition: { left: "未知", right: "订单数" } });
  expect(reasoningPayload("mechanism", data, []).links).toEqual([{ text: "导致需求", refs: [], counterexample: "", unknown: "末环尚未发生" }]);
});
