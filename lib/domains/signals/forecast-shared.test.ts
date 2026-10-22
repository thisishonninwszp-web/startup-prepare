import { describe, expect, it } from "vitest";
import {
  brier,
  calibrationBins,
  headToHead,
  isBracketQuestion,
  medianProbability,
  parseManifoldMarket,
  parsePolymarketMarket,
  pickMarkets,
  scoreBySource,
  type Forecast,
  type MarketCandidate,
} from "./forecast-shared";

describe("market parsing", () => {
  it("reads a Manifold binary market and its resolution", () => {
    const m = parseManifoldMarket({
      id: "abc",
      question: "Will X?",
      url: "https://manifold.markets/u/x",
      closeTime: Date.parse("2026-12-31T00:00:00Z"),
      probability: 0.42,
      outcomeType: "BINARY",
      uniqueBettorCount: 20,
      isResolved: true,
      resolution: "NO",
    });
    expect(m).toMatchObject({ platform: "manifold", id: "abc", closes: "2026-12-31", probability: 0.42, depth: 20, resolved: "no" });
    expect(parseManifoldMarket({ id: "x", question: "q", outcomeType: "MULTIPLE_CHOICE" })).toBeNull();
    expect(parseManifoldMarket({ id: "x", question: "q", outcomeType: "BINARY", isResolved: true, resolution: "CANCEL" })?.resolved).toBe("void");
  });

  it("reads a Polymarket Yes/No market with string-encoded lists", () => {
    const open = parsePolymarketMarket(
      { id: "1", question: "BoJ hike?", outcomes: '["Yes", "No"]', outcomePrices: '["0.35", "0.65"]', endDate: "2026-12-19T00:00:00Z", volumeNum: 12000, closed: false },
      "boj-dec"
    );
    expect(open).toMatchObject({ platform: "polymarket", probability: 0.35, closes: "2026-12-19", depth: 12000, url: "https://polymarket.com/event/boj-dec", resolved: null });
    const done = parsePolymarketMarket({ id: "2", question: "q", outcomes: '["Yes","No"]', outcomePrices: '["0","1"]', closed: true, umaResolutionStatus: "resolved" });
    expect(done?.resolved).toBe("no");
    expect(parsePolymarketMarket({ id: "3", question: "q", outcomes: '["Trump","Harris"]', outcomePrices: '["0.5","0.5"]' })).toBeNull();
  });
});

describe("pickMarkets", () => {
  const c = (id: string, closes: string, p: number, depth: number, platform: "manifold" | "polymarket" = "manifold"): MarketCandidate => ({
    platform,
    id,
    question: id,
    url: "",
    closes,
    probability: p,
    depth,
    description: "",
  });
  it("filters by window, certainty, depth and what's already in the ledger, mixing soonest and deepest", () => {
    const list = [
      c("too-soon", "2026-10-30", 0.5, 50),
      c("too-far", "2028-06-01", 0.5, 50),
      c("certain", "2026-12-01", 0.97, 50),
      c("thin", "2026-12-01", 0.5, 3),
      c("thin-poly", "2026-12-01", 0.5, 100, "polymarket"),
      c("dup", "2026-12-01", 0.5, 50),
      c("soon", "2026-11-20", 0.4, 12),
      c("deep", "2027-06-01", 0.6, 500),
      c("mid", "2027-01-01", 0.6, 40),
    ];
    const out = pickMarkets(list, "2026-10-22", new Set(["manifold:dup"]), 2);
    expect(out.map((x) => x.id)).toEqual(["soon", "deep"]);
  });
});

describe("combining and scoring", () => {
  it("median in log-odds of three is the middle one", () => {
    expect(medianProbability([0.2, 0.9, 0.5])).toBe(0.5);
    expect(medianProbability([0.3, 0.7])).toBe(0.5);
    expect(medianProbability([])).toBeNull();
  });

  it("brier, per-source score gated by sample size, head to head and calibration bins", () => {
    expect(brier(0.8, true)).toBeCloseTo(0.04);
    const qs = Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, status: "resolved" as const, outcome: i % 2 === 0 }));
    const f = (q: number, source: Forecast["source"], p: number): Forecast => ({ question_id: `q${q}`, source, probability: p, reason: null, made_at: "" });
    const forecasts = [
      ...qs.map((_, i) => f(i, "ai", i % 2 === 0 ? 0.8 : 0.2)),
      ...qs.slice(0, 5).map((_, i) => f(i, "me", 0.5)),
    ];
    const [ai, me] = scoreBySource(qs, forecasts, ["ai", "me"]);
    expect(ai).toEqual({ source: "ai", n: 12, brier: 0.04 });
    expect(me).toEqual({ source: "me", n: 5, brier: null });
    const h = headToHead(qs, forecasts, "ai", "me");
    expect(h).toMatchObject({ n: 5, aBetter: 5, bBetter: 0, aBrier: null });
    const bins = calibrationBins(qs, forecasts, "ai");
    expect(bins[1]).toMatchObject({ n: 6, happened: 0, meanP: 0.2 });
    expect(bins[4]).toMatchObject({ n: 6, happened: 6, meanP: 0.8 });
  });
});

describe("market picking details", () => {
  it("skips bracket questions and two markets from the same event", () => {
    expect(isBracketQuestion("Will Japan Q3 GDP growth (annualized) be between 0.0% and 0.8%?")).toBe(true);
    expect(isBracketQuestion("Will the BoJ raise rates in December?")).toBe(false);
    const c = (id: string, url: string, q = id) => ({ platform: "polymarket" as const, id, question: q, url, closes: "2026-12-01", probability: 0.5, depth: 9000, description: "" });
    const out = pickMarkets([c("a", "u1"), c("b", "u1"), c("c", "u2", "Will X be between 1 and 2?"), c("d", "u3")], "2026-10-22", new Set(), 3);
    expect(out.map((x) => x.id).sort()).toEqual(["a", "d"]);
  });
});
