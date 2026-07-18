import { describe, expect, it } from "vitest";
import {
  DECOY_FLAW_TYPES,
  decoyFlawLabel,
  parseDecoyPlan,
  parseDecoyReveal,
  parseOwnPlanCritique,
} from "./types";

const validPlan = {
  sections: [
    { heading: "问题重述", content: "你想解决自由职业者记账难的问题。" },
    { heading: "解法路径", content: "做一个记账 App，做好了自然有人来用。" },
    { heading: "如何验证", content: "上线后看下载量，超过一万就说明有需求。" },
  ],
  planted_flaws: [
    {
      section: "解法路径",
      quote: "做好了自然有人来用",
      type: "channel_fantasy",
      why_wrong: "没有任何获客渠道假设。",
    },
    {
      section: "如何验证",
      quote: "超过一万就说明有需求",
      type: "armchair_number",
      why_wrong: "一万这个阈值没有任何来源。",
    },
  ],
};

describe("parseDecoyPlan", () => {
  it("接受合法方案", () => {
    const plan = parseDecoyPlan(validPlan);
    expect(plan.sections).toHaveLength(3);
    expect(plan.planted_flaws[0].type).toBe("channel_fantasy");
  });

  it("拒绝埋雷少于 2 处", () => {
    expect(() =>
      parseDecoyPlan({ ...validPlan, planted_flaws: [validPlan.planted_flaws[0]] })
    ).toThrow();
  });

  it("拒绝埋雷多于 4 处", () => {
    const flaws = Array.from({ length: 5 }, () => validPlan.planted_flaws[0]);
    expect(() => parseDecoyPlan({ ...validPlan, planted_flaws: flaws })).toThrow();
  });

  it("拒绝 quote 不是正文逐字子串的雷", () => {
    const bad = {
      ...validPlan,
      planted_flaws: [
        validPlan.planted_flaws[0],
        { ...validPlan.planted_flaws[1], quote: "正文里不存在的句子" },
      ],
    };
    expect(() => parseDecoyPlan(bad)).toThrow();
  });

  it("拒绝未知的错漏类型", () => {
    const bad = {
      ...validPlan,
      planted_flaws: [
        validPlan.planted_flaws[0],
        { ...validPlan.planted_flaws[1], type: "not_a_type" },
      ],
    };
    expect(() => parseDecoyPlan(bad)).toThrow();
  });

  it("拒绝 sections 少于 3 段", () => {
    expect(() =>
      parseDecoyPlan({ ...validPlan, sections: validPlan.sections.slice(0, 2) })
    ).toThrow();
  });
});

describe("parseDecoyReveal", () => {
  it("接受合法揭底并容忍空数组", () => {
    const reveal = parseDecoyReveal({
      caught: [
        { quote: "做好了自然有人来用", type: "channel_fantasy", matched_challenge: "渠道呢？" },
      ],
      missed: [
        {
          quote: "超过一万就说明有需求",
          type: "armchair_number",
          why_plausible: "有一个具体数字，显得客观。",
          why_wrong: "阈值没有来源。",
        },
      ],
      bonus: [],
    });
    expect(reveal.caught).toHaveLength(1);
    expect(reveal.missed[0].why_plausible).toContain("客观");
    expect(reveal.bonus).toEqual([]);
  });

  it("拒绝缺少 missed 字段的输出", () => {
    expect(() => parseDecoyReveal({ caught: [], bonus: [] })).toThrow();
  });
});

describe("parseOwnPlanCritique", () => {
  it("接受合法质疑", () => {
    const critique = parseOwnPlanCritique({
      suspected_flaws: [
        { quote: "用户肯定需要", type: "false_need", comment: "还没接触过任何用户。" },
      ],
      open_questions: ["第一个付费用户从哪来？"],
    });
    expect(critique.suspected_flaws[0].type).toBe("false_need");
    expect(critique.open_questions).toHaveLength(1);
  });

  it("拒绝 suspected_flaws 里的未知类型", () => {
    expect(() =>
      parseOwnPlanCritique({
        suspected_flaws: [{ quote: "x", type: "nope", comment: "y" }],
        open_questions: [],
      })
    ).toThrow();
  });
});

describe("decoyFlawLabel", () => {
  it("每个类型都有中文名", () => {
    for (const t of DECOY_FLAW_TYPES) {
      expect(decoyFlawLabel(t.type)).toBe(t.label);
    }
  });
});
