import { describe, expect, it } from "vitest";
import { buildRealityDecisionClosureSource } from "./reality-source";

describe("buildRealityDecisionClosureSource", () => {
  it("keeps reality closure refs as the only allowed generic basis refs", () => {
    const source = buildRealityDecisionClosureSource({
      reality: {
        realityCase: { id: "case-1", title: "极限感", context: "business" },
        version: { id: "version-1", version_no: 2, created_at: "2026-07-10" },
        map: {
          topic: "极限感",
          emotions: [{ feeling: "累", trigger: "连续工作", judgment_impact: "判断变窄" }],
          facts: [{ statement: "本周睡眠减少", source: "日记" }],
          interpretations: [],
          unknowns: ["不知道主要限制是什么"],
          constraints: { fixed: [], influenceable: [], actionable_now: [] },
          contradictions: [],
          paths: [],
        },
        selected_path: null,
        custom_action: null,
        selection_reason: null,
      },
      reasoning: {
        bayesian: [],
        fermi: [{ id: "fermi-1", question: "可用时间", final_low: 2, final_high: 5, unit: "小时", components: [] }],
        reframing: [],
      },
      focused_inquiries: [
        {
          id: "focus-1",
          anchor: {
            type: "topic" as const,
            index: 0,
            label: "主题",
            text: "极限感",
            snapshot: null,
          },
          summary: {
            updated_understanding: "可能是资源边界问题",
            remaining_unknown: "不知道来源",
            option_tradeoffs: [],
            candidate_action: "记录触发场景",
            user_grounded: [],
            ai_inferences: [],
          },
        },
      ],
    });

    expect(source.refs.map((item) => item.ref)).toEqual([
      "reality:topic",
      "reality:emotions",
      "reality:facts",
      "reality:unknowns",
      "fermi:fermi-1",
      "focus:focus-1",
    ]);
  });
});
