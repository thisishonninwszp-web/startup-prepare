import { describe, expect, it } from "vitest";
import { isPlaceSuggestion, kakeiFilters, kakeiItemNames, parseEstatMeta, parseHatenaRss, parsePageviews, parseRakuten, parseSuggest, parseYoutube, pickWikiTitle, wikiYears } from "./attention-shared";

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

describe("楽天市场", () => {
  it("parseRakuten：两种格式都认；评价最多的三件、评价总数、价格中位数", () => {
    const item = (i: number) => ({ itemName: `商品${i}`, itemUrl: `https://item.rakuten.co.jp/${i}`, itemPrice: i * 1000, reviewCount: i * 10, shopName: "店" });
    const v2 = parseRakuten({ count: 1234, Items: [1, 2, 3, 4].map(item) });
    expect(v2?.count).toBe(1234);
    expect(v2?.top.map((t) => t.reviews)).toEqual([40, 30, 20]);
    expect(v2?.reviews).toBe(100);
    expect(v2?.medianPrice).toBe(3000);
    const v1 = parseRakuten({ count: 2, Items: [{ Item: item(1) }, { Item: item(2) }] });
    expect(v1?.top.map((t) => t.name)).toEqual(["商品2", "商品1"]);
    expect(parseRakuten({ error: "wrong_parameter" })).toBeNull();
  });
});

describe("家计调查", () => {
  const meta = {
    GET_META_INFO: {
      METADATA_INF: {
        CLASS_INF: {
          CLASS_OBJ: [
            { "@id": "tab", CLASS: [{ "@code": "01", "@name": "金額" }] },
            { "@id": "cat01", CLASS: [{ "@code": "001", "@name": "消費支出", "@level": "1" }, { "@code": "450", "@name": "10.1.3 家事サービス", "@level": "4" }, { "@code": "451", "@name": "家事代行料", "@level": "5" }] },
            { "@id": "cat02", CLASS: [{ "@code": "04", "@name": "総世帯" }, { "@code": "03", "@name": "二人以上の世帯" }] },
            { "@id": "area", CLASS: [{ "@code": "00000", "@name": "全国" }, { "@code": "01100", "@name": "札幌市" }] },
            { "@id": "time", CLASS: [{ "@code": "2026000909", "@name": "2026年9月" }] },
          ],
        },
      },
    },
  };
  it("parseEstatMeta / kakeiItemNames：品目去掉编号前缀；kakeiFilters：全国、二人以上的世帯、金额，时间和品目不筛", () => {
    const classes = parseEstatMeta(meta);
    expect(kakeiItemNames(classes)).toEqual([
      { code: "001", name: "消費支出" },
      { code: "450", name: "家事サービス" },
      { code: "451", name: "家事代行料" },
    ]);
    expect(kakeiFilters(classes)).toEqual({ cdTab: "01", cdCat02: "03", cdArea: "00000" });
    expect(parseEstatMeta(null)).toEqual([]);
  });
});

