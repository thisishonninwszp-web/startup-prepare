import { describe, expect, it } from "vitest";
import {
  MILESTONE_TIERS,
  SKILL_HEADROOM,
  milestoneOf,
  skillCeiling,
  MAX_TICKS_PER_SEASON,
  SKILL_DEFS,
  SKILL_GROUPS,
  SKILL_LAYERS,
  SKILL_TOTAL,
  growthFor,
  isSkillKey,
  rustFor,
  type SkillState,
} from "./skills";
import { MAIN_KEYS } from "./panel";

function skill(over: Partial<SkillState> = {}): SkillState {
  return { key: "asking", value: 40, passion: 0, ticks: 0, daysSinceTick: 10, ...over };
}

describe("skill catalogue", () => {
  it("ships a hundred-odd skills with unique keys", () => {
    expect(SKILL_TOTAL).toBe(SKILL_DEFS.length);
    expect(new Set(SKILL_DEFS.map((item) => item.key)).size).toBe(SKILL_TOTAL);
  });

  it("keeps the bottom layer the widest — a tree you cannot start is useless", () => {
    const count = (layer: string) =>
      SKILL_DEFS.filter((def) => def.layer === layer).length;
    expect(count("component")).toBeGreaterThan(12);
    expect(count("signature")).toBeLessThan(count("core"));
  });

  it("never lets a skill rest on something above it", () => {
    // 同层互搭是允许的（谈判确实建在说服旁边），往上搭不行 —— 那是循环。
    const rank = (key: string) =>
      SKILL_LAYERS.indexOf(SKILL_DEFS.find((def) => def.key === key)!.layer);
    for (const def of SKILL_DEFS) {
      for (const required of def.requires ?? []) {
        expect(
          SKILL_DEFS.some((item) => item.key === required),
          `${def.key} 的前置 ${required} 不存在`
        ).toBe(true);
        expect(rank(required), `${def.key} → ${required}`).toBeLessThanOrEqual(
          rank(def.key)
        );
      }
    }
  });

  it("makes every deep skill actually stand on the layers below it", () => {
    const rank = (key: string) =>
      SKILL_LAYERS.indexOf(SKILL_DEFS.find((def) => def.key === key)!.layer);
    for (const def of SKILL_DEFS) {
      if (def.layer !== "core" && def.layer !== "signature") continue;
      const below = (def.requires ?? []).filter(
        (required) => rank(required) < rank(def.key)
      );
      expect(below.length, `${def.key} 没有踩在下面任何一层上`).toBeGreaterThan(
        0
      );
    }
  });

  it("has no cycles — you can always start somewhere", () => {
    const byKey = new Map(SKILL_DEFS.map((def) => [def.key, def]));
    const state = new Map<string, number>();
    const walk = (key: string, trail: string[]): void => {
      if (state.get(key) === 2) return;
      expect(state.get(key), `环：${[...trail, key].join(" → ")}`).not.toBe(1);
      state.set(key, 1);
      for (const required of byKey.get(key)?.requires ?? []) {
        walk(required, [...trail, key]);
      }
      state.set(key, 2);
    };
    for (const def of SKILL_DEFS) walk(def.key, []);
  });

  it("makes the deep layers reach across domains — that is what deep means", () => {
    const groupOf = (key: string) =>
      SKILL_DEFS.find((def) => def.key === key)!.group;
    const deep = SKILL_DEFS.filter(
      (def) => def.layer === "core" || def.layer === "signature"
    );
    const crossing = deep.filter((def) => {
      const groups = new Set((def.requires ?? []).map(groupOf));
      groups.add(def.group);
      return groups.size > 1;
    });
    expect(crossing.length).toBeGreaterThan(deep.length * 0.6);
  });

  it("stacks advanced skills on top of base ones", () => {
    const advanced = SKILL_DEFS.filter((def) => (def.requires ?? []).length > 0);
    // 一半以上的技能有地基，树才是树，不是一张平表。
    expect(advanced.length).toBeGreaterThan(SKILL_DEFS.length / 2);
    const narrative = SKILL_DEFS.find((def) => def.key === "narrative")!;
    expect(narrative.requires).toEqual(["structure", "writing"]);
  });

  it("puts every skill in one of the six groups", () => {
    for (const def of SKILL_DEFS) {
      expect(SKILL_GROUPS).toContain(def.group);
    }
  });

  it("recognises its own keys and rejects made-up ones", () => {
    expect(isSkillKey("coldopen")).toBe(true);
    expect(isSkillKey("telepathy")).toBe(false);
  });
});

