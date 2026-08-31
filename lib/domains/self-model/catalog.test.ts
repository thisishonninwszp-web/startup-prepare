import { describe, expect, it } from "vitest";
import { EMPTY_PANEL_INPUT, buildPanel, type Panel } from "./panel";
import {
  rarityFromConditions,
  scanCatalog,
  spectrumKeyOf,
  type CatalogEntry,
} from "./catalog";

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

function entry(over: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    key: "e1",
    name: "封顶匠",
    gloss: "起的头都封了顶",
    family: "dial",
    spectrumKey: "收敛",
    pole: "positive",
    conditions: [{ sub: "wil.closure", op: "gte", value: 15 }],
    modifiers: [{ sub: "wil.closure", sign: "plus", note: "" }],
    backfire: null,
    equipNote: null,
    setKey: null,
    rarityHint: "magic",
    alarm: false,
    neutral: false,
    ...over,
  };
}

describe("rarityFromConditions", () => {
  it("gets rarer as more things must hold at once", () => {
    const c = (n: number) =>
      Array.from({ length: n }, () => ({
        sub: "x",
        op: "gte" as const,
        value: 15,
      }));
    expect(rarityFromConditions(c(1))).toBe("magic");
    expect(rarityFromConditions(c(2))).toBe("rare");
    expect(rarityFromConditions(c(3))).toBe("epic");
    expect(rarityFromConditions(c(4))).toBe("legend");
  });

  it("treats an extreme threshold as rare as a fourth condition", () => {
    expect(
      rarityFromConditions([{ sub: "x", op: "gte", value: 19 }])
    ).toBe("legend");
    expect(rarityFromConditions([{ sub: "x", op: "lte", value: 2 }])).toBe(
      "legend"
    );
  });
});

describe("scanCatalog", () => {
  it("grants nothing while the panel is dark", () => {
    const result = scanCatalog(panelWith({}), [entry()], []);
    expect(result.grant).toEqual([]);
    expect(result.fade).toEqual([]);
  });

  it("grants when every condition holds", () => {
    const result = scanCatalog(panelWith({ "wil.closure": 18 }), [entry()], []);
    expect(result.grant.map((item) => item.name)).toEqual(["封顶匠"]);
  });

  it("needs all conditions of a combo, not just one", () => {
    const combo = entry({
      key: "c1",
      name: "地窖酿酒师",
      family: "combo",
      spectrumKey: null,
      pole: null,
      conditions: [
        { sub: "wil.span", op: "gte", value: 15 },
        { sub: "wis.contact", op: "lte", value: 6 },
      ],
    });
    expect(scanCatalog(panelWith({ "wil.span": 18 }), [combo], []).grant).toEqual(
      []
    );
    expect(
      scanCatalog(
        panelWith({ "wil.span": 18, "wis.contact": 3 }),
        [combo],
        []
      ).grant.map((item) => item.name)
    ).toEqual(["地窖酿酒师"]);
  });

  it("respects the mutual-exclusion spectrum for dials only", () => {
    const dial = entry();
    const combo = entry({ key: "c1", family: "combo", spectrumKey: null });
    const held = [{ libraryKey: null, spectrumKey: "收敛" }];
    expect(
      scanCatalog(panelWith({ "wil.closure": 18 }), [dial], held).grant
    ).toEqual([]);
    // 组合不占光谱，所以同一根光谱被占着也照发。
    expect(
      scanCatalog(panelWith({ "wil.closure": 18 }), [combo], held).grant
    ).toHaveLength(1);
  });

  it("keeps what still holds and fades what no longer does", () => {
    const held = [{ libraryKey: "e1", spectrumKey: "收敛" }];
    expect(
      scanCatalog(panelWith({ "wil.closure": 18 }), [entry()], held).keep
    ).toEqual(["e1"]);
    const faded = scanCatalog(panelWith({ "wil.closure": 9 }), [entry()], held);
    expect(faded.fade[0].reason).toContain("常人区");
  });

  it("says when the evidence disappeared rather than moved", () => {
    const held = [{ libraryKey: "e1", spectrumKey: "收敛" }];
    const result = scanCatalog(panelWith({}), [entry()], held);
    expect(result.fade[0].reason).toContain("样本");
  });

  it("is a pure function — rescanning changes nothing", () => {
    const panel = panelWith({ "wil.closure": 18 });
    const first = scanCatalog(panel, [entry()], []);
    const held = first.grant.map((item) => ({
      libraryKey: item.key,
      spectrumKey: spectrumKeyOf(item),
    }));
    const second = scanCatalog(panel, [entry()], held);
    expect(second.grant).toEqual([]);
    expect(second.keep).toEqual(["e1"]);
  });

  it("gives combos a fake spectrum key so the unique index cannot collide", () => {
    expect(spectrumKeyOf(entry())).toBe("收敛");
    expect(
      spectrumKeyOf(entry({ family: "combo", spectrumKey: null, name: "空转的磨盘" }))
    ).toBe("组合·空转的磨盘");
  });
});
