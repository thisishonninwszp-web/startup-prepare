import { describe, expect, it } from "vitest";
import {
  CENTRAL_QUESTION_TYPES,
  evaluateConceptConfirmation,
  parseActionValues,
  parseCentralQuestions,
  parseConceptCandidates,
  parseConceptDelta,
  parseConceptSynthesis,
  parseInsightStory,
  parseLandingPageConcept,
  parseVisionStory,
  selectCentralQuestion,
  stripBayesianPercentages,
  validateConceptCitations,
} from "./types";

describe("central question", () => {
  const candidates = CENTRAL_QUESTION_TYPES.map((type) => ({
    type,
    question: `${type}视角下，真正值得回答的问题是什么？`,
    opens_space: "把现有解法放到一边",
    decision_impact: "会改变产品边界",
  }));

  it("requires all eight distinct question types without scores", () => {
    const parsed = parseCentralQuestions({ candidates });
    expect(parsed.candidates).toHaveLength(8);
    expect(parsed.candidates[0]).not.toHaveProperty("score");
    expect(() =>
      parseCentralQuestions({ candidates: candidates.slice(0, 7) })
    ).toThrow("8");
  });

  it("selects exactly one current question and allows an explicit rewrite", () => {
    expect(
      selectCentralQuestion(candidates, "verb", "重新发明理解顾客的动作是什么？")
    ).toEqual({
      type: "verb",
      question: "重新发明理解顾客的动作是什么？",
    });
  });
});

