import { describe, expect, it } from "vitest";
import {
  isProvisionalProxy,
  filterEvidenceForSegment,
  nextCustomerRun,
  parseCustomerEvidenceBatch,
  parseCustomerOpportunities,
  parseCustomerProxyAnswer,
  parseCustomerSegments,
  validateCustomerCitations,
} from "./types";

describe("customer evidence", () => {
  it("accepts only stated, inferred, or unknown emotion evidence", () => {
    const batch = parseCustomerEvidenceBatch({
      atoms: [
        {
          material_id: "m1",
          quote: "每天对账到凌晨，真的很烦。",
          scene: "月末对账",
          behavior: "手工核对多个表格",
          alternative: "继续使用Excel",
          tradeoff: "省软件费但耗时间",
          emotion: "烦躁",
          emotion_basis: "stated",
        },
      ],
    });
    expect(batch.atoms[0].emotion_basis).toBe("stated");
    expect(() =>
      parseCustomerEvidenceBatch({
        atoms: [
          {
            material_id: "m1",
            quote: "内容",
            scene: "场景",
            behavior: "行为",
            alternative: "替代",
            tradeoff: "取舍",
            emotion: "高兴",
            emotion_basis: "certain",
          },
        ],
      })
    ).toThrow("emotion_basis");
  });

  it("marks fewer than three independent kept materials as provisional", () => {
    expect(isProvisionalProxy(["m1", "m2"])).toBe(true);
    expect(isProvisionalProxy(["m1", "m2", "m3"])).toBe(false);
    expect(isProvisionalProxy(["m1", "m1", "m2", "m3"])).toBe(false);
  });
});

describe("customer segmentation", () => {
  it("requires two or three behavioral customer voices", () => {
    expect(
      parseCustomerSegments({
        segments: [
          {
            key: "manual-reconciler",
            label: "继续手工对账的人",
            situation: "月末集中核账",
            behaviors: ["复制多个表格"],
            evidence_ids: ["e1"],
            unknowns: ["是否有采购权"],
          },
          {
            key: "outsourcer",
            label: "把对账交给代账的人",
            situation: "内部没有财务人员",
            behaviors: ["把资料发送给代账"],
            evidence_ids: ["e2"],
            unknowns: ["服务成本"],
          },
        ],
      }).segments
    ).toHaveLength(2);

    expect(() => parseCustomerSegments({ segments: [] })).toThrow("segments");
  });

  it("keeps a proxy inside the selected segment evidence boundary", () => {
    const atoms = [
      { id: "e1", material_id: "m1" },
      { id: "e2", material_id: "m2" },
    ] as Parameters<typeof filterEvidenceForSegment>[0];
    const segment = {
      key: "one",
      label: "第一类",
      situation: "场景",
      behaviors: ["行为"],
      evidence_ids: ["e1"],
      unknowns: [],
    };
    expect(filterEvidenceForSegment(atoms, segment).map((atom) => atom.id)).toEqual([
      "e1",
    ]);
  });
});

describe("grounded proxy answers", () => {
  it("rejects citations outside the allowed evidence set", () => {
    const answer = parseCustomerProxyAnswer({
      answer: "我不会马上换工具。",
      evidence_ids: ["e-forged"],
      inference: "可能担心迁移成本。",
      unknowns: ["是否愿意试用"],
    });
    expect(() => validateCustomerCitations(answer.evidence_ids, ["e1"])).toThrow(
      "未被允许"
    );
  });
});

describe("customer opportunity generation", () => {
  const opportunity = {
    customer_progress: "更快完成月末对账",
    current_alternative: "Excel与人工检查",
    direction: "减少跨表核对步骤",
    evidence_ids: ["e1"],
    evidence_gaps: ["是否愿意迁移"],
    fatal_assumption: "顾客愿意改变现有流程",
  };

  it("allows at most three unranked opportunities", () => {
    expect(
      parseCustomerOpportunities({
        opportunities: [opportunity, opportunity, opportunity],
      }).opportunities
    ).toHaveLength(3);
    expect(() =>
      parseCustomerOpportunities({
        opportunities: [
          opportunity,
          opportunity,
          opportunity,
          opportunity,
        ],
      })
    ).toThrow("最多3条");
  });
});

describe("customer research schedules", () => {
  it("calculates daily and weekly next runs", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    expect(nextCustomerRun("daily", from).toISOString()).toBe(
      "2026-01-02T00:00:00.000Z"
    );
    expect(nextCustomerRun("weekly", from).toISOString()).toBe(
      "2026-01-08T00:00:00.000Z"
    );
  });
});
