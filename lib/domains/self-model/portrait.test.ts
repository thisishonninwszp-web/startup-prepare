import { describe, expect, it } from "vitest";
import {
  renderWritings,
  scoreShift,
  selectWritings,
  type PortraitAxisResult,
  type Writing,
} from "./portrait";

function writing(date: string, text: string, kind: Writing["kind"] = "observation"): Writing {
  return { kind, date, text };
}

function axis(score: number, evidence = 0.9): PortraitAxisResult {
  return { score, confidence: 0.6, probabilities: [0.2, 0.2, 0.2, 0.2, 0.2], evidence };
}

describe("挑原文", () => {
  it("从新到旧挑，空白的不要", () => {
    const { picked, counts } = selectWritings([
      writing("2026-09-01", "旧的"),
      writing("2026-09-20", "新的", "retro"),
      writing("2026-09-10", "   "),
    ]);
    expect(picked.map((item) => item.text)).toEqual(["新的", "旧的"]);
    expect(counts).toEqual({ retro: 1, observation: 1, declaration: 0, learned: 0 });
  });

  it("单段太长截断，总字数到顶就停", () => {
    const long = "字".repeat(50);
    const { picked, chars } = selectWritings(
      [writing("2026-09-03", long), writing("2026-09-02", long), writing("2026-09-01", long)],
      45,
      20
    );
    expect(picked).toHaveLength(2);
    expect(picked[0].text).toBe(`${"字".repeat(20)}…`);
    expect(chars).toBe(42);
  });

  it("送去的文字带日期和出处", () => {
    const text = renderWritings([writing("2026-09-20", "约了三个人", "retro")]);
    expect(text).toContain("[2026-09-20｜周复盘里你说的] 约了三个人");
  });
});

describe("和上次比", () => {
  it("两边都有依据才比", () => {
    expect(scoreShift(axis(2.7), axis(2.1))).toBe(0.6);
    expect(scoreShift(axis(2.7), undefined)).toBeNull();
    expect(scoreShift(axis(2.7, 0.2), axis(2.1))).toBeNull();
    expect(scoreShift(axis(2.7), axis(2.1, 0.3))).toBeNull();
  });
});
