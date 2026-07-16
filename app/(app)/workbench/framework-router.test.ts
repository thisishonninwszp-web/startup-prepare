import { describe, expect, it } from "vitest";
import { recommendFrameworks } from "./framework-router";

describe("workbench framework router", () => {
  it("routes unclear next steps toward unified closure", () => {
    const cards = recommendFrameworks({
      objectType: "reality_case",
      objectId: "case-1",
      title: "增长方向卡住",
      hasActiveClosure: false,
      isClosureDue: false,
      unknownCount: 2,
      factCount: 2,
      interpretationCount: 4,
      hasEmotionOrContradiction: false,
      hasQuantitativeQuestion: false,
      needsCustomerEvidence: false,
      needsDirection: false,
    });

    expect(cards).toHaveLength(3);
    expect(cards.some((card) => card.id === "decision_closure")).toBe(true);
    expect(cards.map((card) => card.href)).toContain(
      "/workbench/reality_case/case-1"
    );
  });

  it("routes due closure objects toward result learning", () => {
    const cards = recommendFrameworks({
      objectType: "decision_closure",
      title: "到期的下一步",
      hasActiveClosure: true,
      isClosureDue: true,
      unknownCount: 1,
      factCount: 3,
      interpretationCount: 1,
      hasEmotionOrContradiction: false,
      hasQuantitativeQuestion: false,
      needsCustomerEvidence: false,
      needsDirection: false,
    });

    expect(cards.map((card) => card.id)).toContain("result_learning");
  });

  it("routes emotional contradictions toward focused inquiry or reframing", () => {
    const cards = recommendFrameworks({
      objectType: "reality_case",
      objectId: "case-2",
      title: "极限感",
      hasActiveClosure: true,
      isClosureDue: false,
      unknownCount: 1,
      factCount: 1,
      interpretationCount: 4,
      hasEmotionOrContradiction: true,
      hasQuantitativeQuestion: false,
      needsCustomerEvidence: false,
      needsDirection: false,
    });

    expect(cards.map((card) => card.id)).toEqual(
      expect.arrayContaining(["focused_inquiry", "reframing"])
    );
    expect(cards.map((card) => card.href)).toContain("/reality/case-2");
  });

  it("only passes a reality version id to reasoning tools when one is known", () => {
    const withoutVersion = recommendFrameworks({
      objectType: "reality_case",
      objectId: "case-3",
      title: "数字问题",
      hasActiveClosure: true,
      isClosureDue: false,
      unknownCount: 1,
      factCount: 2,
      interpretationCount: 1,
      hasEmotionOrContradiction: false,
      hasQuantitativeQuestion: true,
      needsCustomerEvidence: false,
      needsDirection: false,
    }).find((card) => card.id === "fermi");
    expect(withoutVersion?.href).toBe("/reasoning/fermi/new");

    const withVersion = recommendFrameworks({
      objectType: "reality_case",
      objectId: "case-3",
      sourceRealityVersionId: "version-9",
      title: "数字问题",
      hasActiveClosure: true,
      isClosureDue: false,
      unknownCount: 1,
      factCount: 2,
      interpretationCount: 1,
      hasEmotionOrContradiction: false,
      hasQuantitativeQuestion: true,
      needsCustomerEvidence: false,
      needsDirection: false,
    }).find((card) => card.id === "fermi");
    expect(withVersion?.href).toBe(
      "/reasoning/fermi/new?reality_version_id=version-9"
    );
  });

  it("never emits scoring or ranking language", () => {
    const text = JSON.stringify(
      recommendFrameworks({
        objectType: "idea",
        title: "新服务",
        hasActiveClosure: false,
        isClosureDue: false,
        unknownCount: 3,
        factCount: 0,
        interpretationCount: 5,
        hasEmotionOrContradiction: true,
        hasQuantitativeQuestion: true,
        needsCustomerEvidence: true,
        needsDirection: false,
      })
    );

    expect(text).not.toMatch(/score|评分|打分|rank|排名|percentage|概率|\d+\s*%/i);
  });
});
