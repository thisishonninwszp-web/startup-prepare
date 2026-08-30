import { describe, expect, it } from "vitest";
import {
  RARITY_QUOTA,
  assignRarities,
  collectSets,
  polarityOf,
  type TraitInput,
} from "./traits";

function trait(over: Partial<TraitInput> = {}): TraitInput {
  return {
    id: "t1",
    name: "收尾者",
    spectrumKey: "收敛",
    modifiers: [{ sub: "wil.closure", sign: "plus", note: "4/4" }],
    backfire: null,
    equipNote: null,
    setKey: null,
    setEffect: null,
    refusedOffer: null,
    evidence: { windows: 6, contexts: 2, forecastHits: 0 },
    status: "held",
    ...over,
  };
}

function only(input: TraitInput) {
  return assignRarities([input])[0];
}

describe("polarityOf", () => {
  it("reads a mix of signs as double edged", () => {
    expect(
      polarityOf([
        { sub: "dex.ignition", sign: "plus", note: "" },
        { sub: "wis.contact", sign: "minus", note: "" },
      ])
    ).toBe("double");
  });

  it("reads all-negative as a liability and all-positive as an asset", () => {
    expect(polarityOf([{ sub: "wis.contact", sign: "minus", note: "" }])).toBe(
      "liability"
    );
    expect(polarityOf([{ sub: "wil.closure", sign: "plus", note: "" }])).toBe(
      "asset"
    );
  });
});

describe("rarity is computed, not judged", () => {
  it("calls a cross-main mix with a stated backfire 暗金", () => {
    const result = only(
      trait({
        name: "替对方作答",
        modifiers: [
          { sub: "dex.ignition", sign: "plus", note: "+40%" },
          { sub: "wis.contact", sign: "minus", note: "−60%" },
        ],
        backfire: "需求 100% 自我认定时转为负债",
      })
    );
    expect(result.rarity).toBe("unique");
    expect(result.polarity).toBe("double");
    expect(result.verdict).toContain("跨主属性");
  });

  it("refuses 暗金 to a double edge with no backfire written down", () => {
    const result = only(
      trait({
        modifiers: [
          { sub: "dex.ignition", sign: "plus", note: "" },
          { sub: "wis.contact", sign: "minus", note: "" },
        ],
      })
    );
    expect(result.rarity).toBe("magic");
    expect(result.blocked.join(" ")).toContain("反噬条件");
  });

  it("treats a plus and minus inside one main as internal trade-off, not 暗金", () => {
    const result = only(
      trait({
        modifiers: [
          { sub: "wis.contact", sign: "plus", note: "" },
          { sub: "wis.candor", sign: "minus", note: "" },
        ],
        backfire: "写了也不算",
      })
    );
    expect(result.rarity).toBe("rare");
    expect(result.verdict).toContain("内部权衡");
  });

  it("climbs to 史诗 only with a landed forecast and three contexts", () => {
    const short = only(trait({ evidence: { windows: 6, contexts: 2, forecastHits: 0 } }));
    expect(short.rarity).toBe("rare");
    expect(short.blocked.join(" ")).toContain("第 3 类情境");

    const full = only(trait({ evidence: { windows: 6, contexts: 3, forecastHits: 1 } }));
    expect(full.rarity).toBe("epic");
  });

  it("grants 传说 only when a concrete refusal is on record", () => {
    const talk = only(
      trait({ refusedOffer: "   ", evidence: { windows: 6, contexts: 3, forecastHits: 1 } })
    );
    expect(talk.rarity).toBe("epic");

    const proven = only(
      trait({
        refusedOffer: "推掉了那个涨薪 30% 的岗位",
        evidence: { windows: 4, contexts: 2, forecastHits: 0 },
      })
    );
    expect(proven.rarity).toBe("legend");
  });

  it("holds back 传说 when the refusal has no evidence behind it", () => {
    const result = only(
      trait({
        refusedOffer: "推掉过一次",
        evidence: { windows: 1, contexts: 1, forecastHits: 0 },
      })
    );
    expect(result.rarity).not.toBe("legend");
    expect(result.blocked.join(" ")).toContain("传说级");
  });

  it("marks an all-negative trait as a liability without dressing it up", () => {
    const result = only(
      trait({
        name: "闭门造车",
        modifiers: [{ sub: "wis.contact", sign: "minus", note: "" }],
      })
    );
    expect(result.polarity).toBe("liability");
    expect(result.rarity).toBe("common");
  });

  it("says what is still missing when evidence is thin", () => {
    const result = only(trait({ evidence: { windows: 1, contexts: 1, forecastHits: 0 } }));
    expect(result.rarity).toBe("common");
    expect(result.blocked.join(" ")).toContain("触发窗口");
  });
});

describe("quotas", () => {
  const epicTrait = (id: string, windows: number) =>
    trait({
      id,
      spectrumKey: id,
      evidence: { windows, contexts: 3, forecastHits: 1 },
    });

  it("keeps only the quota at 史诗 and demotes the weakest evidence", () => {
    const results = assignRarities([
      epicTrait("a", 20),
      epicTrait("b", 15),
      epicTrait("c", 6),
    ]);
    const epics = results.filter((item) => item.rarity === "epic");
    expect(epics).toHaveLength(RARITY_QUOTA.epic ?? 0);
    const demoted = results.find((item) => item.id === "c");
    expect(demoted?.rarity).toBe("rare");
    expect(demoted?.blocked.join(" ")).toContain("配额已满");
  });

  it("does not let faded traits take up a quota slot", () => {
    const results = assignRarities([
      epicTrait("a", 20),
      { ...epicTrait("b", 15), status: "faded" },
      epicTrait("c", 6),
    ]);
    expect(results.filter((item) => item.rarity === "epic" && item.status === "held"))
      .toHaveLength(2);
  });
});

describe("collectSets", () => {
  it("reports progress and stays incomplete while a member is missing", () => {
    const results = assignRarities([
      trait({ id: "a", spectrumKey: "收敛", setKey: "深水区", setEffect: "适合长周期产品" }),
      trait({ id: "b", spectrumKey: "反馈", setKey: "深水区" }),
      trait({ id: "c", spectrumKey: "认可", setKey: "深水区", status: "faded" }),
    ]);
    const [set] = collectSets(results);
    expect(set.key).toBe("深水区");
    expect(set.held).toBe(2);
    expect(set.size).toBe(3);
    expect(set.complete).toBe(false);
    expect(set.effect).toBe("适合长周期产品");
  });

  it("completes only when every member is held", () => {
    const results = assignRarities([
      trait({ id: "a", spectrumKey: "收敛", setKey: "深水区" }),
      trait({ id: "b", spectrumKey: "反馈", setKey: "深水区" }),
    ]);
    expect(collectSets(results)[0].complete).toBe(true);
  });

  it("ignores traits with no set", () => {
    expect(collectSets(assignRarities([trait()]))).toEqual([]);
  });
});
