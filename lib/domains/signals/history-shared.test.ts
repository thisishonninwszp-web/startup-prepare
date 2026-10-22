import { describe, expect, it } from "vitest";
import {
  chooseAsOf,
  cleanSearchQuery,
  gdeltWindow,
  historyEligible,
  historyPriority,
  isExcludedTopic,
  parseGdelt,
  parseManifoldResolved,
  parsePolymarketResolved,
  probAt,
} from "./history-shared";

describe("从预测市场取已经结算的题", () => {
  it("Manifold：只要结算成会 / 不会的二选一题", () => {
    const base = { outcomeType: "BINARY", id: "m1", question: "Starmer out before July?", createdTime: Date.parse("2026-02-14T00:00:00Z"), resolutionTime: Date.parse("2026-06-22T00:00:00Z"), uniqueBettorCount: 699 };
    expect(parseManifoldResolved({ ...base, resolution: "YES" })).toMatchObject({ platform: "manifold", createdOn: "2026-02-14", resolveOn: "2026-06-22", outcome: true, depth: 699 });
    expect(parseManifoldResolved({ ...base, resolution: "CANCEL" })).toBeNull();
    expect(parseManifoldResolved({ ...base, outcomeType: "MULTIPLE_CHOICE", resolution: "YES" })).toBeNull();
  });

  it("Polymarket：结算了的 Yes/No，带「会」那边的代号", () => {
    const m = {
      id: "601697",
      question: "Fed decreases interest rates by 50+ bps after January 2026 meeting?",
      startDate: "2025-09-17T19:03:50Z",
      closedTime: "2026-01-28 22:53:04+00",
      umaResolutionStatus: "resolved",
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0", "1"]',
      clobTokenIds: '["111", "222"]',
      volumeNum: 235065166,
      events: [{ slug: "fed-decision-in-january" }],
    };
    expect(parsePolymarketResolved(m)).toMatchObject({ token: "111", outcome: false, createdOn: "2025-09-17", resolveOn: "2026-01-28", url: "https://polymarket.com/event/fed-decision-in-january" });
    expect(parsePolymarketResolved({ ...m, umaResolutionStatus: "proposed" })).toBeNull();
  });
});

describe("哪些题能进题库", () => {
  const c = { platform: "polymarket" as const, marketId: "1", url: "", token: "t", title: "Will the Bank of Japan raise rates in July 2025?", description: "", createdOn: "2025-05-01", resolveOn: "2025-07-31", outcome: false, depth: 100_000 };

  it("AI 不知道答案（2025 年 3 月以后开）、已经结算、够多人押", () => {
    expect(historyEligible(c, "2026-10-22")).toBe(true);
    expect(historyEligible({ ...c, createdOn: "2025-01-10" }, "2026-10-22")).toBe(false);
    expect(historyEligible({ ...c, resolveOn: "2026-10-22" }, "2026-10-22")).toBe(false);
    expect(historyEligible({ ...c, depth: 5000 }, "2026-10-22")).toBe(false);
    expect(historyEligible({ ...c, title: "Will Real Madrid win the Champions League?" }, "2026-10-22")).toBe(false);
  });

  it("体育、加密货币价格、「会不会说某个词」不收", () => {
    expect(isExcludedTopic("Bitcoin above $100k on June 30?")).toBe(true);
    expect(isExcludedTopic("Will Trump say 'tariff' during the speech?")).toBe(true);
    expect(isExcludedTopic("Will Japan's upper house election be held in July?")).toBe(false);
  });

  it("跟日本、中国、经济有关的先做", () => {
    expect(historyPriority("Will the Bank of Japan raise interest rates?")).toBeGreaterThan(historyPriority("Will Starmer resign?"));
  });

  it("「今天」选在开盘后寿命的四分之一，离结算至少 7 天；寿命不到两周的不收", () => {
    expect(chooseAsOf("2025-05-01", "2025-07-31")).toBe("2025-05-24");
    expect(chooseAsOf("2025-05-01", "2025-05-10")).toBeNull();
  });
});

describe("那天的价格和新闻", () => {
  it("取那天以前的最后一个价", () => {
    const t = (d: string) => Date.parse(`${d}T12:00:00Z`) / 1000;
    expect(probAt([{ t: t("2025-05-20"), p: 0.3 }, { t: t("2025-05-23"), p: 0.4 }, { t: t("2025-05-24"), p: 0.9 }], "2025-05-24")).toBe(0.4);
    expect(probAt([{ t: t("2025-05-25"), p: 0.4 }], "2025-05-24")).toBeNull();
  });

  it("新闻只留那天以前的、英日中文的，去重", () => {
    const json = {
      articles: [
        { title: "BOJ holds rates", seendate: "20250603T010000Z", language: "English", url: "u1", domain: "a.com" },
        { title: "BOJ holds rates", seendate: "20250604T010000Z", language: "English", url: "u2", domain: "b.com" },
        { title: "日銀、利上げ見送り", seendate: "20250605T010000Z", language: "Japanese", url: "u3", domain: "c.jp" },
        { title: "Banque du Japon", seendate: "20250605T010000Z", language: "French", url: "u4", domain: "d.fr" },
        { title: "After the fact", seendate: "20250610T010000Z", language: "English", url: "u5", domain: "e.com" },
      ],
    };
    expect(parseGdelt(json, "2025-06-10").map((n) => n.url)).toEqual(["u1", "u3"]);
    expect(gdeltWindow("2025-06-10")).toEqual({ start: "20250511000000", end: "20250610000000" });
  });

  it("检索词只许英文字母这类字符", () => {
    expect(cleanSearchQuery('"Bank of Japan" rate hike')).toBe('"Bank of Japan" rate hike');
    expect(cleanSearchQuery("日銀")).toBeNull();
    expect(cleanSearchQuery("AI")).toBeNull();
  });
});
