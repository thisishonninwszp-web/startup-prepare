import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/supabase", () => ({
  supabaseAdmin: {},
}));
import {
  buildRealityReasoningSnapshot,
  parseRealityReasoningSnapshot,
  reasoningTargetColumn,
} from "./reality-source";
import type { RealityMap, RealityPath } from "@/app/(app)/reality/types";
import { parseReasoningRealityDraft } from "./types";

const selectedPath: RealityPath = {
  type: "investigate",
  title: "补充信息",
  rationale: "关键事实仍不完整",
  action: "访谈三位顾客",
  risk: "样本过少",
};

const map: RealityMap = {
  topic: "增长停滞",
  emotions: [
    { feeling: "焦虑", trigger: "增长停滞", judgment_impact: "容易频繁换方向" },
  ],
  facts: [{ statement: "本月新增用户为零", source: "后台数据" }],
  interpretations: ["获客渠道可能失效"],
  unknowns: ["顾客是否仍有痛点"],
  constraints: {
    fixed: ["团队只有一人"],
    influenceable: ["访谈频率"],
    actionable_now: ["联系顾客"],
  },
  contradictions: ["想快速增长，但尚未确认痛点"],
  paths: [
    selectedPath,
    {
      type: "act",
      title: "立即行动",
      rationale: "已有部分依据",
      action: "测试新渠道",
      risk: "可能浪费预算",
    },
    {
      type: "wait",
      title: "暂不行动",
      rationale: "等待数据",
      action: "一周后复查",
      risk: "延迟学习",
    },
  ],
};

describe("reality reasoning source", () => {
  it("maps each tool to exactly one target column", () => {
    expect(reasoningTargetColumn("bayesian")).toBe("bayesian_belief_id");
    expect(reasoningTargetColumn("fermi")).toBe("fermi_estimate_id");
    expect(reasoningTargetColumn("reframing")).toBe("reframing_session_id");
  });

  it("builds and parses an immutable source snapshot", () => {
    const snapshot = buildRealityReasoningSnapshot({
      realityCase: {
        id: "case-1",
        title: "增长停滞",
        context: "business",
      },
      version: {
        id: "version-1",
        version_no: 2,
        created_at: "2026-06-29T00:00:00.000Z",
        map,
        selected_path: selectedPath,
        custom_action: null,
        selection_reason: "先确认事实",
      },
    });

    expect(snapshot.version.id).toBe("version-1");
    expect(snapshot.map).toEqual(map);
    expect(parseRealityReasoningSnapshot(snapshot)).toEqual(snapshot);
  });

  it("rejects malformed saved snapshots", () => {
    expect(() =>
      parseRealityReasoningSnapshot({
        realityCase: { id: "case-1", title: "课题", context: "business" },
        version: { id: "version-1", version_no: 1, created_at: "bad" },
        map: {},
      })
    ).toThrow();
  });
});

describe("reasoning draft from reality", () => {
  it("parses a grounded Bayesian draft", () => {
    expect(
      parseReasoningRealityDraft({
        tool: "bayesian",
        question: "当前增长停滞主要由获客渠道失效造成吗？",
        used_sections: ["facts", "unknowns"],
      })
    ).toEqual({
      tool: "bayesian",
      question: "当前增长停滞主要由获客渠道失效造成吗？",
      used_sections: ["facts", "unknowns"],
    });
  });

  it("rejects success predictions and scoring", () => {
    expect(() =>
      parseReasoningRealityDraft({
        tool: "bayesian",
        question: "这个方向的成功率是80%",
        used_sections: ["facts"],
      })
    ).toThrow();
    expect(() =>
      parseReasoningRealityDraft({
        tool: "fermi",
        question: "市场规模是多少？",
        category: "market",
        score: 9,
        used_sections: ["facts"],
      })
    ).toThrow();
  });
});
