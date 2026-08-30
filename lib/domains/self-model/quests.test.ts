import { describe, expect, it } from "vitest";
import {
  TIER_EXP,
  buildQuests,
  levelFromExp,
  tallyKills,
  type KillInput,
  type QuestInput,
} from "./quests";

const NO_KILLS: KillInput = {
  windowsTotal: 0,
  windowsStrong: 0,
  settledPredictions: 0,
  refutedHypotheses: 0,
  bodyLogs: 0,
  concludedBattles: 0,
  litDomains: 0,
};

const NO_QUESTS: QuestInput = {
  hypotheses: [],
  overduePredictions: [],
  darkDomains: [],
  uncollected: [],
};

describe("tallyKills", () => {
  it("starts at zero", () => {
    expect(tallyKills(NO_KILLS)).toMatchObject({ total: 0, exp: 0 });
  });

  it("counts a strong window as elite and never also as trash", () => {
    const tally = tallyKills({ ...NO_KILLS, windowsTotal: 5, windowsStrong: 2 });
    expect(tally.trash).toBe(3);
    expect(tally.elite).toBe(2);
    expect(tally.total).toBe(5);
  });

  it("does not let strong windows exceed the total", () => {
    const tally = tallyKills({ ...NO_KILLS, windowsTotal: 2, windowsStrong: 9 });
    expect(tally.trash).toBe(0);
    expect(tally.elite).toBe(2);
  });

  it("treats refuting yourself as a boss kill", () => {
    const tally = tallyKills({ ...NO_KILLS, refutedHypotheses: 1 });
    expect(tally.boss).toBe(1);
    expect(tally.exp).toBe(TIER_EXP.boss);
  });

  it("gives no boss credit for the first domain, only for widening", () => {
    expect(tallyKills({ ...NO_KILLS, litDomains: 1 }).boss).toBe(0);
    expect(tallyKills({ ...NO_KILLS, litDomains: 3 }).boss).toBe(2);
  });

  it("adds up experience from the tier table", () => {
    const tally = tallyKills({
      ...NO_KILLS,
      windowsTotal: 4,
      windowsStrong: 1,
      settledPredictions: 2,
      bodyLogs: 5,
      refutedHypotheses: 1,
    });
    expect(tally.exp).toBe(8 * 10 + 3 * 50 + 1 * 200);
  });
});

describe("levelFromExp", () => {
  it("starts everyone at level one", () => {
    expect(levelFromExp(0)).toMatchObject({ level: 1, into: 0, toNext: 100 });
  });

  it("levels up on the cumulative curve", () => {
    expect(levelFromExp(99).level).toBe(1);
    expect(levelFromExp(100).level).toBe(2);
    expect(levelFromExp(299).level).toBe(2);
    expect(levelFromExp(300).level).toBe(3);
    expect(levelFromExp(600).level).toBe(4);
  });

  it("reports progress inside the current level", () => {
    expect(levelFromExp(150)).toMatchObject({ level: 2, into: 50, toNext: 150 });
  });

  it("treats negative experience as zero", () => {
    expect(levelFromExp(-40).level).toBe(1);
  });
});

describe("buildQuests", () => {
  const hypothesis = {
    id: "h1",
    code: "H-001",
    statement: "会先预判对方的回答然后跳过提问",
    contexts: 2,
    hasPendingPrediction: false,
    closed: false,
  };

  it("returns nothing when there is nothing to do", () => {
    expect(buildQuests(NO_QUESTS)).toEqual([]);
  });

  it("turns a hypothesis short on contexts into a boss", () => {
    const quests = buildQuests({ ...NO_QUESTS, hypotheses: [hypothesis] });
    const boss = quests.find((quest) => quest.tier === "boss");
    expect(boss?.name).toContain("H-001");
    expect(boss?.drop).toContain("3");
  });

  it("leaves a hypothesis alone once it spans three contexts", () => {
    const quests = buildQuests({
      ...NO_QUESTS,
      hypotheses: [{ ...hypothesis, contexts: 3, hasPendingPrediction: true }],
    });
    expect(quests).toEqual([]);
  });

  it("ignores closed hypotheses entirely", () => {
    const quests = buildQuests({
      ...NO_QUESTS,
      hypotheses: [{ ...hypothesis, closed: true }],
    });
    expect(quests).toEqual([]);
  });

  it("asks for a bet when a live hypothesis has none pending", () => {
    const quests = buildQuests({
      ...NO_QUESTS,
      hypotheses: [{ ...hypothesis, contexts: 3 }],
    });
    expect(quests).toHaveLength(1);
    expect(quests[0].id).toBe("bet:h1");
    expect(quests[0].attribute).toBe("INT");
  });

  it("offers the cheapest opener for each dark domain", () => {
    const quests = buildQuests({
      ...NO_QUESTS,
      darkDomains: ["body", "people"],
    });
    const body = quests.find((quest) => quest.domain === "body");
    const people = quests.find((quest) => quest.domain === "people");
    expect(body?.tier).toBe("trash");
    expect(people?.tier).toBe("elite");
  });

  it("surfaces overdue forecasts — an unsettled bet was never a bet", () => {
    const quests = buildQuests({
      ...NO_QUESTS,
      overduePredictions: [{ id: "p1", text: "社长会说要每月看" }],
    });
    expect(quests[0]).toMatchObject({ id: "resolve:p1", tier: "elite" });
  });

  it("puts bosses first and caps the list at eight", () => {
    const quests = buildQuests({
      hypotheses: Array.from({ length: 6 }, (_, index) => ({
        ...hypothesis,
        id: `h${index}`,
        code: `H-00${index}`,
      })),
      overduePredictions: Array.from({ length: 6 }, (_, index) => ({
        id: `p${index}`,
        text: "到期了",
      })),
      darkDomains: ["body"],
      uncollected: [
        { key: "con.sleep", name: "睡眠债", main: "CON", domain: "self" },
      ],
    });
    expect(quests).toHaveLength(8);
    expect(quests.slice(0, 6).every((quest) => quest.tier === "boss")).toBe(true);
    // 小怪被挤出去了：怪太多的时候，先打你最想躲的那几只。
    expect(quests.some((quest) => quest.tier === "trash")).toBe(false);
  });
});