describe("growthFor", () => {
  it("gives nothing without a tick — reading does not count", () => {
    expect(growthFor(skill({ ticks: 0, passion: 2 }))).toBe(0);
  });

  it("grows faster when there is more room left", () => {
    const low = growthFor(skill({ value: 10, ticks: 1 }));
    const high = growthFor(skill({ value: 90, ticks: 1 }));
    expect(low).toBeGreaterThan(high);
  });

  it("caps the ticks that count in one season", () => {
    const capped = growthFor(skill({ ticks: MAX_TICKS_PER_SEASON }));
    const spammed = growthFor(skill({ ticks: 40 }));
    expect(spammed).toBe(capped);
  });

  it("never pushes a skill past the maximum", () => {
    expect(growthFor(skill({ value: 99, ticks: 3, passion: 2 }))).toBe(1);
    expect(growthFor(skill({ value: 100, ticks: 3 }))).toBe(0);
  });

  it("lets passion help only when the work actually happened", () => {
    expect(growthFor(skill({ ticks: 2, passion: 1 }))).toBeGreaterThan(
      growthFor(skill({ ticks: 2, passion: 0 }))
    );
    expect(growthFor(skill({ ticks: 0, passion: 2 }))).toBe(0);
  });
});

describe("rustFor", () => {
  it("leaves a skill alone while it is still being used", () => {
    expect(rustFor(skill({ ticks: 1, daysSinceTick: 900 }))).toBe(0);
    expect(rustFor(skill({ ticks: 0, daysSinceTick: 30 }))).toBe(0);
  });

  it("does not rust a skill that was never used", () => {
    expect(rustFor(skill({ value: 30, daysSinceTick: null }))).toBe(0);
  });

  it("eats into a skill left alone for half a year", () => {
    expect(rustFor(skill({ value: 30, ticks: 0, daysSinceTick: 200 }))).toBe(-2);
    expect(rustFor(skill({ value: 30, ticks: 0, daysSinceTick: 400 }))).toBe(-4);
  });

  it("never rusts below zero", () => {
    expect(rustFor(skill({ value: 1, ticks: 0, daysSinceTick: 2000 }))).toBe(-1);
  });
});

describe("skill prerequisites and milestones", () => {
  const values = Object.fromEntries(SKILL_DEFS.map((def) => [def.key, 0]));

  it("points every prerequisite at a real skill and never at itself", () => {
    for (const def of SKILL_DEFS) {
      for (const required of def.requires ?? []) {
        expect(isSkillKey(required), `${def.name} → ${required}`).toBe(true);
        expect(required).not.toBe(def.key);
      }
    }
  });

  it("has no cycles — every skill can be reached from the base", () => {
    const byKey = new Map(SKILL_DEFS.map((def) => [def.key, def]));
    const depth = new Map<string, number>();
    const walk = (key: string, seen: Set<string>): number => {
      if (seen.has(key)) throw new Error(`cycle at ${key}`);
      const cached = depth.get(key);
      if (cached !== undefined) return cached;
      const def = byKey.get(key);
      const own = def?.requires ?? [];
      const value =
        own.length === 0
          ? 0
          : 1 + Math.max(...own.map((item) => walk(item, new Set([...seen, key]))));
      depth.set(key, value);
      return value;
    };
    expect(() => SKILL_DEFS.forEach((def) => walk(def.key, new Set()))).not.toThrow();
  });

  it("caps a skill at its weakest foundation plus the headroom", () => {
    const base = { ...values, listening: 20, askbasic: 90 };
    const { ceiling, limitedBy } = skillCeiling("asking", base);
    expect(ceiling).toBe(20 + SKILL_HEADROOM);
    expect(limitedBy?.name).toBe("倾听");
  });

  it("lets a skill with no prerequisites go all the way", () => {
    expect(skillCeiling("listening", values).ceiling).toBe(100);
    expect(skillCeiling("listening", values).limitedBy).toBeNull();
  });

  it("picks the weakest of several foundations", () => {
    const base = { ...values, probing: 70, arithmetic: 70, listening: 30 };
    expect(skillCeiling("negotiating", base).limitedBy?.name).toBe("倾听");
  });

  it("stops growth at the ceiling — you must go back and fill the base", () => {
    const state = {
      key: "asking",
      value: 40,
      passion: 0,
      ticks: 3,
      daysSinceTick: 1,
    };
    expect(growthFor(state, 40)).toBe(0);
    expect(growthFor(state, 100)).toBeGreaterThan(0);
  });

  it("files every skill under a main attribute", () => {
    for (const def of SKILL_DEFS) {
      expect(MAIN_KEYS, def.name).toContain(def.main);
    }
  });

  it("gives every skill three milestones with a checkable test", () => {
    for (const def of SKILL_DEFS) {
      expect(def.milestones, def.name).toHaveLength(3);
      for (const milestone of def.milestones ?? []) {
        expect(milestone.test.length).toBeGreaterThan(4);
      }
      expect((def.milestones ?? []).map((item) => item.at)).toEqual([
        ...MILESTONE_TIERS,
      ]);
    }
  });

  it("reports which milestone you are between", () => {
    const def = SKILL_DEFS.find((item) => item.key === "negotiating")!;
    expect(milestoneOf(def, 10).passed).toHaveLength(0);
    expect(milestoneOf(def, 10).next?.name).toBe("敢开口");
    expect(milestoneOf(def, 70).passed).toHaveLength(2);
    expect(milestoneOf(def, 90).next).toBeNull();
  });
});
