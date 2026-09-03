import { describe, expect, it } from "vitest";
import {
  BUILD_DEFS,
  BUILD_MIN_MATCH,
  TITLE_DEFS,
  TITLE_TOTAL,
  buildProgress,
  evaluateTitles,
  matchBuild,
  type TitleContext,
} from "./titles";
import { TRAIT_LIBRARY } from "./trait-library";

const EMPTY: TitleContext = {
  level: 1,
  kills: { trash: 0, elite: 0, boss: 0, total: 0 },
  refuted: 0,
  loadBearing: 0,
  settledForecasts: 0,
  hitForecasts: 0,
  longestHitStreak: 0,
  litDomains: 0,
  coverage: { lit: 0, total: 26 },
  distinctContexts: 0,
  windows: 0,
  contraryWindows: 0,
  heldTraits: [],
  uniqueTraits: 0,
  completeSets: 0,
  skillTicks: 0,
  maxSkill: 0,
  skillsAbove: () => 0,
  trainingDays: 0,
  longestSpanDays: 0,
  exposures: 0,
  newFaces: 0,
  acceptedProposals: 0,
  commitments: { done: 0, total: 0 },
  sleepEnoughDays: 0,
};

function earned(ctx: Partial<TitleContext>): string[] {
  return evaluateTitles({ ...EMPTY, ...ctx })
    .filter((item) => item.earned)
    .map((item) => item.def.name);
}

describe("titles", () => {
  it("ships more than thirty titles with unique keys and a stated requirement", () => {
    expect(TITLE_TOTAL).toBeGreaterThanOrEqual(30);
    expect(new Set(TITLE_DEFS.map((def) => def.key)).size).toBe(TITLE_TOTAL);
    for (const def of TITLE_DEFS) {
      expect(def.requirement.length).toBeGreaterThan(0);
    }
  });

  it("gives nothing away on an empty character", () => {
    expect(earned({})).toEqual([]);
  });

  it("rewards the first boss, not the first level", () => {
    expect(earned({ level: 9 })).toEqual([]);
    expect(earned({ kills: { trash: 0, elite: 0, boss: 1, total: 1 } })).toContain(
      "开口"
    );
  });

  it("rewards being wrong — that is the hard one", () => {
    expect(earned({ refuted: 1 })).toContain("认栽");
    expect(earned({ refuted: 3 })).toContain("打脸王");
    expect(earned({ refuted: 1, loadBearing: 1 })).toContain("破戒");
  });

  it("wants a streak, not a lucky total, for 预言家", () => {
    expect(earned({ settledForecasts: 20, hitForecasts: 20 })).not.toContain(
      "预言家"
    );
    expect(earned({ longestHitStreak: 5 })).toContain("预言家");
  });

  it("counts half-right only once there is a real denominator", () => {
    expect(earned({ settledForecasts: 4, hitForecasts: 4 })).not.toContain("一半对");
    expect(earned({ settledForecasts: 10, hitForecasts: 5 })).toContain("一半对");
  });

  it("does not hand out 过半 to an empty panel", () => {
    expect(earned({ coverage: { lit: 0, total: 26 } })).not.toContain("过半");
    expect(earned({ coverage: { lit: 13, total: 26 } })).toContain("过半");
  });

  it("uses the skill threshold helper for 多面手", () => {
    expect(
      earned({ skillsAbove: (threshold) => (threshold === 40 ? 5 : 0) })
    ).toContain("多面手");
  });
});

describe("builds", () => {
  it("names a weakness for every build — a build with only upsides is flattery", () => {
    for (const def of BUILD_DEFS) {
      expect(def.weakness.length).toBeGreaterThan(0);
      expect(def.play.length).toBeGreaterThan(0);
    }
  });

  it("only uses trait names that actually exist in the library", () => {
    const names = new Set(TRAIT_LIBRARY.map((item) => item.name));
    for (const def of BUILD_DEFS) {
      for (const trait of def.traits) {
        expect(names.has(trait), `${def.name} 引用了不存在的特性 ${trait}`).toBe(
          true
        );
      }
    }
  });

  it("stays unassigned until two traits line up", () => {
    expect(matchBuild([])).toBeNull();
    expect(matchBuild(["掘井人"])).toBeNull();
    expect(matchBuild(["掘井人", "封顶匠"])?.def.name).toBe("工匠");
  });

  it("picks the build with the most matches", () => {
    const match = matchBuild(["掘井人", "封顶匠", "塔中人", "游商", "火折子"]);
    expect(match?.def.name).toBe("工匠");
    expect(match?.matched).toHaveLength(3);
  });

  it("requires at least the stated minimum", () => {
    expect(BUILD_MIN_MATCH).toBe(2);
  });

  it("shows what each build is still missing, best first", () => {
    const progress = buildProgress(["掘井人", "封顶匠"]);
    expect(progress[0].def.name).toBe("工匠");
    expect(progress[0].matched).toEqual(["掘井人", "封顶匠"]);
    expect(progress[0].missing).toContain("塔中人");
    expect(progress).toHaveLength(BUILD_DEFS.length);
  });
});
