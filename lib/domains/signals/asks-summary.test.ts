import { describe, expect, it } from "vitest";
import { asksSummaries, tokyoDate } from "./asks-summary";

describe("asksSummaries", () => {
  it("writes one sentence per source that has data, with numbers only from the data", () => {
    const out = asksSummaries({
      topic: "家事代行",
      date: "2026-10-22",
      chiebukuro: {
        found: 8,
        read: 2,
        asks: [
          { url: "u1", title: "a", date: "2024-01-01", answers: 1, views: 100, sympathy: 2 },
          { url: "u2", title: "b", date: "2026-01-01", answers: 1 },
        ],
      },
      campfire: {
        total: 18,
        seen: 18,
        projects: [
          { url: "c1", title: "家事代行アプリ", amount: 23000, backers: 4, open: false },
          { url: "c2", title: "家事代行マッチング", amount: 80000, backers: 4, open: false },
        ],
      },
      girlschannel: { total: 0, topics: [] },
      youtubeYears: "no-key",
      kokkai: [{ year: 2025, count: 0 }, { year: 2026, count: 2 }],
    });
    expect(out.map((s) => s.key)).toEqual(["chiebukuro", "campfire", "kokkai"]);
    expect(out[0].title).toContain("标题里有「家事代行」的 2 个（2024–2026 年");
    expect(out[0].title).toContain("被看了 100 次、2 人点了共感");
    expect(out[1].title).toContain("一共筹到 103,000 日元、8 人支持；最多的一个 80,000 日元、4 人");
    expect(out[1].url).toContain("camp-fire.jp/projects/search?word=");
    expect(out[2].title).toContain("2025 年 0 次、2026 年 2 次");
    expect(out.every((s) => s.title.endsWith("（2026-10-22 程序自动数的）"))).toBe(true);
  });

  it("caps the sentence at 300 characters", () => {
    const out = asksSummaries({ topic: "x", date: "2026-10-22", asked: Array.from({ length: 15 }, () => "あ".repeat(40)) });
    expect(out[0].title.length).toBeLessThanOrEqual(300);
  });

  it("returns nothing when nothing was found", () => {
    expect(asksSummaries({ topic: "x", date: "2026-10-22", chiebukuro: null, reddit: "no-key" })).toEqual([]);
  });
});

describe("tokyoDate", () => {
  it("uses the Japan day", () => {
    expect(tokyoDate("2026-10-21T16:30:00.000Z")).toBe("2026-10-22");
    expect(tokyoDate("2026-10-21T10:00:00.000Z")).toBe("2026-10-21");
  });
});
