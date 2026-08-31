import { describe, expect, it } from "vitest";
import { EMPTY_PANEL_INPUT, buildPanel, type Panel } from "./panel";
import {
  COMBO_LIBRARY,
  COMBO_TOTAL,
  LIBRARY_TOTAL,
  SPECTRUM_TOTAL,
  TRAIT_LIBRARY,
  TRAIT_THRESHOLDS,
  findLibraryTrait,
  comboSpectrumKey,
  scanLibrary,
} from "./trait-library";
import { assignRarities, polarityOf } from "./traits";

/** 直接捏一个面板，只关心子属性的值。 */
function panelWith(values: Record<string, number | null>): Panel {
  const base = buildPanel(EMPTY_PANEL_INPUT);
  return {
    ...base,
    mains: base.mains.map((main) => ({
      ...main,
      subs: main.subs.map((sub) =>
        sub.key in values
          ? { ...sub, value: values[sub.key], sample: 99 }
          : { ...sub, value: null }
      ),
    })),
  };
}

describe("catalogue", () => {
  it("ships one spectrum per sub attribute, two poles each", () => {
    expect(SPECTRUM_TOTAL).toBe(29);
    expect(LIBRARY_TOTAL).toBe(58);
  });

  it("gives every entry a unique key and a real sub attribute", () => {
    const panel = buildPanel(EMPTY_PANEL_INPUT);
    const subKeys = new Set(
      panel.mains.flatMap((main) => main.subs.map((sub) => sub.key))
    );
    expect(new Set(TRAIT_LIBRARY.map((item) => item.key)).size).toBe(
      LIBRARY_TOTAL
    );
    for (const def of TRAIT_LIBRARY) {
      expect(subKeys.has(def.reads)).toBe(true);
    }
  });

  it("covers every sub attribute exactly twice", () => {
    const counts = new Map<string, number>();
    for (const def of TRAIT_LIBRARY) {
      counts.set(def.reads, (counts.get(def.reads) ?? 0) + 1);
    }
    for (const count of counts.values()) expect(count).toBe(2);
  });

  it("points every modifier at the sub attribute it reads or another real one", () => {
    const panel = buildPanel(EMPTY_PANEL_INPUT);
    const subKeys = new Set(
      panel.mains.flatMap((main) => main.subs.map((sub) => sub.key))
    );
    for (const def of TRAIT_LIBRARY) {
      expect(def.modifiers.length).toBeGreaterThan(0);
      for (const modifier of def.modifiers) {
        expect(subKeys.has(modifier.sub)).toBe(true);
      }
    }
  });

  it("makes every double-edged entry state its backfire", () => {
    for (const def of TRAIT_LIBRARY) {
      if (polarityOf(def.modifiers) !== "double") continue;
      expect(def.backfire, `${def.name} 缺反噬条件`).toBeTruthy();
    }
  });

  it("keeps the negative pole negative and the positive pole positive on its own sub", () => {
    for (const def of TRAIT_LIBRARY) {
      const own = def.modifiers.find((modifier) => modifier.sub === def.reads);
      expect(own, `${def.name} 没有挂自己那根光谱`).toBeTruthy();
      expect(own?.sign).toBe(def.pole === "negative" ? "minus" : "plus");
    }
  });

  it("finds an entry by key", () => {
    expect(findLibraryTrait("收敛+")?.name).toBe("封顶匠");
    expect(findLibraryTrait("没有这个")).toBeUndefined();
  });
});

