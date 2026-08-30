import { describe, expect, it } from "vitest";
import {
  computeIntensity,
  contextCount,
  evaluateTier,
  promotionGate,
  type SelfPrediction,
  type SelfWindow,
} from "./tiers";

const TODAY = "2026-08-30";

function win(over: Partial<SelfWindow> = {}): SelfWindow {
  return {
    occurred_on: "2026-08-01",
    context_key: "公司内部项目",
    outcome: "hit",
    grade: "E1",
    ...over,
  };
}

function pred(over: Partial<SelfPrediction> = {}): SelfPrediction {
  return {
    due_at: "2026-08-10T00:00:00Z",
    outcome: "hit",
    resolved_at: "2026-08-10T00:00:00Z",
    ...over,
  };
}

describe("computeIntensity", () => {
  it("hides the rate until there are enough windows", () => {
    const result = computeIntensity([win(), win({ outcome: "miss" })]);
    expect(result.total).toBe(2);
    expect(result.hits).toBe(1);
    expect(result.rate).toBeNull();
    expect(result.displayable).toBe(false);
  });

  it("counts misses in the denominator", () => {
    const windows = [
      win(),
      win(),
      win(),
      win({ outcome: "miss" }),
      win({ outcome: "miss" }),
    ];
    expect(computeIntensity(windows)).toMatchObject({
      hits: 3,
      total: 5,
      rate: 60,
      displayable: true,
    });
  });

  it("reports an empty ledger without dividing by zero", () => {
    expect(computeIntensity([])).toMatchObject({
      hits: 0,
      total: 0,
      rate: null,
    });
  });
});

describe("contextCount", () => {
  it("counts distinct contexts of confirming windows only", () => {
    const windows = [
      win({ context_key: "对上级" }),
      win({ context_key: "对上级" }),
      win({ context_key: "自学" }),
      win({ context_key: "客户接触", outcome: "miss" }),
    ];
    expect(contextCount(windows)).toBe(2);
  });
});

describe("promotionGate", () => {
  const fiveWindows = [win(), win(), win(), win(), win()];

  it("requires three contexts and two strong pieces for a trait", () => {
    const gate = promotionGate("trait", "working", fiveWindows);
    expect(gate.ok).toBe(false);
    expect(gate.missing.join(" ")).toContain("≥3 类情境");
    expect(gate.missing.join(" ")).toContain("≥2 条 E3");
  });

  it("passes a trait backed by three contexts and strong evidence", () => {
    const gate = promotionGate("trait", "working", [
      win({ context_key: "对上级", grade: "E3" }),
      win({ context_key: "公司内部项目", grade: "E4" }),
      win({ context_key: "自学" }),
      win({ context_key: "自学" }),
      win({ context_key: "对上级" }),
    ]);
    expect(gate).toEqual({ ok: true, missing: [] });
  });

  it("never lets a motivation become load bearing", () => {
    const gate = promotionGate("motivation", "load_bearing", fiveWindows);
    expect(gate.ok).toBe(false);
    expect(gate.missing.join(" ")).toContain("动机类假设不可承重");
  });

  it("keeps state hypotheses out of the ladder entirely", () => {
    expect(promotionGate("state", "working", fiveWindows).ok).toBe(false);
  });

  it("demands a paid cost before calling something a value", () => {
    expect(promotionGate("value", "working", fiveWindows).ok).toBe(false);
    const withCost = [...fiveWindows.slice(1), win({ cost_paid: "推掉了那个 offer" })];
    expect(promotionGate("value", "working", withCost).ok).toBe(true);
  });
});

describe("evaluateTier", () => {
  const fiveWindows = [win(), win(), win(), win(), win()];

  it("refuses to promote on supporting evidence alone", () => {
    const result = evaluateTier({
      kind: "context_behavior",
      currentTier: "hunch",
      windows: [...fiveWindows, ...fiveWindows],
      predictions: [],
      today: TODAY,
    });
    expect(result.changed).toBe(false);
    expect(result.reasons[0]).toContain("事前预测");
  });

  it("promotes one step when a forecast lands and the gate is clear", () => {
    const result = evaluateTier({
      kind: "context_behavior",
      currentTier: "hunch",
      windows: fiveWindows,
      predictions: [pred()],
      today: TODAY,
    });
    expect(result).toMatchObject({ tier: "working", changed: true });
  });

  it("needs a second landed forecast before becoming load bearing", () => {
    const oneHit = evaluateTier({
      kind: "context_behavior",
      currentTier: "working",
      windows: fiveWindows,
      predictions: [pred()],
      today: TODAY,
    });
    expect(oneHit.changed).toBe(false);

    const twoHits = evaluateTier({
      kind: "context_behavior",
      currentTier: "working",
      windows: fiveWindows,
      predictions: [pred(), pred({ resolved_at: "2026-08-20T00:00:00Z" })],
      today: TODAY,
    });
    expect(twoHits).toMatchObject({ tier: "load_bearing", changed: true });
  });

  it("drops to hunch after two consecutive misses, even with earlier hits", () => {
    const result = evaluateTier({
      kind: "context_behavior",
      currentTier: "load_bearing",
      windows: fiveWindows,
      predictions: [
        pred({ resolved_at: "2026-06-01T00:00:00Z" }),
        pred({ resolved_at: "2026-06-10T00:00:00Z" }),
        pred({ outcome: "miss", resolved_at: "2026-07-01T00:00:00Z" }),
        pred({ outcome: "miss", resolved_at: "2026-08-01T00:00:00Z" }),
      ],
      today: TODAY,
    });
    expect(result.tier).toBe("hunch");
    expect(result.reasons[0]).toContain("替代解释");
  });

  it("ignores pending forecasts when judging consecutive misses", () => {
    const result = evaluateTier({
      kind: "context_behavior",
      currentTier: "working",
      windows: fiveWindows,
      predictions: [
        pred({ outcome: "miss", resolved_at: "2026-07-01T00:00:00Z" }),
        pred({ outcome: "pending", resolved_at: null }),
        pred({ outcome: "miss", resolved_at: "2026-08-01T00:00:00Z" }),
      ],
      today: TODAY,
    });
    expect(result.tier).toBe("hunch");
  });

  it("archives a hypothesis that has gone a year without evidence", () => {
    const result = evaluateTier({
      kind: "context_behavior",
      currentTier: "working",
      windows: [win({ occurred_on: "2025-01-01" })],
      predictions: [],
      today: TODAY,
    });
    expect(result).toMatchObject({ tier: "archived", changed: true });
  });

  it("leaves refuted hypotheses alone so the record survives", () => {
    const result = evaluateTier({
      kind: "trait",
      currentTier: "refuted",
      windows: fiveWindows,
      predictions: [pred(), pred()],
      today: TODAY,
    });
    expect(result).toMatchObject({ tier: "refuted", changed: false });
  });

  it("is a pure function of evidence — re-running never drifts", () => {
    const input = {
      kind: "context_behavior" as const,
      currentTier: "working" as const,
      windows: fiveWindows,
      predictions: [pred()],
      today: TODAY,
    };
    const first = evaluateTier(input);
    const second = evaluateTier({ ...input, currentTier: first.tier });
    expect(second.tier).toBe(first.tier);
  });
});
