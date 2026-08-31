import { describe, expect, it } from "vitest";
import {
  AXIS_NAMES,
  DISPOSITIONS,
  DISPOSITION_TOTAL,
  byAxis,
  findDisposition,
  stateOf,
  matchTypes,
  TYPE_DEFS,
} from "./dispositions";

describe("dispositions", () => {
  it("ships fifty with unique keys", () => {
    expect(DISPOSITION_TOTAL).toBe(50);
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

describe("types", () => {
  it("builds a type out of several dispositions, not one axis", () => {
    // INTP 不是一个标签，是四根轴各取一端 —— 类型也一样，靠组合。
    for (const def of TYPE_DEFS) {
      expect(def.requires.length).toBeGreaterThanOrEqual(3);
      expect(def.min).toBeGreaterThanOrEqual(3);
    }
  });

  it("only references dispositions that exist", () => {
    for (const def of TYPE_DEFS) {
      for (const key of def.requires) {
        expect(findDisposition(key), `${def.name} → ${key}`).toBeTruthy();
      }
    }
  });

  it("stays incomplete until enough dispositions are claimed", () => {
    const two = matchTypes(["solo", "principled"]);
    const tower = two.find((item) => item.def.key === "towerscholar");
    expect(tower?.complete).toBe(false);
    const three = matchTypes(["solo", "principled", "depth"]);
    expect(
      three.find((item) => item.def.key === "towerscholar")?.complete
    ).toBe(true);
  });

  it("says nothing at all when nothing is claimed", () => {
    expect(matchTypes([])).toEqual([]);
  });

  it("ranks the closest type first", () => {
    const matches = matchTypes(["solo", "principled", "depth", "actfirst"]);
    expect(matches[0].def.key).toBe("towerscholar");
  });
});
