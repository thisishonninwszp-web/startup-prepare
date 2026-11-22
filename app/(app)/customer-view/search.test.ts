import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("@/lib/web-search", () => ({ webSearch: m.search }));

import { findMarketCandidates, MAX_CANDIDATES_PER_MARKET } from "./search";

const CHIEBUKURO = {
  domains: ["detail.chiebukuro.yahoo.co.jp", "girlschannel.net"],
};

function hit(n: string | number, title: string, content = "本文です。") {
  return { url: `https://detail.chiebukuro.yahoo.co.jp/q${n}`, title, content };
}

const plan = {
  topic: "クリーニング",
  queries: ["クリーニング 受け取り 忘れる", "クリーニング 間に合わない"],
};

beforeEach(() => {
  m.search.mockReset();
  m.search.mockResolvedValue([]);
});

describe("findMarketCandidates", () => {
  it("keeps only pages whose title or opening mentions the topic", async () => {
    m.search
      .mockResolvedValueOnce([
        hit(1, "クリーニングの受け取りを忘れました"),
        hit(2, "ヨドバシの店頭受け取りは何時まで？"),
        hit(3, "受け取りが遅れたら", "クリーニング屋さんに預けたまま3週間たちました。"),
      ])
      .mockResolvedValueOnce([hit(4, "クリーニングに出した服が間に合わない")]);

    const rows = await findMarketCandidates("jp", plan, "ignored");

    expect(m.search).toHaveBeenCalledWith("クリーニング 受け取り 忘れる", 8, CHIEBUKURO);
    expect(m.search).toHaveBeenCalledWith("クリーニング 間に合わない", 8, CHIEBUKURO);
    expect(rows.map((row) => row.url)).toEqual([
      "https://detail.chiebukuro.yahoo.co.jp/q1",
      "https://detail.chiebukuro.yahoo.co.jp/q4",
      "https://detail.chiebukuro.yahoo.co.jp/q3",
    ]);
  });

  it("takes the queries' results in turn, skips repeats, and stops at the cap", async () => {
    const many = (prefix: string) =>
      Array.from({ length: 8 }, (_, i) => hit(`${prefix}${i}`, `クリーニング ${prefix}${i}`));
    m.search
      .mockResolvedValueOnce([hit("shared", "クリーニング 共通"), ...many("a")])
      .mockResolvedValueOnce([hit("shared", "クリーニング 共通"), ...many("b")]);

    const rows = await findMarketCandidates("jp", plan, "ignored");

    expect(rows).toHaveLength(MAX_CANDIDATES_PER_MARKET);
    expect(rows.slice(0, 4).map((row) => row.url.split("/q")[1])).toEqual([
      "shared",
      "a0",
      "b0",
      "a1",
    ]);
  });

  it("tops up with a plain search when fewer than three pages are left", async () => {
    m.search
      .mockResolvedValueOnce([hit(1, "クリーニングの受け取りを忘れました")])
      .mockResolvedValueOnce([hit(2, "関係ない話")])
      .mockResolvedValueOnce([
        { url: "https://lenet.example/", title: "宅配クリーニング", content: "24時間受付" },
        hit(1, "クリーニングの受け取りを忘れました"),
      ]);

    const rows = await findMarketCandidates("jp", plan, "ignored");

    expect(m.search).toHaveBeenLastCalledWith("クリーニング 受け取り 忘れる", 8);
    expect(rows.map((row) => row.url)).toEqual([
      "https://detail.chiebukuro.yahoo.co.jp/q1",
      "https://lenet.example/",
    ]);
  });

  it("carries on when one query fails, but reports when all of them do", async () => {
    m.search
      .mockRejectedValueOnce(new Error("Tavily 搜索失败"))
      .mockResolvedValueOnce([
        hit(1, "クリーニング 1"),
        hit(2, "クリーニング 2"),
        hit(3, "クリーニング 3"),
      ]);
    await expect(findMarketCandidates("jp", plan, "ignored")).resolves.toHaveLength(3);

    m.search.mockRejectedValue(new Error("Tavily 搜索失败"));
    await expect(findMarketCandidates("jp", plan, "ignored")).rejects.toThrow("Tavily");
  });

  it("without a plan, searches the translated sentence and does not filter", async () => {
    m.search.mockResolvedValueOnce([hit(1, "a"), hit(2, "b"), hit(3, "c")]);

    const rows = await findMarketCandidates("jp", undefined, "多忙な会社員 クリーニング");

    expect(m.search).toHaveBeenCalledTimes(1);
    expect(m.search).toHaveBeenCalledWith("多忙な会社員 クリーニング", 8, CHIEBUKURO);
    expect(rows).toHaveLength(3);
  });

  it("adds experience words for English, which has no forum programs may read", async () => {
    await findMarketCandidates(
      "en",
      { topic: "dentist Japan", queries: ["dentist Japan cost", "dentist Japan English"] },
      "ignored"
    );

    expect(m.search).toHaveBeenCalledWith("dentist Japan cost my experience forum", 8, {});
  });
});
