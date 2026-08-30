import { describe, expect, it } from "vitest";
import {
  FEAT_DEFS,
  LEVELS_PER_FEAT_POINT,
  MAX_TICKS_PER_SEASON,
  SKILL_DEFS,
  SKILL_GROUPS,
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

function skill(over: Partial<SkillState> = {}): SkillState {
  return { key: "asking", value: 40, passion: 0, ticks: 0, daysSinceTick: 10, ...over };
}

describe("skill catalogue", () => {
  it("ships forty-five skills with unique keys", () => {
    expect(SKILL_TOTAL).toBe(45);
    expect(new Set(SKILL_DEFS.map((item) => item.key)).size).toBe(45);
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

  const coldread = FEAT_DEFS.find((def) => def.key === "coldread")!;
  const deep = FEAT_DEFS.find((def) => def.key === "deepinterview")!;

  it("spells out exactly which skill is short and by how much", () => {
    const result = evaluateFeat(coldread, ctx({ skills: { asking: 30, listening: 40 } }));
    expect(result.unlocked).toBe(false);
    expect(result.missing).toEqual(["提问 30/40"]);
  });

  it("unlocks once every prerequisite is met", () => {
    const result = evaluateFeat(coldread, ctx({ skills: { asking: 40, listening: 45 } }));
    expect(result).toMatchObject({ unlocked: true, missing: [] });
  });

  it("requires the feat below it on the tree first", () => {
    const result = evaluateFeat(
      deep,
      ctx({ skills: { asking: 60, observing: 50 } })
    );
    expect(result.missing.join(" ")).toContain("冷读");
    expect(
      evaluateFeat(deep, ctx({ skills: { asking: 60, observing: 50 }, taken: ["coldread"] }))
        .unlocked
    ).toBe(true);
  });

  it("checks trait prerequisites too", () => {
    const lone = FEAT_DEFS.find((def) => def.key === "lonesmith")!;
    const without = evaluateFeat(lone, ctx({ skills: { coding: 70, writing: 50 } }));
    expect(without.missing.join(" ")).toContain("掘井人");
    expect(
      evaluateFeat(
        lone,
        ctx({ skills: { coding: 70, writing: 50 }, traits: ["掘井人"] })
      ).unlocked
    ).toBe(true);
  });

  it("counts settled forecasts for 铁口", () => {
    const iron = FEAT_DEFS.find((def) => def.key === "ironmouth")!;
    const result = evaluateFeat(
      iron,
      ctx({ skills: { forecasting: 60 }, settledForecasts: 4 })
    );
    expect(result.missing).toEqual(["已结算预测 4/10"]);
  });

  it("marks a feat already taken as neither unlocked nor missing anything", () => {
    const result = evaluateFeat(
      coldread,
      ctx({ skills: { asking: 60, listening: 60 }, taken: ["coldread"] })
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
