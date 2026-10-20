import { describe, expect, it } from "vitest";
import { isPlaceSuggestion, parseHatenaRss, parsePageviews, parseSuggest, parseYoutube, pickWikiTitle, wikiYears } from "./attention-shared";

describe("有多少人在关注", () => {
  it("pickWikiTitle：先要包含整个词的；不退成更宽的词条；对不上不拿别的充数", () => {
    const json = { query: { search: [{ title: "家事" }, { title: "家事代行サービス" }, { title: "家政婦" }] } };
    expect(pickWikiTitle(json, "家事代行")).toBe("家事代行サービス");
    expect(pickWikiTitle({ query: { search: [{ title: "家事" }] } }, "家事代行")).toBeNull();
    expect(pickWikiTitle({ query: { search: [{ title: "フードデリバリー" }] } }, "フードデリバリーサービス")).toBe("フードデリバリー");
    expect(pickWikiTitle({ query: { search: [{ title: "宅配便" }] } }, "置き配")).toBeNull();
  });

  it("parsePageviews / wikiYears：每月几次，最近 12 个月和再往前 12 个月各几次", () => {
    const items = Array.from({ length: 24 }, (_, i) => ({ timestamp: `${2024 + Math.floor(i / 12)}${String((i % 12) + 1).padStart(2, "0")}0100`, views: i < 12 ? 100 : 50 }));
    const months = parsePageviews({ items });
    expect(months[0]).toEqual({ month: "2024-01", views: 100 });
    expect(wikiYears(months)).toEqual({ last: 600, prev: 1200 });
    expect(wikiYears(months.slice(-6)).prev).toBeNull();
  });

  it("parseSuggest：去掉词本身和地名，去重", () => {
    const json = ["家事代行 ", ["家事代行 浜松", "家事代行 料金", "家事代行 静岡市", "家事代行 世田谷区", "家事代行 口コミ", "家事代行 料金", "家事代行 東京 安い"]];
    expect(parseSuggest(json, "家事代行")).toEqual(["料金", "口コミ"]);
    expect(isPlaceSuggestion("大阪府 相場")).toBe(true);
    expect(isPlaceSuggestion("比較")).toBe(false);
  });

  it("parseHatenaRss：只留标题里有这个词的，数篇数和收藏数，列最多的三篇", () => {
    const item = (title: string, users: number) =>
      `<item rdf:about="x"><title>${title}</title><link>https://example.jp/${users}</link><dc:date>2024-01-02T00:00:00Z</dc:date><hatena:bookmarkcount>${users}</hatena:bookmarkcount></item>`;
    const xml = item("男は結婚するな", 900) + item("家事代行のお姉さんがすごかった", 600) + item("&#x5BB6;&#x4E8B;&#x4EE3;&#x884C;を頼んでみた", 120);
    const h = parseHatenaRss(xml, "家事代行");
    expect(h?.matched).toBe(2);
    expect(h?.bookmarks).toBe(720);
    expect(h?.top.map((t) => t.users)).toEqual([600, 120]);
  });

  it("parseYoutube：估算总数 + 播放最多的三条", () => {
    const y = parseYoutube(
      { pageInfo: { totalResults: 12000 }, items: [] },
      { items: [1, 2, 3, 4].map((i) => ({ id: `v${i}`, snippet: { title: `t${i}`, publishedAt: "2025-01-01T00:00:00Z" }, statistics: { viewCount: String(i * 10) } })) }
    );
    expect(y?.total).toBe(12000);
    expect(y?.videos.map((v) => v.views)).toEqual([40, 30, 20]);
    expect(parseYoutube(null, null)).toBeNull();
  });
});