describe("evidence-grounded concept", () => {
  it("requires customer materials, a conclusion, company fact, and central question", () => {
    expect(
      evaluateConceptConfirmation({
        keptMaterialIds: ["m1", "m2"],
        hasCustomerConclusion: true,
        companyFactIds: ["f1"],
        centralQuestion: "如何让顾客不用解释自己？",
      })
    ).toEqual({
      canConfirm: false,
      missing: ["至少3份独立顾客材料"],
    });
    expect(
      evaluateConceptConfirmation({
        keptMaterialIds: ["m1", "m2", "m3"],
        hasCustomerConclusion: true,
        companyFactIds: ["f1"],
        centralQuestion: "如何让顾客不用解释自己？",
      }).canConfirm
    ).toBe(true);
  });

  it("keeps customer contradictions and competitors tied to evidence", () => {
    const story = parseInsightStory({
      conflict: {
        desire_a: "不想花时间整理",
        desire_b: "又不愿失去细节",
        evidence_ids: ["e1", "e2"],
      },
      competitors: {
        time: [
          {
            name: "继续拖延",
            weakness: "问题持续存在",
            evidence_ids: ["e1"],
          },
        ],
        job: [
          {
            name: "自己做表格",
            weakness: "维护成本高",
            evidence_ids: ["e2"],
          },
        ],
        category: [],
      },
      overlooked_gap: "没有方案同时保留细节并减少整理",
      evidence_ids: ["e1", "e2"],
    });
    expect(story.conflict.desire_b).toContain("细节");
    expect(() =>
      validateConceptCitations(
        story.competitors.time.flatMap((item) => item.evidence_ids),
        ["e2"]
      )
    ).toThrow("证据");
  });

  it("allows at most three unranked concept candidates", () => {
    const candidate = {
      story_type: "insight",
      one_line: "让不想整理却不愿失去细节的人，保留真实脉络。",
      serves_whom: "需要持续复盘的独立工作者",
      change: "不再依靠记忆拼凑",
      difference: "用真实证据组织时间线",
      give_up: "不服务只想自动生成结论的人",
      customer_evidence_ids: ["e1"],
      company_fact_ids: ["f1"],
      dream_version_id: "",
    };
    expect(
      parseConceptCandidates({
        candidates: [candidate, candidate, candidate],
      }).candidates
    ).toHaveLength(3);
    expect(() =>
      parseConceptCandidates({
        candidates: [candidate, candidate, candidate, candidate],
      })
    ).toThrow("最多3");
  });

  it("builds a vision story only from a selected dream version", () => {
    expect(
      parseVisionStory({
        dream_version_id: "d1",
        current_world: "每天被通知推着走",
        future_world: "可以自己决定注意力流向",
        desired_change: "从被动反应转向主动选择",
        meaning: "工作服务生活，而不是吞掉生活",
        source_ids: ["dream:d1"],
      }).dream_version_id
    ).toBe("d1");
  });

  it("keeps company benefit chains tied to user facts", () => {
    const synthesis = parseConceptSynthesis({
      benefit_chain: [
        {
          fact_id: "f1",
          fact: "已经积累100次真实访谈",
          general_benefit: "更快识别重复问题",
          customer_benefit: "顾客不必从头解释处境",
        },
      ],
      candidates: [
        {
          story_type: "integrated",
          one_line: "让顾客不用从头解释自己。",
          serves_whom: "反复说明处境的人",
          change: "直接从真实上下文开始",
          difference: "基于持续访谈积累",
          give_up: "不服务完全自动的空白生成",
          customer_evidence_ids: ["e1"],
          company_fact_ids: ["f1"],
          dream_version_id: "d1",
        },
      ],
    });
    expect(synthesis.benefit_chain[0].fact_id).toBe("f1");
  });

  it("compares immutable versions without declaring one better", () => {
    expect(
      parseConceptDelta({
        supported: ["顾客矛盾仍被新证据支持"],
        overturned: ["品类竞争不是主要替代"],
        changed_vision: ["更重视关系时间"],
        changed_difference: ["独特能力改为访谈积累"],
        changed_give_up: ["明确不服务自动写作"],
        new_gaps: ["规模仍未估算"],
        change_reason: "新增顾客结论与梦想版本",
      }).new_gaps
    ).toContain("规模仍未估算");
  });

  it("references Bayesian evidence without exposing posterior percentages", () => {
    const source = stripBayesianPercentages({
      question: "顾客是否会主动复盘？",
      prior: 0.2,
      current_posterior: 0.63,
      updates: [
        {
          evidence_text: "三位顾客说会记录",
          ai_explanation: "这让信念向上移动，但样本仍少。",
          posterior: 0.63,
        },
      ],
    });
    expect(source).toEqual({
      question: "顾客是否会主动复盘？",
      evidence: [
        {
          text: "三位顾客说会记录",
          explanation: "这让信念向上移动，但样本仍少。",
        },
      ],
    });
    expect(JSON.stringify(source)).not.toContain("0.63");
  });
});

describe("concept derivatives", () => {
  it("requires exactly three grounded reasons in landing-page copy", () => {
    expect(
      parseLandingPageConcept({
        headline: "不替顾客想",
        subheadline: "让每一句产品判断都回到顾客原话。",
        reasons_to_believe: [
          { text: "保留顾客原话", source_ids: ["concept:v1"] },
          { text: "区分事实与推演", source_ids: ["concept:v1"] },
          { text: "保留未知", source_ids: ["concept:v1"] },
        ],
        cta: "开始查看证据",
      }).reasons_to_believe
    ).toHaveLength(3);
  });

  it("limits action values to three explicit trade-off rules", () => {
    const value = {
      conflict: "速度与证据冲突",
      prefer: "证据",
      over: "速度",
      statement: "当速度与证据冲突时，优先选择证据。",
      cost: "接受更慢的发布",
      counterexample: "纯样式修复无需等待顾客访谈",
    };
    expect(parseActionValues({ values: [value, value, value] }).values).toHaveLength(3);
    expect(() =>
      parseActionValues({ values: [value, value, value, value] })
    ).toThrow("最多3");
    expect(() =>
      parseActionValues({
        values: [{ ...value, statement: "我们始终重视证据。" }],
      })
    ).toThrow("当X与Y冲突");
  });
});
