import { describe, expect, it } from "vitest";
import { attentionPoint, attentionSeries, carryHistory, HISTORY_MAX, monthlyGrowth, monthlyPoints, parseReviewEntries, voiceCounts, type GapVoices } from "./voices-shared";

describe("这边的真人原话", () => {
  it("voiceCounts：每种几句", () => {
    expect(voiceCounts([{ kind: "complain" }, { kind: "complain" }, { kind: "workaround" }])).toEqual({ complain: 2, seek: 0, workaround: 1 });
  });

  it("parseReviewEntries：只要三星以下、够长的评论；带日子和星数；最多取 max 条", () => {
    const entry = (rating: string, title: string, content: string) => ({
      "im:rating": { label: rating },
      title: { label: title },
      content: { label: content },
      updated: { label: "2026-10-13T16:00:31-07:00" },
    });
    const feed = {
      feed: {
        entry: [
          entry("1", "とにかく遅い", "最近本当に遅い。優先にしてもめちゃくちゃ遅い。"),
          entry("5", "最高", "いつも使っています。とても便利で助かっています。"),
          entry("2", "短い", "遅い"),
          entry("3", "まあまあ", "店は多いけど配達員が見つからないことがよくある。"),
          entry("1", "三つ目", "勝手に課金されます。解約の画面がわかりにくい。"),
          { title: { label: "App 本身的信息，没有星数" } },
        ],
      },
    };
    const out = parseReviewEntries(feed, { name: "Uber Eats", url: "https://apps.apple.com/jp/app/id1" }, 2);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ rating: 1, date: "2026-10-13", url: "https://apps.apple.com/jp/app/id1" });
    expect(out[0].content).toBe("とにかく遅い。最近本当に遅い。優先にしてもめちゃくちゃ遅い。");
    expect(out[0].title).toContain("★1");
    expect(out[1].rating).toBe(3);
    // 只有一条时 RSS 给的是对象不是数组
    expect(parseReviewEntries({ feed: { entry: entry("2", "一条", "配達がいつも三十分以上遅れてくる。") } }, { name: "x", url: "u" }, 5)).toHaveLength(1);
    expect(parseReviewEntries(null, { name: "x", url: "u" }, 5)).toEqual([]);
  });
});

describe("measure history", () => {
  const voices = (at: string, reviews: number, ratings: number, history?: GapVoices["history"]): GapVoices => ({
    pain: "p",
    quotes: [],
    searched: { pages: 0, reviews: 0 },
    judged: true,
    apps: [
      { name: "a", ratings, url: "https://apps.apple.com/jp/app/id1" },
      { name: "b", ratings: 10, url: "https://apps.apple.com/jp/app/id2" },
    ],
    attention: {
      topic: "家事代行",
      wiki: { title: "t", url: "u", months: [{ month: "2026-08", views: 5 }, { month: "2026-09", views: 7 }] },
      suggest: [],
      hatena: { matched: 3, bookmarks: 9, top: [] },
      youtube: "no-key",
      rakuten: { count: 120, top: [], reviews, medianPrice: 1000 },
      checked_at: at,
    },
    ...(history ? { history } : {}),
    created_at: at,
  });

  it("keeps only totals, skipping sources without numbers", () => {
    expect(attentionPoint(voices("2026-10-01T00:00:00Z", 50, 100))).toEqual({
      at: "2026-10-01T00:00:00Z",
      wiki: 7,
      hatena: 3,
      rakutenItems: 120,
      rakutenReviews: 50,
      appRatings: 110,
    });
  });

  it("returns null when nothing was measured", () => {
    expect(attentionPoint({ created_at: "2026-10-01" })).toBeNull();
  });

  it("carries the previous point into history and caps the length", () => {
    const old = Array.from({ length: HISTORY_MAX }, (_, i) => ({ at: `2023-01-${String(i + 1).padStart(2, "0")}`, wiki: i }));
    const carried = carryHistory(voices("2026-10-01T00:00:00Z", 50, 100, old));
    expect(carried).toHaveLength(HISTORY_MAX);
    expect(carried[carried.length - 1].rakutenReviews).toBe(50);
    expect(carryHistory(null)).toEqual([]);
  });

  it("monthly points keep the last measure of each month", () => {
    const v = voices("2026-10-20T00:00:00Z", 80, 100, [
      { at: "2026-09-01T00:00:00Z", rakutenReviews: 40 },
      { at: "2026-10-02T00:00:00Z", rakutenReviews: 60 },
    ]);
    expect(monthlyPoints(attentionSeries(v), "rakutenReviews")).toEqual([
      { month: "2026-09", value: 40 },
      { month: "2026-10", value: 80 },
    ]);
  });
});

describe("monthlyGrowth", () => {
  it("is the increase over the previous point, never negative", () => {
    expect(
      monthlyGrowth([
        { month: "2026-07", value: 100 },
        { month: "2026-08", value: 130 },
        { month: "2026-09", value: 120 },
      ])
    ).toEqual([
      { month: "2026-08", value: 30 },
      { month: "2026-09", value: 0 },
    ]);
    expect(monthlyGrowth([{ month: "2026-07", value: 1 }])).toEqual([]);
  });
});
