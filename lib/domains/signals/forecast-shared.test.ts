import { describe, expect, it } from "vitest";
import {
  boardSections,
  brier,
  calibrationBins,
  headToHead,
  isBracketQuestion,
  medianProbability,
  parseManifoldMarket,
  parsePolymarketMarket,
  pickMarkets,
  scoreBySource,
  shownAi,
  sidesOf,
  tiersBeside,
  tokyoWeekStart,
  withMyModes,
  blindQuestionIds,
  type Forecast,
  type ForecastQuestion,
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

describe("boardSections", () => {
  const q = (id: string, over: Partial<ForecastQuestion> = {}): ForecastQuestion => ({
    id,
    kind: "market",
    title: id,
    original_title: null,
    criteria: "",
    resolve_on: "2026-12-31",
    category: null,
    source: {},
    context: null,
    status: "open",
    outcome: null,
    resolved_at: null,
    resolution_note: null,
    resolution_url: null,
    pending: null,
    revealed_at: null,
    created_at: "2026-10-01T00:00:00Z",
    ...over,
  });
  const me = (question_id: string, probability = 0.7): Forecast => ({ question_id, source: "me", probability, reason: null, made_at: "2026-10-02" });
  const pending = { suggested: "yes" as const, note: "", evidence: [], checked_on: "2026-10-20" };
  const questions = [
    q("new"),
    q("judged"),
    q("peeked", { revealed_at: "2026-10-03" }),
    q("expired", { resolve_on: "2026-10-22" }),
    q("biz", { kind: "business", pending }),
    q("won", { status: "resolved", outcome: true, resolved_at: "2026-10-20T03:00:00Z" }),
    q("old", { status: "resolved", outcome: false, resolved_at: "2026-09-01T03:00:00Z" }),
    q("skipped", { status: "resolved", outcome: true, resolved_at: "2026-10-21T03:00:00Z" }),
  ];
  const ai = (question_id: string, probability = 0.4): Forecast => ({ question_id, source: "ai", probability, reason: null, made_at: "" });
  // 都是同一时刻进的：那一周的先判题是 id 最小的 biz；new 由 AI 判过，才进「等你判断」
  const forecasts = [me("judged"), me("biz"), me("won"), me("old"), ai("won"), ai("new")];

  it("主账号：等判断、等确认、判断过的、刚对完账的", () => {
    const s = boardSections({ questions, forecasts, canConfirm: true }, "2026-10-22");
    expect(s.toForecast.map((x) => x.id)).toEqual(["new"]);
    expect(s.toConfirm.map((x) => x.id)).toEqual(["biz"]);
    expect(s.open.map((x) => x.id)).toEqual(["judged", "peeked"]);
    expect(s.done.map((x) => x.id)).toEqual(["skipped", "won", "old"]);
    // 没判断也没看答案的不算「刚对完账」给他看
    expect(s.justResolved.map((x) => x.id)).toEqual(["won"]);
  });

  it("朋友的账号：生意题不在等确认里，在判断过的里", () => {
    const s = boardSections({ questions, forecasts, canConfirm: false }, "2026-10-22");
    expect(s.toConfirm).toEqual([]);
    expect(s.open.map((x) => x.id)).toEqual(["judged", "peeked", "biz"]);
  });

  it("各方的几成", () => {
    expect(sidesOf(forecasts, "won")).toEqual({ me: 0.7, ai: 0.4, market: null });
  });

  it("不是先判题的，AI 判过才进「等你判断」；先判题不用等 AI", () => {
    const qs = [q("first", { created_at: "2026-10-19T16:00:00Z" }), q("later", { created_at: "2026-10-20T01:00:00Z" }), q("judgedByAi", { created_at: "2026-10-20T02:00:00Z" })];
    const s = boardSections({ questions: qs, forecasts: [ai("judgedByAi")], canConfirm: true }, "2026-10-22");
    expect(s.toForecast.map((x) => x.id)).toEqual(["first", "judgedByAi"]);
    expect(Array.from(s.blind)).toEqual(["first"]);
  });
});

describe("先判题和来路", () => {
  const q = (id: string, created_at: string) => ({ id, created_at });

  it("东京时间的周一 0 点", () => {
    // 2026-10-25 是周日；东京 10-26（周一）00:30 = UTC 10-25 15:30
    expect(tokyoWeekStart("2026-10-25T15:30:00Z")).toBe("2026-10-25T15:00:00.000Z");
    expect(tokyoWeekStart("2026-10-25T14:59:00Z")).toBe("2026-10-18T15:00:00.000Z");
    expect(tokyoWeekStart("2026-10-22T03:00:00.123456+00:00")).toBe("2026-10-18T15:00:00.000Z");
  });

  it("每周最早进账本的那道是先判题，同时进的按 id", () => {
    const ids = blindQuestionIds([
      q("b", "2026-10-20T01:00:00Z"),
      q("a", "2026-10-20T01:00:00Z"),
      q("c", "2026-10-21T01:00:00Z"),
      q("d", "2026-10-27T01:00:00Z"),
    ]);
    expect(Array.from(ids).sort()).toEqual(["a", "d"]);
  });

  it("卡片上显示的 AI 数：有校准用校准后的，取两位", () => {
    expect(shownAi(0.333, null)).toBe(0.33);
    expect(shownAi(0.9, { a: 0.5, b: 0 })).toBeLessThan(0.9);
  });

  it("不行时只给那一边的档", () => {
    expect(tiersBeside(0.3, "higher")).toEqual([0.5, 0.7, 0.85, 0.95]);
    expect(tiersBeside(0.3, "lower")).toEqual([0.05, 0.15]);
    expect(tiersBeside(0.95, "higher")).toEqual([]);
  });

  it("记分时「你」只留某几种来路，别的方原样留", () => {
    const f = (source: Forecast["source"], mode?: Forecast["mode"]): Forecast => ({ question_id: "x", source, probability: 0.5, reason: null, made_at: "", mode });
    const all = [f("me", "agree"), f("ai"), f("market")];
    expect(withMyModes(all, ["blind", "override"]).map((x) => x.source)).toEqual(["ai", "market"]);
    // 迁移前的（没有 mode）算先判
    expect(withMyModes([f("me", null)], ["blind"])).toHaveLength(1);
  });
});
