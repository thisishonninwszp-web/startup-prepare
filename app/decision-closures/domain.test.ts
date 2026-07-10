import { describe, expect, it } from "vitest";
import {
  DECISION_CLOSURE_OBJECT_TYPES,
  allowedDecisionBasisRefs,
  assertDecisionClosureDueDate,
  parseDecisionClosureDraft,
  validateDecisionClosureBasisRefs,
} from "./domain";

const validDraft = {
  current_judgment: "现在先验证极限感来自现金流还是恢复不足，而不是继续扩大分析。",
  critical_unknowns: ["主要限制到底是现金、体力还是方向不清"],
  options: [
    {
      label: "先做现实核对",
      when_to_choose: "当判断仍然混乱，且缺少事实对账时",
      tradeoff: "短期不会直接推进产品",
      small_try: "明天列出最近三次极限感发生前后的事实",
    },
    {
      label: "先做顾客接触",
      when_to_choose: "当最大未知来自顾客真实反应时",
      tradeoff: "会面对不舒服的反馈",
      small_try: "联系一位最近拒绝的人，只问现在怎么解决",
    },
  ],
  selected_next_step: "明天 15:00 前列出最近三次极限感发生前后的事实。",
  completion_criterion: "保存三条具体场景，每条都有时间、触发事件和身体反应。",
  expected_feedback: "知道极限感更像资源不足、方向冲突还是恢复不足。",
  due_on: "2026-07-12",
  basis_refs: ["reality:unknowns", "focus:focus-1"],
};

describe("decision closure domain", () => {
  it("keeps the object type vocabulary broad enough for future object workspaces", () => {
    expect(DECISION_CLOSURE_OBJECT_TYPES).toEqual([
      "reality_case",
      "idea",
      "customer_case",
      "dream_case",
      "dream_branch",
      "retro_period",
      "company_profile",
      "reasoning_session",
    ]);
  });

  it("accepts a grounded draft with 1-3 unknowns and 2-3 tradeoff options", () => {
    expect(parseDecisionClosureDraft(validDraft)).toEqual(validDraft);
  });

  it("rejects vague output, scoring language, and unsupported option counts", () => {
    expect(() =>
      parseDecisionClosureDraft({ ...validDraft, critical_unknowns: [] })
    ).toThrow("critical_unknowns");
    expect(() =>
      parseDecisionClosureDraft({ ...validDraft, options: [validDraft.options[0]] })
    ).toThrow("options");
    expect(() =>
      parseDecisionClosureDraft({
        ...validDraft,
        current_judgment: "这个方向有 80% 成功率，所以应该继续。",
      })
    ).toThrow("评分");
  });

  it("requires future ISO due dates", () => {
    expect(() => assertDecisionClosureDueDate("2026-07-10", "2026-07-10")).toThrow();
    expect(() => assertDecisionClosureDueDate("2026/07/12", "2026-07-10")).toThrow();
    expect(() => assertDecisionClosureDueDate("2026-07-12", "2026-07-10")).not.toThrow();
  });

  it("only allows source references present in the snapshot", () => {
    const source = {
      refs: [
        { ref: "reality:topic", label: "当前课题" },
        { ref: "reality:unknowns", label: "未知" },
        { ref: "focus:focus-1", label: "聚焦探索" },
      ],
    };
    expect(allowedDecisionBasisRefs(source)).toEqual([
      "reality:topic",
      "reality:unknowns",
      "focus:focus-1",
    ]);
    expect(() =>
      validateDecisionClosureBasisRefs(validDraft, source)
    ).not.toThrow();
    expect(() =>
      validateDecisionClosureBasisRefs(
        { ...validDraft, basis_refs: ["customer:other-user"] },
        source
      )
    ).toThrow("无法验证");
  });
});
