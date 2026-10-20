import { describe, expect, it } from "vitest";
import { trendsEmbedUrl, trendsExploreUrl, trendsWords } from "./trends";

describe("trends", () => {
  it("trims, dedupes and caps at five words", () => {
    expect(trendsWords([" 家事代行 ", "家事代行", "", "a", "b", "c", "d", "e"])).toEqual(["家事代行", "a", "b", "c", "d"]);
  });

  it("builds an embed address with one comparison item per word in Japan", () => {
    const url = new URL(trendsEmbedUrl(["家事代行", "家事 外注"]));
    expect(url.hostname).toBe("trends.google.com");
    expect(url.pathname).toBe("/trends/embed/explore/TIMESERIES");
    const req = JSON.parse(url.searchParams.get("req") as string);
    expect(req.comparisonItem).toEqual([
      { keyword: "家事代行", geo: "JP", time: "today 5-y" },
      { keyword: "家事 外注", geo: "JP", time: "today 5-y" },
    ]);
  });

  it("explore link joins words with commas", () => {
    expect(new URL(trendsExploreUrl(["a", "b"])).searchParams.get("q")).toBe("a,b");
  });
});
