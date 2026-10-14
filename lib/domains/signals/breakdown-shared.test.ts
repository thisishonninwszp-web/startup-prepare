import { describe, expect, it } from "vitest";
import { leanSummary, tallyLeans, type Breakdown } from "./breakdown-shared";

const breakdown: Breakdown = {
  generated_at: "",
  factors: [
    { factor: "通胀离 2% 目标有多远", mechanism: "m", indicator: "PCE", now: "n", basis: [] },
    { factor: "就业市场", mechanism: "m", indicator: "非农", now: "n", basis: [] },
    { factor: "官员表态", mechanism: "m", indicator: "讲话", now: "n", basis: [] },
  ],
};

describe("拆解卡", () => {
  it("leanSummary：只写他点过的；没拆就是空", () => {
    expect(leanSummary(breakdown, ["yes", null, "unclear"])).toBe("通胀离 2% 目标有多远：偏向会；官员表态：看不出");
    expect(leanSummary(null, ["yes"])).toBe("");
  });

  it("tallyLeans：只数次数", () => {
    expect(tallyLeans(["yes", "no", "yes", null])).toEqual({ yes: 2, no: 1, unclear: 0 });
  });
});
