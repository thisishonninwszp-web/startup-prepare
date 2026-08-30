import { describe, expect, it } from "vitest";
import {
  DOMAINS,
  MAIN_KEYS,
  SUB_TOTAL,
  buildPanel,
  estimateOneRepMax,
  repeatRate,
  specialization,
  type PanelInput,
  type SubAttribute,
} from "./panel";

const EMPTY: PanelInput = {
  predictionsSettled: 0,
  predictionsHit: 0,
  ideaLifespans: [],
  longestSpanDays: 0,
  activeIdeas: 0,
  ideasTotal: 0,
  ideasPerMonth: 0,
  decisionsTotal: 0,
  validationsPerIdea: [],
  validationsPerMonth: 0,
  painNo: 0,
  painTotal: 0,
  firstContactDelays: [],
  learnedTexts: [],
  battlesConcluded: 0,
  battlesWithNewPosition: 0,
  commitmentsTotal: 0,
  commitmentsDone: 0,
  liftSessions: 0,
  strengthStart: 0,
  strengthNow: 0,
  weeklyTonnage: 0,
  trainingDays: 0,
  trainingLogs: 0,
  cardioSessions: 0,
  cardioMinutes: 0,
  distinctContexts: 0,
  sleepDays: 0,
  sleepEnoughDays: 0,
  exposures: 0,
  proposalsTotal: 0,
  proposalsAccepted: 0,
  newFaces: 0,
  serendipities: 0,
  runwayMonths: null,
  allies: null,
  weeklyFreeHours: null,
};

function full(over: Partial<PanelInput> = {}): PanelInput {
  return {
    ...EMPTY,
    predictionsSettled: 10,
    predictionsHit: 7,
    ideaLifespans: [20, 40, 60, 80, 100],
    longestSpanDays: 150,
    activeIdeas: 4,
    ideasTotal: 8,
    ideasPerMonth: 1.5,
    decisionsTotal: 6,
    validationsPerIdea: [2, 3, 4, 1, 5],
    validationsPerMonth: 4,
    painNo: 6,
    painTotal: 20,
    firstContactDelays: [2, 4, 6, 8, 10],
    learnedTexts: ["接触太晚了", "验证前先找人", "别自己想需求", "先问再做", "钱要算清"],
    battlesConcluded: 4,
    battlesWithNewPosition: 2,
    commitmentsTotal: 8,
    commitmentsDone: 6,
    liftSessions: 12,
    strengthStart: 200,
    strengthNow: 250,
    weeklyTonnage: 8000,
    trainingDays: 24,
    trainingLogs: 24,
    cardioSessions: 6,
    cardioMinutes: 150,
    distinctContexts: 3,
    sleepDays: 20,
    sleepEnoughDays: 12,
    exposures: 4,
    proposalsTotal: 5,
    proposalsAccepted: 2,
    newFaces: 3,
    serendipities: 2,
    runwayMonths: 8,
    allies: 2,
    weeklyFreeHours: 10,
    ...over,
  };
}

function subs(input: PanelInput): Record<string, SubAttribute> {
  const panel = buildPanel(input);
  return Object.fromEntries(
    panel.mains.flatMap((main) => main.subs.map((sub) => [sub.key, sub]))
  );
}

describe("panel shape", () => {
  it("keeps nine main attributes and twenty-six sub attributes", () => {
    const panel = buildPanel(EMPTY);
    expect(panel.mains.map((m) => m.key)).toEqual([...MAIN_KEYS]);
    expect(panel.total).toBe(SUB_TOTAL);
    expect(SUB_TOTAL).toBe(26);
  });

  it("gives every sub attribute a domain, and covers all four", () => {
    const panel = buildPanel(EMPTY);
    const seen = new Set(
      panel.mains.flatMap((main) => main.subs.map((sub) => sub.domain))
    );
    expect([...seen].sort()).toEqual([...DOMAINS].sort());
    expect(panel.domains.reduce((sum, d) => sum + d.total, 0)).toBe(SUB_TOTAL);
  });

  it("lights nothing at all when there is no data", () => {
    const panel = buildPanel(EMPTY);
    expect(panel.lit).toBe(0);
    expect(panel.mains.every((main) => main.level === null)).toBe(true);
    expect(panel.domains.every((domain) => domain.lit === 0)).toBe(true);
  });
});