describe("scanLibrary", () => {
  it("grants nothing while every sub attribute is still dark", () => {
    const result = scanLibrary(panelWith({}), []);
    expect(result.grant).toEqual([]);
    expect(result.fade).toEqual([]);
  });

  it("grants the positive pole above the high threshold", () => {
    const result = scanLibrary(
      panelWith({ "wil.closure": TRAIT_THRESHOLDS.high }),
      []
    );
    expect(result.grant.map((item) => item.name)).toEqual(["封顶匠"]);
  });

  it("grants the negative pole at or below the low threshold", () => {
    const result = scanLibrary(
      panelWith({ "wis.contact": TRAIT_THRESHOLDS.low }),
      []
    );
    expect(result.grant.map((item) => item.name)).toEqual(["塔中人"]);
  });

  it("stays silent in the middle — 常人 is the normal case", () => {
    const result = scanLibrary(panelWith({ "wil.closure": 10 }), []);
    expect(result.grant).toEqual([]);
  });

  it("will not grant onto a spectrum that already has a held trait", () => {
    const result = scanLibrary(panelWith({ "wil.closure": 18 }), [
      { libraryKey: null, spectrumKey: "收敛" },
    ]);
    expect(result.grant).toEqual([]);
  });

  it("keeps a held trait that still qualifies", () => {
    const result = scanLibrary(panelWith({ "wil.closure": 18 }), [
      { libraryKey: "收敛+", spectrumKey: "收敛" },
    ]);
    expect(result.keep).toContain("收敛+");
    expect(result.fade).toEqual([]);
  });

  it("fades a held trait once the number moves back to the middle", () => {
    const result = scanLibrary(panelWith({ "wil.closure": 9 }), [
      { libraryKey: "收敛+", spectrumKey: "收敛" },
    ]);
    expect(result.fade.map((item) => item.name)).toEqual(["封顶匠"]);
    expect(result.fade[0].reason).toContain("常人区");
  });

  it("fades a held trait when its evidence disappears entirely", () => {
    const result = scanLibrary(panelWith({}), [
      { libraryKey: "收敛+", spectrumKey: "收敛" },
    ]);
    expect(result.fade[0].reason).toContain("样本");
  });

  it("is a pure function of the panel — rescanning changes nothing", () => {
    const panel = panelWith({ "wil.closure": 18, "wis.contact": 3 });
    const first = scanLibrary(panel, []);
    const held = first.grant.map((item) => ({
      libraryKey: item.key,
      spectrumKey: item.spectrumKey,
    }));
    const second = scanLibrary(panel, held);
    expect(second.grant).toEqual([]);
    expect(second.fade).toEqual([]);
    expect(second.keep.sort()).toEqual(first.grant.map((i) => i.key).sort());
  });
});

describe("library entries survive the rarity rules", () => {
  it("double-edged library traits come out 暗金 once evidence is there", () => {
    const def = findLibraryTrait("接触-")!; // 塔中人
    const [trait] = assignRarities([
      {
        id: "t",
        name: def.name,
        spectrumKey: def.spectrumKey,
        modifiers: def.modifiers,
        backfire: def.backfire ?? null,
        equipNote: def.equipNote ?? null,
        setKey: null,
        setEffect: null,
        refusedOffer: null,
        evidence: { windows: 6, contexts: 3, forecastHits: 1 },
        status: "held",
      },
    ]);
    expect(trait.polarity).toBe("double");
    expect(trait.rarity).toBe("unique");
  });
});

describe("combo traits", () => {
  it("ships a couple dozen combos with unique keys", () => {
    expect(COMBO_TOTAL).toBeGreaterThanOrEqual(20);
    expect(new Set(COMBO_LIBRARY.map((item) => item.key)).size).toBe(COMBO_TOTAL);
  });

  it("needs at least two conditions — one dial is not a combo", () => {
    for (const combo of COMBO_LIBRARY) {
      expect(combo.conditions.length).toBeGreaterThanOrEqual(2);
      expect(combo.modifiers.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("points every condition and modifier at a real sub attribute", () => {
    const panel = buildPanel(EMPTY_PANEL_INPUT);
    const subKeys = new Set(
      panel.mains.flatMap((main) => main.subs.map((sub) => sub.key))
    );
    for (const combo of COMBO_LIBRARY) {
      for (const condition of combo.conditions) {
        expect(subKeys.has(condition.sub), combo.name).toBe(true);
      }
      for (const modifier of combo.modifiers) {
        expect(subKeys.has(modifier.sub), combo.name).toBe(true);
      }
    }
  });

  it("keeps combos off the mutual-exclusion spectra", () => {
    const spectra = new Set(TRAIT_LIBRARY.map((item) => item.spectrumKey));
    for (const combo of COMBO_LIBRARY) {
      expect(spectra.has(comboSpectrumKey(combo))).toBe(false);
    }
  });

  it("grants only when every condition holds at once", () => {
    const deep = scanLibrary(panelWith({ "wil.span": 18 }), []);
    expect(deep.combos.map((item) => item.name)).not.toContain("地窖酿酒师");

    const both = scanLibrary(
      panelWith({ "wil.span": 18, "wis.contact": 3 }),
      []
    );
    expect(both.combos.map((item) => item.name)).toContain("地窖酿酒师");
  });

  it("fades a combo once the conditions stop holding together", () => {
    const result = scanLibrary(panelWith({ "wil.span": 18, "wis.contact": 12 }), [
      { libraryKey: "combo.cellar", spectrumKey: "组合·地窖酿酒师" },
    ]);
    expect(result.fade.map((item) => item.name)).toContain("地窖酿酒师");
    expect(result.fade[0].reason).toContain("不同时成立");
  });

  it("marks the alarm combos so they never read as a reward", () => {
    const alarms = COMBO_LIBRARY.filter((combo) => combo.alarm);
    expect(alarms.length).toBeGreaterThan(0);
    for (const combo of alarms) {
      // 报警型至少有一条负修正，否则它就是在夸人。
      expect(combo.modifiers.some((m) => m.sign === "minus")).toBe(true);
    }
  });
});
