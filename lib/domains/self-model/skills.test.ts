import { describe, expect, it } from "vitest";
import {
  FEAT_DEFS,
  FEAT_LINES,
  FEAT_TOTAL,
  MILESTONE_TIERS,
  SKILL_HEADROOM,
  featPaths,
  milestoneOf,
  skillCeiling,
  LEVELS_PER_FEAT_POINT,
  MAX_TICKS_PER_SEASON,
  SKILL_DEFS,
  SKILL_GROUPS,
  SKILL_LAYERS,
  SKILL_TOTAL,
  evaluateFeat,
  evaluateFeats,
  featPointsFor,
  growthFor,
  isSkillKey,
  rustFor,
  type FeatContext,
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

describe("feats", () => {
  const ctx = (over: Partial<FeatContext> = {}): FeatContext => ({
    skills: {},
    traits: [],
    taken: [],
    settledForecasts: 0,
    litDomains: 1,
    featPointsLeft: 1,
    ...over,
  });

  const coldread = FEAT_DEFS.find((def) => def.key === "interview1")!;
  const deep = FEAT_DEFS.find((def) => def.key === "interview2")!;

  it("spells out exactly which skill is short and by how much", () => {
    const result = evaluateFeat(coldread, ctx({ skills: { asking: 20, listening: 40 } }));
    expect(result.unlocked).toBe(false);
    expect(result.missing).toEqual(["质询 20/30"]);
  });

  it("unlocks once every prerequisite is met", () => {
    const result = evaluateFeat(coldread, ctx({ skills: { asking: 30, listening: 45 } }));
    expect(result).toMatchObject({ unlocked: true, missing: [] });
  });

  it("requires the feat below it on the tree first", () => {
    const result = evaluateFeat(
      deep,
      ctx({ skills: { asking: 60, observing: 50 } })
    );
    expect(result.missing.join(" ")).toContain("冷读");
    expect(
      evaluateFeat(
        deep,
        ctx({ skills: { asking: 60, observing: 50 }, taken: ["interview1"] })
      ).unlocked
    ).toBe(true);
  });

  it("marks a feat already taken as neither unlocked nor missing anything", () => {
    const result = evaluateFeat(
      coldread,
      ctx({ skills: { asking: 60, listening: 60 }, taken: ["interview1"] })
    );
    expect(result).toMatchObject({ taken: true, unlocked: false, missing: [] });
  });

  it("evaluates the whole tree at once", () => {
    expect(evaluateFeats(ctx())).toHaveLength(FEAT_DEFS.length);
  });

  it("every prerequisite feat key actually exists", () => {
    const keys = new Set(FEAT_DEFS.map((def) => def.key));
    for (const def of FEAT_DEFS) {
      for (const required of def.requires ?? []) {
        expect(keys.has(required)).toBe(true);
      }
    }
  });

  it("every feat skill prerequisite points at a real skill", () => {
    for (const def of FEAT_DEFS) {
      for (const key of Object.keys(def.skills)) {
        expect(isSkillKey(key)).toBe(true);
      }
    }
  });
});

describe("featPointsFor", () => {
  it("hands out one point every two levels", () => {
    expect(featPointsFor(1, 0)).toBe(0);
    expect(featPointsFor(LEVELS_PER_FEAT_POINT, 0)).toBe(1);
    expect(featPointsFor(6, 0)).toBe(3);
  });

  it("subtracts what has already been spent and never goes negative", () => {
    expect(featPointsFor(6, 2)).toBe(1);
    expect(featPointsFor(2, 9)).toBe(0);
  });
});

describe("the tree", () => {
  it("ships fourteen lines five deep plus thirty crossovers", () => {
    expect(FEAT_TOTAL).toBe(100);
    const byLine = new Map<string, number>();
    for (const def of FEAT_DEFS) {
      byLine.set(def.line, (byLine.get(def.line) ?? 0) + 1);
    }
    for (const line of FEAT_LINES) {
      if (line === "capstone") continue;
      expect(byLine.get(line), line).toBe(5);
    }
    expect(byLine.get("capstone")).toBe(30);
  });

  it("chains each line so you cannot skip a step", () => {
    for (const def of FEAT_DEFS) {
      if (def.line === "capstone" || def.depth === 1) continue;
      expect(def.requires, def.name).toContain(`${def.line}${def.depth - 1}`);
    }
  });

  it("raises the skill bar as a line goes deeper", () => {
    for (const line of FEAT_LINES) {
      if (line === "capstone") continue;
      const steps = FEAT_DEFS.filter((def) => def.line === line).sort(
        (a, b) => a.depth - b.depth
      );
      const peaks = steps.map((step) => Math.max(...Object.values(step.skills)));
      for (let i = 1; i < peaks.length; i += 1) {
        expect(peaks[i], `${line}${i + 1}`).toBeGreaterThan(peaks[i - 1]);
      }
    }
  });

  it("gives every line a named endpoint at depth five", () => {
    for (const line of FEAT_LINES) {
      if (line === "capstone") continue;
      const end = FEAT_DEFS.find(
        (def) => def.line === line && def.depth === 5
      );
      expect(end, line).toBeTruthy();
      // 终点必须是一句"走到底长什么样"，不是又一个技能门槛。
      expect(end!.effect.length).toBeGreaterThan(8);
    }
  });

  it("makes every capstone cross two different lines", () => {
    const lineOfKey = new Map(FEAT_DEFS.map((def) => [def.key, def.line]));
    for (const def of FEAT_DEFS.filter((item) => item.line === "capstone")) {
      const lines = new Set((def.requires ?? []).map((key) => lineOfKey.get(key)));
      expect(lines.size, def.name).toBe(2);
    }
  });

  it("lays the paths out with the next step and what it needs", () => {
    const paths = featPaths(
      evaluateFeats({
        skills: { asking: 30, listening: 30 },
        traits: [],
        taken: ["interview1"],
        settledForecasts: 0,
        litDomains: 0,
        featPointsLeft: 1,
      })
    );
    const interview = paths.find((path) => path.line === "interview")!;
    expect(interview.reached).toBe(1);
    expect(interview.next?.def.name).toBe("深访");
    expect(interview.next?.missing.join(" ")).toContain("观察");
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
