import { describe, expect, it } from "vitest";
import {
  DECISION_OBJECT_TYPES,
  parseFrameworkRecommendation,
  parseFrameworkRecommendations,
} from "./domain";

const validCard = {
  id: "reality_map",
  lane: "see_reality",
  title: "现状地图",
  reason: "当前材料里事实和解释混在一起，需要先拆开。",
  opens: "区分已经确认的事实、你的解释和仍未知的部分。",
  blind_spot: "它不能告诉你顾客是否真的在意。",
  output: "一张可引用的现状地图。",
  href: "/reality/case-1",
};

describe("workbench domain", () => {
  it("supports the decision object types used by the unified workbench", () => {
    expect(DECISION_OBJECT_TYPES).toEqual([
      "reality_case",
      "idea",
      "customer_case",
      "dream_case",
      "dream_branch",
      "retro_period",
      "company_profile",
      "reasoning_session",
      "decision_closure",
    ]);
  });

  it("accepts a grounded framework recommendation card", () => {
    expect(parseFrameworkRecommendation(validCard)).toEqual(validCard);
  });

  it("rejects score, percentage, rank and probability shaped recommendation cards", () => {
    for (const forbidden of ["score", "percentage", "rank", "probability"]) {
      expect(() =>
        parseFrameworkRecommendation({ ...validCard, [forbidden]: 1 })
      ).toThrow(forbidden);
    }
  });

  it("requires exactly one recommendation per workbench lane", () => {
    expect(
      parseFrameworkRecommendations([
        validCard,
        { ...validCard, id: "outside_view", lane: "test_judgment" },
        { ...validCard, id: "decision_closure", lane: "close_action" },
      ]).map((item) => item.lane)
    ).toEqual(["see_reality", "test_judgment", "close_action"]);

    expect(() => parseFrameworkRecommendations([validCard])).toThrow(
      "exactly 3"
    );
  });
});
