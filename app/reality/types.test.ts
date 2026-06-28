import { describe, expect, it } from "vitest";
import {
  REALITY_INTERVIEW_SOFT_LIMIT,
  parseRealityDelta,
  parseRealityInterviewResult,
  parseRealityMap,
} from "./types";

describe("parseRealityInterviewResult", () => {
  it("accepts one to three questions and synthesis readiness", () => {
    expect(
      parseRealityInterviewResult({
        questions: ["发生了什么？", "这个判断的依据是什么？"],
        missing_dimensions: ["事实来源"],
        ready_to_synthesize: false,
      })
    ).toEqual({
      questions: ["发生了什么？", "这个判断的依据是什么？"],
      missing_dimensions: ["事实来源"],
      ready_to_synthesize: false,
    });
  });

  it("rejects more than three questions", () => {
    expect(() =>
      parseRealityInterviewResult({
        questions: ["1", "2", "3", "4"],
        missing_dimensions: [],
        ready_to_synthesize: false,
      })
    ).toThrow("questions");
  });
});

describe("parseRealityMap", () => {
  const validMap = {
    topic: "是否应该继续当前项目",
    emotions: [
      {
        feeling: "焦虑",
        trigger: "连续两周没有客户回复",
        judgment_impact: "可能把短期沉默解释成彻底失败",
      },
    ],
    facts: [{ statement: "两周内联系了8位客户", source: "用户陈述" }],
    interpretations: ["客户没有回复意味着需求不存在"],
    unknowns: ["客户未回复的具体原因"],
    constraints: {
      fixed: ["当前只有一名开发者"],
      influenceable: ["触达话术"],
      actionable_now: ["询问一位未回复客户原因"],
    },
    contradictions: ["认为需求不存在，但尚未获得拒绝理由"],
    paths: [
      {
        type: "investigate",
        title: "补充信息",
        rationale: "缺少未回复原因",
        action: "联系一位客户询问未回复原因",
        risk: "样本仍然有限",
      },
      {
        type: "act",
        title: "立即行动",
        rationale: "可以测试新话术",
        action: "向三位同类客户发送改写后的邀请",
        risk: "同时改变了话术变量",
      },
      {
        type: "wait",
        title: "暂不行动",
        rationale: "等待已约访客户回复",
        action: "三天后重新检查回复",
        risk: "等待可能成为逃避",
      },
    ],
  };

  it("accepts the complete eight-block map", () => {
    expect(parseRealityMap(validMap)).toEqual(validMap);
  });

  it("requires exactly one path of each fixed type", () => {
    expect(() =>
      parseRealityMap({
        ...validMap,
        paths: [validMap.paths[0], validMap.paths[0], validMap.paths[2]],
      })
    ).toThrow("paths");
  });
});

describe("parseRealityDelta", () => {
  it("accepts a version comparison without scores", () => {
    const delta = {
      added_facts: ["客户明确说预算被冻结"],
      revised_interpretations: ["沉默不等于没有需求"],
      resolved_unknowns: ["未回复原因"],
      new_unknowns: ["预算何时恢复"],
      emotion_changes: ["焦虑下降，因为原因变得具体"],
      previous_path_result: "完成了客户追问",
      change_reason: "获得了一次真实回复",
    };
    expect(parseRealityDelta(delta)).toEqual(delta);
  });
});

it("uses a six-turn soft interview limit", () => {
  expect(REALITY_INTERVIEW_SOFT_LIMIT).toBe(6);
});
