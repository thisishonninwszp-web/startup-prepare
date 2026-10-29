import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/ai-gateway", () => ({ executeAiJson: vi.fn(), AI_MODEL: "test" }));
import { parseEventDraft } from "./signal-events";
const sources = [{ id: "11111111-1111-4111-8111-111111111111", captured_text: "订单数量下降，企业暂缓扩产。" }];
describe("事件AI草稿只引用允许快照", () => {
  it("拒绝模型编造的原文、外部引用和迎合性结论", () => {
    const draft = (text: string, quote: string, id = sources[0].id) => ({ sections: [{ heading: "变化", text, refs: [{ snapshotId: id, quote }] }] });
    expect(() => parseEventDraft(draft("订单下降", "收入翻倍"), sources)).toThrow();
    expect(() => parseEventDraft(draft("订单下降", "订单数量下降", "22222222-2222-4222-8222-222222222222"), sources)).toThrow();
    expect(() => parseEventDraft(draft("很有潜力", "订单数量下降"), sources)).toThrow();
    expect(parseEventDraft(draft("扩产计划暂缓，原因还需核对", "企业暂缓扩产"), sources).sections).toHaveLength(1);
  });
  it("没有依据只能保留明确的问题，不能写成已知事实", () => {
    expect(() => parseEventDraft({ sections: [{ heading: "已知", text: "营收翻倍", refs: [] }] }, sources)).toThrow();
    expect(parseEventDraft({ sections: [{ heading: "未知", text: "需要核实：订单下降来自哪些客户？", refs: [] }] }, sources).sections).toHaveLength(1);
  });
});
it("accepts only exact selected note quotes", () => {
  const notes = [{ id: sources[0].id, text: "最初以为需求下降", createdAt: "2026-01-01" }];
  const raw = { sections: [{ heading: "理解变化", text: "笔记记录了需求下降的判断", refs: [], noteRefs: [{ recordId: notes[0].id, quote: notes[0].text }] }] };
  expect(parseEventDraft(raw, [], notes).sections[0].noteRefs).toHaveLength(1);
  expect(() => parseEventDraft(raw, [], [])).toThrow();
});
it("permits reported numerical facts while refusing subjective numerical likelihood", () => {
  const data = [{ id: sources[0].id, captured_text: "订单同比下降30%" }];
  const draft = (text: string) => ({ sections: [{ heading: "变化", text, refs: [{ snapshotId: data[0].id, quote: data[0].captured_text }] }] });
  expect(parseEventDraft(draft("订单同比下降30%"), data).sections).toHaveLength(1);
  expect(() => parseEventDraft(draft("事件发生概率为30%"), data)).toThrow();
});
it("checks connection proposal fields without trusting its model-supplied target", () => {
  const other = { id: "22222222-2222-4222-8222-222222222222", captured_text: "另一端证据" };
  const refs = [{ snapshotId: sources[0].id, quote: "订单数量下降" }, { snapshotId: other.id, quote: "另一端证据" }];
  const raw = { sections: [{ heading: "机制", text: "两端材料需进一步核对", refs, proposal: { kind: "connection", payload: { targetEventId: "untrusted", text: "连接假说", assumption: "同一传导机制", counter: "机制未发生", alternative: "共同原因" } } }] };
  expect(parseEventDraft(raw, [...sources, other]).sections[0].proposal?.kind).toBe("connection");
});
it("quotes outside the selected truncated source view are rejected", () => {
  const raw = { sections: [{ heading: "变化", text: "引用被截断的内容", refs: [{ snapshotId: sources[0].id, quote: "截断后的尾部" }] }] };
  expect(() => parseEventDraft(raw, [{ id: sources[0].id, captured_text: "允许发送的前缀" }])).toThrow();
});
it("uses configured gateway model and a 20-second metadata-only event task", async () => {
  const { executeAiJson } = await import("@/lib/ai-gateway"); const { generateEventDraft } = await import("./signal-events");
  vi.mocked(executeAiJson).mockImplementationOnce(async (context, request, validate) => {
    expect(context).toMatchObject({ userId: "owner", module: "unknown", operation: "event_task", timeoutMs: 20000, payloadLogging: "metadata_only" });
    const call = request(0); expect(call.model).toBe("test"); expect(call.contents).toContain("替代解释"); expect(call.contents).toContain("逐字原文");
    return validate({ sections: [{ heading: "未知", text: "需要核实竞争解释", refs: [] }] });
  });
  await generateEventDraft("owner", "explanations", [{ ...sources[0], title: "选中来源", published_at: null, captured_at: "2026-10-25" }], []);
});

it("rejects fabricated citations hidden inside proposal payloads", () => {
  const raw = { sections: [{ heading: "未知", text: "需要核实", refs: [], proposal: { kind: "unknown", payload: { question: "规模如何", criterion: "拿到数据", noteRefs: [{ recordId: sources[0].id, quote: "未选中的笔记" }] } } }] };
  expect(() => parseEventDraft(raw, [], [])).toThrow();
});