describe("sub attributes", () => {
  it("withholds a value until the sample is big enough", () => {
    const attributes = subs({ ...EMPTY, predictionsSettled: 4, predictionsHit: 4 });
    expect(attributes["int.calibration"].value).toBeNull();
    expect(attributes["int.calibration"].sample).toBe(4);
    expect(attributes["int.calibration"].need).toContain("1");
  });

  it("always reports the denominator in the basis line", () => {
    const attributes = subs(full());
    expect(attributes["int.calibration"].basis).toContain("7/10");
    expect(attributes["cha.commitment"].basis).toContain("6/8");
    expect(attributes["wil.closure"].basis).toContain("6/8");
    expect(attributes["wis.candor"].basis).toContain("6/20");
  });

  it("scores strength against your own starting point", () => {
    expect(subs(full({ strengthStart: 200, strengthNow: 300 }))["str.absolute"].value)
      .toBe(20);
    expect(subs(full({ strengthStart: 200, strengthNow: 200 }))["str.absolute"].value)
      .toBe(0);
  });

  it("rewards restraint — opening fewer new projects scores higher", () => {
    const calm = subs(full({ ideasPerMonth: 0.5 }))["wil.restraint"].value;
    const frantic = subs(full({ ideasPerMonth: 9 }))["wil.restraint"].value;
    expect(calm).toBeGreaterThan(frantic as number);
  });

  it("never returns a value outside 0-20", () => {
    const panel = buildPanel(
      full({
        predictionsSettled: 10,
        predictionsHit: 10,
        strengthStart: 100,
        strengthNow: 900,
        trainingDays: 56,
        cardioMinutes: 5000,
        weeklyTonnage: 90000,
        distinctContexts: 40,
        validationsPerMonth: 90,
      })
    );
    for (const main of panel.mains) {
      for (const sub of main.subs) {
        if (sub.value === null) continue;
        expect(sub.value).toBeGreaterThanOrEqual(0);
        expect(sub.value).toBeLessThanOrEqual(20);
      }
    }
  });

  it("scores sleep by nights that reached seven hours, not by the average", () => {
    // 五天四小时 + 两天十二小时的平均值是健康的，实际不是。
    const lumpy = subs(full({ sleepDays: 7, sleepEnoughDays: 2 }))["con.sleep"];
    const steady = subs(full({ sleepDays: 7, sleepEnoughDays: 7 }))["con.sleep"];
    expect(lumpy.value).toBeLessThan(steady.value as number);
    expect(lumpy.basis).toContain("2/7");
  });

  it("needs settled proposals before it will score being listened to", () => {
    expect(subs(full({ proposalsTotal: 2 }))["cha.adoption"].value).toBeNull();
    expect(
      subs(full({ proposalsTotal: 4, proposalsAccepted: 2 }))["cha.adoption"].value
    ).toBe(10);
  });

  it("leaves the resource stats dark until a snapshot exists", () => {
    const none = subs(full({ runwayMonths: null, allies: null, weeklyFreeHours: null }));
    expect(none["res.runway"].value).toBeNull();
    expect(none["res.allies"].value).toBeNull();
    expect(none["res.time"].value).toBeNull();
    expect(subs(full({ runwayMonths: 8 }))["res.runway"].value).not.toBeNull();
  });

  it("lights the people domain once encounters are recorded", () => {
    const panel = buildPanel({ ...EMPTY, exposures: 2, newFaces: 1 });
    const people = panel.domains.find((domain) => domain.domain === "people");
    expect(people?.lit).toBe(2);
  });

  it("marks the not-yet-collected ones honestly instead of scoring them", () => {
    const attributes = subs(full());
    for (const key of [
      "int.transfer",
    ]) {
      expect(attributes[key].value).toBeNull();
      expect(attributes[key].basis).toBe("尚未采集");
    }
  });
});

describe("domain coverage", () => {
  it("shows work lit while body and people stay dark for a desk-only record", () => {
    const panel = buildPanel({
      ...EMPTY,
      ideasTotal: 8,
      activeIdeas: 4,
      ideasPerMonth: 1.5,
      decisionsTotal: 6,
      longestSpanDays: 150,
      firstContactDelays: [2, 4, 6],
      validationsPerIdea: [1, 2, 3],
      validationsPerMonth: 2,
    });
    const byDomain = Object.fromEntries(
      panel.domains.map((domain) => [domain.domain, domain])
    );
    expect(byDomain.work.lit).toBeGreaterThan(0);
    expect(byDomain.body.lit).toBe(0);
    expect(byDomain.people.lit).toBe(0);
  });

  it("lights the people domain once battles have concluded", () => {
    const panel = buildPanel({
      ...EMPTY,
      battlesConcluded: 4,
      battlesWithNewPosition: 2,
    });
    const people = panel.domains.find((d) => d.domain === "people");
    expect(people?.lit).toBe(1);
  });
});

describe("main attribute composition", () => {
  it("averages only the lit sub attributes of the same main", () => {
    const panel = buildPanel(full());
    for (const main of panel.mains) {
      const known = main.subs
        .map((sub) => sub.value)
        .filter((value): value is number => value !== null);
      if (known.length === 0) {
        expect(main.level).toBeNull();
      } else {
        const average = known.reduce((a, b) => a + b, 0) / known.length;
        expect(main.level).toBe(Math.round(average));
      }
    }
  });
});

describe("repeatRate", () => {
  it("is zero when every lesson says something new", () => {
    expect(
      repeatRate(["接触太晚", "钱没算清", "合伙人不合适", "定价太低"])
    ).toBe(0);
  });

  it("catches the same lesson written three times", () => {
    const rate = repeatRate([
      "我应该更早去接触真实客户",
      "我应该更早去接触真实客户群",
      "我应该更早去接触真实的客户",
    ]);
    expect(rate).toBeCloseTo(1, 5);
  });

  it("handles fewer than two entries", () => {
    expect(repeatRate([])).toBe(0);
    expect(repeatRate(["只有一条"])).toBe(0);
  });
});

describe("estimateOneRepMax", () => {
  it("returns the bar weight itself for a single", () => {
    expect(estimateOneRepMax(100, 1)).toBeCloseTo(103.33, 1);
  });

  it("refuses rep ranges too high to estimate from", () => {
    expect(estimateOneRepMax(60, 20)).toBeNull();
    expect(estimateOneRepMax(0, 5)).toBeNull();
  });
});

describe("specialization", () => {
  it("stays silent until at least four main attributes are known", () => {
    expect(specialization(buildPanel(EMPTY))).toMatchObject({ spread: null });
  });

  it("reports the spread and the two poles once enough is known", () => {
    const result = specialization(buildPanel(full()));
    expect(result.spread).not.toBeNull();
    expect(result.strongest?.level).toBeGreaterThanOrEqual(
      result.weakest?.level as number
    );
  });
});
