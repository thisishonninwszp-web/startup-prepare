import { describe, expect, it } from "vitest";
import {
  FOCUS_MAX_TURNS,
  hasImmediateSafetyRisk,
  normalizeFocusQuestion,
  parseRealityFocusResponse,
  resolveRealityFocusAnchor,
  shouldFinalizeFocus,
} from "./focus";
import type { RealityMap } from "./types";

const map: RealityMap = {
  topic: "是否继续当前项目",
  emotions: [
    {
      feeling: "极限感",
      trigger: "连续工作后仍没有进展",
      judgment_impact: "可能把疲惫解释为方向一定错误",
    },
  ],
  facts: [{ statement: "连续两周没有新增用户", source: "后台数据" }],
  interpretations: ["这个方向可能已经无效"],
  unknowns: ["没有新增的具体原因"],
  constraints: {
    fixed: ["当前只有一人"],
    influenceable: ["工作范围"],
    actionable_now: ["暂停一天后重新检查判断"],
  },
  contradictions: ["认为必须立刻决定，但缺少顾客反馈"],
  paths: [
    {
      type: "investigate",
      title: "先补信息",
      rationale: "缺少顾客反馈",
      action: "联系一位顾客",
      risk: "样本有限",
    },
    {
      type: "act",
      title: "缩小范围",
      rationale: "仍有可控变量",
      action: "只测试一个入口",
      risk: "可能忽略系统问题",
    },
    {
      type: "wait",
      title: "短暂停止",
      rationale: "当前状态可能影响判断",
      action: "明天复查",
      risk: "等待可能成为逃避",
    },
  ],
};

describe("focused reality anchors", () => {
  it("rebuilds an emotion anchor from the saved map", () => {
    expect(
      resolveRealityFocusAnchor(map, { type: "emotion", index: 0 })
    ).toEqual({
      type: "emotion",
      index: 0,
      label: "情绪、触发与判断影响",
      text:
        "极限感｜触发：连续工作后仍没有进展｜对判断的影响：可能把疲惫解释为方向一定错误",
      snapshot: map.emotions[0],
    });
  });

  it("keeps the complete persisted text for compound anchors", () => {
    expect(
      resolveRealityFocusAnchor(map, { type: "fact", index: 0 }).text
    ).toBe("连续两周没有新增用户｜来源：后台数据");
    expect(
      resolveRealityFocusAnchor(map, { type: "path", index: 0 }).text
    ).toBe(
      "先补信息｜理由：缺少顾客反馈｜动作：联系一位顾客｜风险：样本有限"
    );
  });

  it("supports every map section and rejects forged indexes", () => {
    const locators = [
      { type: "topic", index: 0 },
      { type: "fact", index: 0 },
      { type: "interpretation", index: 0 },
      { type: "unknown", index: 0 },
      { type: "constraint_fixed", index: 0 },
      { type: "constraint_influenceable", index: 0 },
      { type: "constraint_actionable", index: 0 },
      { type: "contradiction", index: 0 },
      { type: "path", index: 0 },
    ] as const;
    for (const locator of locators) {
      expect(resolveRealityFocusAnchor(map, locator).text).toBeTruthy();
    }
    expect(() =>
      resolveRealityFocusAnchor(map, { type: "emotion", index: 99 })
    ).toThrow("锚点");
  });
});

const validResponse = {
  explicit_content: ["用户描述了极限感"],
  ai_inferences: ["疲惫可能正在放大方向判断"],
  unknowns: ["休息后这种判断是否仍然存在"],
  response_options: [
    {
      title: "暂缓重大判断",
      when_it_fits: "当前身体和注意力明显透支时",
      tradeoff: "会延迟一天得到结论",
      small_try: "先暂停一晚，明天用同一问题复查",
    },
    {
      title: "缩小问题范围",
      when_it_fits: "仍有精力处理一个局部问题时",
      tradeoff: "暂时不解决整体方向",
      small_try: "只写下今天最不可控的一件事",
    },
  ],
  follow_up_question: "休息充分的时候，你仍然会有同样判断吗？",
  is_final: false,
  summary: null,
  safety_state: "normal",
};

describe("focused reality response", () => {
  it("accepts bounded options, inference labels, and one question", () => {
    expect(parseRealityFocusResponse(validResponse)).toEqual(validResponse);
  });

  it("requires a final summary and no further question on the last turn", () => {
    const final = {
      ...validResponse,
      follow_up_question: null,
      is_final: true,
      summary: {
        updated_understanding: "极限感与连续透支同时出现",
        remaining_unknown: "恢复后判断是否改变",
        option_tradeoffs: ["暂停可减少状态干扰，但延迟决定"],
        candidate_action: "休息一晚后重新回答同一问题",
        user_grounded: ["连续工作后没有进展"],
        ai_inferences: ["疲惫可能放大判断"],
      },
    };
    expect(parseRealityFocusResponse(final).summary).toEqual(final.summary);
    expect(() =>
      parseRealityFocusResponse({
        ...validResponse,
        follow_up_question: null,
        is_final: true,
      })
    ).toThrow("summary");
  });

  it("rejects scoring, diagnosis, too many inferences, and multiple plans", () => {
    expect(() =>
      parseRealityFocusResponse({ ...validResponse, score: 8 })
    ).toThrow();
    expect(() =>
      parseRealityFocusResponse({
        ...validResponse,
        ai_inferences: ["1", "2", "3"],
      })
    ).toThrow("ai_inferences");
    expect(() =>
      parseRealityFocusResponse({
        ...validResponse,
        explicit_content: ["你患有抑郁症"],
      })
    ).toThrow();
  });
});

describe("focused reality limits and safety", () => {
  it("limits questions and finalizes at turn three", () => {
    expect(normalizeFocusQuestion(" 为什么会这样？ ")).toBe("为什么会这样？");
    expect(() => normalizeFocusQuestion("x".repeat(2001))).toThrow();
    expect(FOCUS_MAX_TURNS).toBe(3);
    expect(shouldFinalizeFocus(2, false)).toBe(false);
    expect(shouldFinalizeFocus(3, false)).toBe(true);
    expect(shouldFinalizeFocus(1, true)).toBe(true);
  });

  it("does not confuse ordinary limit feelings with immediate danger", () => {
    expect(hasImmediateSafetyRisk("我感受到很强的极限感")).toBe(false);
    expect(hasImmediateSafetyRisk("我现在准备伤害自己")).toBe(true);
    expect(hasImmediateSafetyRisk("I am going to kill myself now")).toBe(true);
  });
});
