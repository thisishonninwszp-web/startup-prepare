import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectRakutenItem, searchBusinessCandidates } from "./rakuten";
import { buildManualMaterial } from "./manual";
const item = { itemCode: "sample-shop:101", shopCode: "sample-shop", shopName: "Example", shopUrl: "https://www.rakuten.co.jp/sample-shop/", itemUrl: "https://item.rakuten.co.jp/sample-shop/101/", itemName: "12枚入り", itemPrice: 100, hasPriceRange: 1, itemPriceMin1: 100, itemPriceMax1: 200, reviewCount: 9 };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function mockApi(data: unknown) { vi.stubEnv("RAKUTEN_APP_ID", "test-app"); vi.stubEnv("RAKUTEN_ACCESS_KEY", "test-key"); const fetcher = vi.fn(async (...args: [string, RequestInit?]) => { void args; return new Response(JSON.stringify(data)); }); vi.stubGlobal("fetch", fetcher); return fetcher; }
describe("business official sources", () => {
  it("keeps price ranges and review counts, without inferring orders or sales", async () => {
    mockApi({ Items: [item] });
    const result = await inspectRakutenItem(item.itemCode);
    expect(result.merchant.platformShopId).toBe("sample-shop");
    expect(result.snapshot.structured).toMatchObject({ itemPriceMin1: 100, itemPriceMax1: 200, hasPriceRange: 1, currency: "JPY" });
    expect(result.snapshot.quantities.map((q) => q.metric)).toEqual(["review_count"]);
    expect(result.snapshot.origin).toBe("official_api");
  });
  it("labels search as review sorting and rejects mixed cohort/genre ranking", async () => {
    const fetcher = mockApi({ Items: [item], pageCount: 2 });
    const result = await searchBusinessCandidates({ keyword: "菓子" });
    expect(result.coverage).toContain("评价数"); expect(result.nextCursor).toBe("2");
    await expect(searchBusinessCandidates({ mode: "ranking", genreId: "100", age: "20" })).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects absent or mismatched official identity", async () => {
    mockApi({ Items: [{ ...item, shopCode: "other" }] });
    await expect(inspectRakutenItem(item.itemCode)).rejects.toThrow();
  });
  it("preserves ranking scope without inventing sales quantities", async () => {
    const fetcher = mockApi({ Items: [{ ...item, rank: 2 }], title: "女性20代", lastBuildDate: "2026-10-28" });
    const result = await searchBusinessCandidates({ mode: "ranking", age: "20", sex: "1", period: "realtime" });
    expect(result.items[0].rank).toBe(2); expect(result.coverage).toContain("20");
    expect(String(fetcher.mock.calls[0][0])).toContain("20220601");
  });
});
describe("manual public excerpts", () => {
  const input = { platform: "xiaohongshu" as const, platformShopId: "provided-shop", name: "Example", sourceUrl: "https://www.xiaohongshu.com/explore/example", capturedText: "independent 买了3盒", coverage: "用户选择的一段公开评价；不含买家身份" };
  it("preserves literal quotes, marks unverified identity and manual origin", () => {
    const result = buildManualMaterial(input);
    expect(result.snapshot.capturedText).toBe(input.capturedText); expect(result.snapshot.quantities).toEqual([]);
    expect(result.snapshot.origin).toBe("manual_excerpt"); expect(result.merchant.identityScope).toBe("user_supplied_unverified");
  });
  it("rejects lookalike hosts, credentials and buyer contact data", () => {
    for (const sourceUrl of ["https://www.xiaohongshu.com.evil.test/a", "https://user:pass@www.xiaohongshu.com/a", "http://www.xiaohongshu.com/a"]) expect(() => buildManualMaterial({ ...input, sourceUrl })).toThrow();
    expect(() => buildManualMaterial({ ...input, capturedText: "联系 buyer@example.com" })).toThrow();
  });
});


it("rejects an official response that omits the selected item without substituting a candidate", async () => {
  mockApi({ Items: [item] });
  await expect(inspectRakutenItem("sample-shop:202")).rejects.toThrow("未找到指定商品");
});

it("does not interpret undocumented daily/weekly ranking periods", async () => {
  const fetcher = mockApi({ Items: [item] });
  await expect(searchBusinessCandidates({ mode: "ranking", period: "weekly" as "realtime" })).rejects.toThrow("仅支持");
  expect(fetcher).not.toHaveBeenCalled();
});

it("fails visibly on official errors and does not turn missing items into success", async () => {
  mockApi({ error: "forbidden", error_description: "test-key" });
  await expect(searchBusinessCandidates({ keyword: "菓子" })).rejects.toThrow("接口返回错误");
  mockApi({ unknown: [] });
  await expect(searchBusinessCandidates({ keyword: "菓子" })).rejects.toThrow("缺少商品列表");
});


it("binds manual Rakuten identity to the shop encoded in its public URL", () => {
  const manual = { platform: "rakuten" as const, platformShopId: "real-shop", name: "Example", sourceUrl: "https://item.rakuten.co.jp/real-shop/item-1/", capturedText: "每包12枚", coverage: "公开商品页面的一段包装说明" };
  expect(buildManualMaterial(manual).merchant.platformShopId).toBe("real-shop");
  for (const platformShopId of ["shop-a", "shop-b"]) expect(() => buildManualMaterial({ ...manual, platformShopId })).toThrow("店铺ID与来源链接不一致");
  expect(() => buildManualMaterial({ ...manual, sourceUrl: "https://www.rakuten.co.jp/other-shop/" })).toThrow("店铺ID与来源链接不一致");
  for (const sourceUrl of ["https://www.rakuten.co.jp/", "https://review.rakuten.co.jp/item/1/", "https://www.rakuten.co.jp/category/"]) expect(() => buildManualMaterial({ ...manual, sourceUrl })).toThrow("店铺身份");
});

it("includes actual page, returned count and available update in candidate scopes", async () => {
  mockApi({ Items: [{ ...item, rank: 31 }], title: "分類榜", lastBuildDate: "2026-10-28" });
  const ranking = await searchBusinessCandidates({ mode: "ranking", page: 2, genreId: "100" });
  expect(ranking.coverage).toContain("page=2"); expect(ranking.coverage).toContain("returned=1"); expect(ranking.coverage).toContain("2026-10-28");
  expect(ranking.items[0].coverage).toBe(ranking.coverage);
  mockApi({ Items: [item], pageCount: 3 });
  const search = await searchBusinessCandidates({ keyword: "菓子", page: 2 });
  expect(search.coverage).toContain("page=2"); expect(search.coverage).toContain("returned=1"); expect(search.coverage).toContain("评价数不是销量");
});

it("identifies saved item inspection as item fields and excludes ranking evidence", async () => {
  mockApi({ Items: [{ ...item, rank: 31 }] });
  const inspected = await inspectRakutenItem(item.itemCode);
  expect(inspected.snapshot.coverage).toContain("未保存候选榜单排名或筛选范围");
  expect(inspected.snapshot.structured).toMatchObject({ sourceEndpoint: "IchibaItem/Search/20260701", query: { itemCode: item.itemCode, hits: 1, page: 1 }, returnedCount: 1 });
  expect(inspected.snapshot.structured).not.toHaveProperty("rank");
});
