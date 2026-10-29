import { describe, expect, it } from "vitest";
import { normalizeResearch, validateResearchRefs, sourceRoots, expectationState, type ResearchEntry } from "./research-shared";
const snapshot = { id: "11111111-1111-4111-8111-111111111111", captured_text: "企业公告：订单减少，2026年暂停扩产。" };
describe("事件研究必须保留未知和来源边界", () => {
  it("拒绝没有出处的已答问题及越界引用", () => {
    expect(() => normalizeResearch("unknown_answer", { text: "订单减少", status: "answered", refs: [] })).toThrow();
    expect(() => validateResearchRefs([{ snapshotId: snapshot.id, quote: "公司营收翻倍" }], [snapshot])).toThrow();
    expect(() => validateResearchRefs([{ snapshotId: "other", quote: "订单减少" }], [snapshot])).toThrow();
  });
  it("竞争解释是可检验的假说，不接受打分字段或无区分观察", () => {
    expect(() => normalizeResearch("explanation", { text: "需求变弱", assumptions: "订单减少", distinguish: "" })).toThrow();
    expect(() => normalizeResearch("note", { text: "想法很好", score: 9 })).toThrow();
    expect(normalizeResearch("explanation", { text: "需求变弱", assumptions: "客户减少采购", distinguish: "查看订单数量" }).text).toBe("需求变弱");
  });
  it("十篇转载仍只有一个原始根，循环关系被拒绝", () => {
    const links = Array.from({ length: 10 }, (_, i) => ({ from: `copy-${i}`, to: "release" }));
    expect(sourceRoots(["release", ...links.map((x) => x.from)], links)).toEqual(["release"]);
    expect(() => sourceRoots(["a", "b"], [{ from: "a", to: "b" }, { from: "b", to: "a" }])).toThrow();
  });
  it("没报道、检查失败、没到期都不能变成预期未发生", () => {
    expect(expectationState("2030-01-01", [], Date.parse("2026-10-25"))).toBe("waiting");
    expect(expectationState("2020-01-01", [], Date.now())).toBe("unknown");
    const row: ResearchEntry = { id: "resolution", event_id: "event", subject_id: "expectation", created_at: "2026-10-25", kind: "expectation_resolution", payload: { result: "unknown" } };
    expect(expectationState("2020-01-01", [row], Date.now())).toBe("unknown");
  });
});
it("preserves exact note citations on adopted unknown and explanation proposals", () => {
  const refs = [{ recordId: snapshot.id, quote: "当时认为订单下降" }];
  expect(normalizeResearch("unknown", { question: "缺少什么", criterion: "拿到订单表", noteRefs: refs }).noteRefs).toEqual(refs);
  expect(normalizeResearch("explanation", { text: "可能是季节性", assumptions: "周期稳定", distinguish: "比较同比", noteRefs: refs }).noteRefs).toEqual(refs);
});
it("flattens proposal note citations into dossier selection validation", () => {
  const ref = { recordId: snapshot.id, quote: "当时的看法" };
  const payload = normalizeResearch("dossier", { task: "unknowns", inputHash: "a".repeat(64), memberRevision: 1, selectedNoteIds: [snapshot.id], selectedSnapshotIds: [], sections: [{ heading: "未知", text: "需要核实", refs: [], proposal: { kind: "unknown", payload: { question: "规模如何", criterion: "拿到公开数据", noteRefs: [ref] } } }] });
  expect(payload.noteRefs).toEqual([ref]);
});
