import { describe, expect, it } from "vitest";
import {
  AXIS_NAMES,
  DISPOSITIONS,
  DISPOSITION_TOTAL,
  byAxis,
  findDisposition,
  stateOf,
} from "./dispositions";

describe("dispositions", () => {
  it("ships a couple dozen with unique keys", () => {
    expect(DISPOSITION_TOTAL).toBeGreaterThanOrEqual(20);
    expect(new Set(DISPOSITIONS.map((item) => item.key)).size).toBe(
      DISPOSITION_TOTAL
    );
  });

  it("gives every one of them a way to be checked", () => {
    // 没有"怎么验"的气质就只是一个形容词，不该进库。
    for (const item of DISPOSITIONS) {
      expect(item.test.length, item.name).toBeGreaterThan(6);
      expect(item.claim.length, item.name).toBeGreaterThan(4);
    }
  });

  it("files every one under a named axis", () => {
    for (const item of DISPOSITIONS) {
      expect(Object.keys(AXIS_NAMES)).toContain(item.axis);
    }
    expect(byAxis().reduce((sum, group) => sum + group.items.length, 0)).toBe(
      DISPOSITION_TOTAL
    );
  });

  it("finds one by key", () => {
    expect(findDisposition("thinkfirst")?.name).toBe("先想清楚再动");
    expect(findDisposition("nope")).toBeUndefined();
  });

  it("keeps declared and supported strictly apart", () => {
    expect(stateOf({ claimed: false, linkedHypothesisTier: null })).toBe(
      "unclaimed"
    );
    expect(stateOf({ claimed: true, linkedHypothesisTier: null })).toBe(
      "declared"
    );
    // 挂了假设但还停在猜想，仍然只是"声明"。
    expect(stateOf({ claimed: true, linkedHypothesisTier: "hunch" })).toBe(
      "declared"
    );
    expect(stateOf({ claimed: true, linkedHypothesisTier: "working" })).toBe(
      "supported"
    );
    expect(
      stateOf({ claimed: true, linkedHypothesisTier: "load_bearing" })
    ).toBe("supported");
  });

  it("offers both poles where an axis has them", () => {
    const names = DISPOSITIONS.map((item) => item.name);
    expect(names).toContain("先想清楚再动");
    expect(names).toContain("先动手再说");
    expect(names).toContain("独处充电");
    expect(names).toContain("人群充电");
  });
});
