import { describe, expect, it } from "vitest";
import { breakdownQueue, leanSummary, questionMaterial, tallyLeans, type Breakdown } from "./breakdown-shared";

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

describe("预测题先拆哪几道", () => {
  const q = (id: string) => ({ id });
  it("breakdownQueue：先判题在前，再是有先摆出来的数的；没数的不拆；拆过的跳过；最多 limit 道", () => {
    const waiting = [q("a"), q("b"), q("blind"), q("noanchor"), q("c")];
    const anchored = (x: { id: string }) => x.id !== "noanchor";
    expect(breakdownQueue(waiting, new Set(["blind"]), anchored, new Set(), 3).map((x) => x.id)).toEqual(["blind", "a", "b"]);
    // 拆过的占着清单前面的位置，不往后补（清单一天只放前几道）
    expect(breakdownQueue(waiting, new Set(["blind"]), anchored, new Set(["a"]), 3).map((x) => x.id)).toEqual(["blind", "b"]);
  });

  it("questionMaterial：怎么才算会、截止、原题、背景；没有的不写", () => {
    expect(questionMaterial({ criteria: "加 25 个基点以上", resolve_on: "2026-12-18", context: null, original_title: null })).toEqual([
      "怎么才算「会」：加 25 个基点以上",
      "截止：2026-12-18",
    ]);
    expect(questionMaterial({ criteria: "c", resolve_on: "d", context: "背景", original_title: "Will BOJ hike?" })).toHaveLength(4);
  });
});
