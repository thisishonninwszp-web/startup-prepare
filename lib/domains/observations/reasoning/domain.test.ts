import { describe, expect, it } from "vitest";
import { normalizeReasoning, comparisonUnknowns } from "./domain";
const a = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const b = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002";
const ref = { snapshotId: a, quote: "原文" };
const base = { text: "我的解释", refs: [ref], claimIds: [] };
describe("reasoning contracts", () => {
  it("keeps new facts in reprints without inventing independence", () => {
    const input = { ...base, refs: [ref, { ...ref, snapshotId: b }], baseline: ref, addition: { ...ref, snapshotId: b }, increment: "新增交付日期", independence: "shared", independenceBasis: "同一份公告" };
    expect(normalizeReasoning("increment", input).increment).toBe("新增交付日期");
  });
  it("retains unknown denominators and omitted populations", () => {
    const p = normalizeReasoning("denominator", { ...base, sample: "三家", population: "受访公司", denominator: "未知", omittedGroups: "未回复者" });
    expect(p.denominator).toBe("未知");
    expect(() => normalizeReasoning("denominator", { ...p, denominator: "" })).toThrow();
  });
  it("cannot call numbers comparable when a key definition is unknown", () => {
    const dimensions = Object.fromEntries(["definition", "unit", "period", "geography", "priceBasis", "quantityBasis"].map(k => [k, { left: "相同", right: "相同" }]));
    dimensions.definition.right = "未知";
    expect(comparisonUnknowns(dimensions)).toContain("definition");
    expect(() => normalizeReasoning("comparability", { ...base, dimensions, verdict: "comparable", reason: "看起来一样" })).toThrow();
    expect(normalizeReasoning("comparability", { ...base, dimensions, verdict: "not_comparable", reason: "定义未知" }).verdict).toBe("not_comparable");
  });
  it("rejects different units and periods without automatic conversion", () => {
    const dimensions = Object.fromEntries(["definition", "unit", "period", "geography", "priceBasis", "quantityBasis"].map(k => [k, { left: "相同", right: "相同" }]));
    dimensions.unit = { left: "JPY", right: "EUR" };
    expect(() => normalizeReasoning("comparability", { ...base, dimensions, verdict: "comparable", reason: "一样" })).toThrow();
  });
  it("does not infer a mechanism's last link from its first", () => {
    const links = [{ text: "补贴发放", refs: [ref], counterexample: "", unknown: "" }, { text: "需求增长", refs: [], counterexample: "", unknown: "尚未看到订单" }];
    expect(normalizeReasoning("mechanism", { ...base, links }).links).toEqual(links);
    expect(() => normalizeReasoning("mechanism", { ...base, links: [{ ...links[1], unknown: "" }] })).toThrow();
  });
  it("requires applicability conditions, invalidators and follow-up", () => {
    expect(() => normalizeReasoning("applicability", { ...base, conditions: "同样的补贴", invalidators: "", followUp: "核实渠道" })).toThrow();
    expect(normalizeReasoning("applicability", { ...base, conditions: "同样的补贴", invalidators: "补贴退出", followUp: "核实渠道" }).invalidators).toBe("补贴退出");
  });
  it("rejects unrecognized scores and fabricated nested citations", () => {
    expect(() => normalizeReasoning("claim", { ...base, score: 2 })).toThrow();
    expect(() => normalizeReasoning("disagreement", { ...base, left: ref, right: { snapshotId: b, quote: "另一个" }, cause: "fact", checkQuestion: "问谁" })).toThrow();
  });
});
