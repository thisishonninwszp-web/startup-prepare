import { rakutenRequest, type RakutenRequestOptions } from "../../../rakuten";
import type { MerchantInput, SnapshotInput } from "../domain";
import { publicSourceUrl } from "./shared";

export interface BusinessCandidate {
  merchant: MerchantInput; itemCode: string; itemName: string; itemUrl: string;
  price: Record<string, unknown>; reviewCount: number | null; rank: number | null; coverage: string;
}
export interface BusinessSearchInput {
  mode?: "search" | "ranking"; keyword?: string; shopCode?: string; genreId?: string;
  page?: number; period?: "realtime"; age?: "10" | "20" | "30" | "40" | "50"; sex?: "0" | "1";
  beforeRequest?: () => Promise<void>;
}
const PRICE_FIELDS = ["itemPrice", "hasPriceRange", "itemPriceBaseField", "itemPriceMin1", "itemPriceMax1", "itemPriceMin2", "itemPriceMax2", "itemPriceMin3", "itemPriceMax3"];
const STRUCTURED_FIELDS = [...PRICE_FIELDS, "itemCode", "itemName", "itemCaption", "catchcopy", "shopCode", "shopName", "itemUrl", "shopUrl", "reviewCount", "availability", "taxFlag", "postageFlag", "creditCardFlag", "giftFlag", "startTime", "endTime", "genreId"];
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("楽天材料结构无效"); return value as Record<string, unknown>; }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function count(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null; }
function candidate(value: unknown, coverage: string): BusinessCandidate {
  const row = record(value); const itemCode = text(row.itemCode); const shopCode = text(row.shopCode);
  if (!/^[a-zA-Z0-9_-]+$/.test(shopCode) || !itemCode.startsWith(`${shopCode}:`) || !itemCode.slice(shopCode.length + 1)) throw new Error("楽天店铺/商品身份不一致");
  const itemUrl = publicSourceUrl(text(row.itemUrl), "rakuten");
  if (new URL(itemUrl).hostname !== "item.rakuten.co.jp" || new URL(itemUrl).pathname.split("/")[1] !== shopCode) throw new Error("楽天商品链接与店铺身份不一致");
  const sourceUrl = publicSourceUrl(text(row.shopUrl), "rakuten");
  if (new URL(sourceUrl).hostname !== "www.rakuten.co.jp" || new URL(sourceUrl).pathname.split("/")[1] !== shopCode) throw new Error("楽天店铺链接与身份不一致");
  if (!text(row.shopName) || !text(row.itemName)) throw new Error("楽天缺少店铺或商品名称");
  return { merchant: { platform: "rakuten", platformShopId: shopCode, name: text(row.shopName), sourceUrl, identityScope: "platform_shop_id" }, itemCode, itemName: text(row.itemName), itemUrl, price: Object.fromEntries(PRICE_FIELDS.filter((key) => key in row).map((key) => [key, row[key]])), reviewCount: count(row.reviewCount), rank: count(row.rank), coverage };
}
async function request(kind: "search" | "ranking", params: Record<string, string>, options?: RakutenRequestOptions): Promise<Record<string, unknown>> {
  const result = await rakutenRequest(kind, params, options);
  if (result === "no-key") throw new Error("楽天来源不可用：未配置 API 凭据");
  const data = record(result);
  if ("error" in data) throw new Error(typeof data.error === "string" ? data.error : "楽天来源不可用");
  if (!Array.isArray(data.Items)) throw new Error("楽天来源不可用：缺少商品列表");
  return data;
}
export async function searchBusinessCandidates(input: BusinessSearchInput): Promise<{ items: BusinessCandidate[]; coverage: string; nextCursor: string | null }> {
  const mode = input.mode ?? "search"; const page = input.page ?? 1;
  if (!["search", "ranking"].includes(mode) || !Number.isInteger(page) || page < 1 || page > (mode === "ranking" ? 34 : 100)) throw new Error("查询分页或模式无效");
  const params: Record<string, string> = { page: String(page) };
  if (input.genreId) { if (!/^\d+$/.test(input.genreId)) throw new Error("分类ID无效"); params.genreId = input.genreId; }
  let coverage: string;
  if (mode === "ranking") {
    if (input.genreId && (input.age || input.sex)) throw new Error("官方榜单不能同时指定分类与年龄/性别");
    if (input.keyword || input.shopCode) throw new Error("官方榜单不支持关键词或店铺过滤");
    if (input.period && input.period !== "realtime") throw new Error("官方接口仅支持 realtime 或默认榜单周期");
    if (input.age) { if (!["10", "20", "30", "40", "50"].includes(input.age)) throw new Error("年龄榜单无效"); params.age = input.age; }
    if (input.sex) { if (!["0", "1"].includes(input.sex)) throw new Error("性别榜单无效"); params.sex = input.sex; }
    if (input.period) params.period = input.period;
    coverage = `官方榜单；period=${input.period ?? "默认（接口未声明精确时段）"}；genreId=${input.genreId ?? "未指定"}；age=${input.age ?? "未指定"}；sex=${input.sex ?? "未指定"}。排名不是销量件数或买家人群占比。`;
  } else {
    if (input.age || input.sex || input.period) throw new Error("商品搜索不支持榜单人群/周期参数");
    if (input.keyword) { if (input.keyword.length > 128) throw new Error("关键词过长"); params.keyword = input.keyword; }
    if (input.shopCode) { if (!/^[a-zA-Z0-9_-]+$/.test(input.shopCode)) throw new Error("店铺ID无效"); params.shopCode = input.shopCode; }
    if (!params.keyword && !params.shopCode && !params.genreId) throw new Error("请提供关键词、店铺ID或分类ID");
    params.sort = "-reviewCount"; params.hits = "30";
    coverage = `官方商品搜索，按评价数排序；keyword=${input.keyword ?? "未指定"}；shopCode=${input.shopCode ?? "未指定"}；genreId=${input.genreId ?? "未指定"}。评价数不是销量；不提供评价正文或下单件数。`;
  }
  const data = await request(mode, params, { beforeRequest: input.beforeRequest });
  coverage += ` page=${page}；returned=${(data.Items as unknown[]).length}。`;
  if (mode === "ranking") coverage += ` 榜单标题=${text(data.title)}；最后更新=${text(data.lastBuildDate) || "未知"}。`;
  const items = (data.Items as unknown[]).map((row) => candidate(row, coverage));
  const pageCount = count(data.pageCount);
  return { items, coverage, nextCursor: page < (pageCount ?? (mode === "ranking" && items.length === 30 ? 34 : page)) ? String(page + 1) : null };
}
export async function inspectRakutenItem(itemCode: string, options: RakutenRequestOptions & { shopCode?: string } = {}): Promise<{ merchant: MerchantInput; snapshot: SnapshotInput }> {
  if (!/^[a-zA-Z0-9_-]+:[^\s:]{1,180}$/.test(itemCode)) throw new Error("商品ID无效");
  const data = await request("search", { itemCode, hits: "1", page: "1" }, options);
  const row = (data.Items as unknown[]).find((entry) => record(entry).itemCode === itemCode);
  if (!row) throw new Error("楽天来源不可用：未找到指定商品");
  const coverage = `官方商品字段快照，itemCode=${itemCode}；page=1；returned=${(data.Items as unknown[]).length}。价格范围保留原字段。评价数不是销量；包装/下单件数、买家身份与评价正文未采集。未保存候选榜单排名或筛选范围；候选查询仅用于选择店铺。`;
  const found = candidate(row, coverage);
  if (options.shopCode && found.merchant.platformShopId !== options.shopCode) throw new Error("所选商品不属于指定店铺");
  const raw = record(row);
  const structured = Object.fromEntries(STRUCTURED_FIELDS.filter((key) => key in raw).map((key) => [key, raw[key]]));
  return { merchant: found.merchant, snapshot: { platform: "rakuten", itemId: itemCode, origin: "official_api", sourceUrl: found.itemUrl, publishedAt: null, captureScope: "api_fields", capturedText: null, quantities: found.reviewCount === null ? [] : [{ id: "review_count", metric: "review_count", raw: String(found.reviewCount), value: found.reviewCount, relation: "eq", unit: "unknown", period: { from: null, to: null, label: null }, sampleScope: `商品 ${itemCode} 的累计评价数量，时段未提供`, attribution: "platform" }], structured: { ...structured, sourceEndpoint: "IchibaItem/Search/20260701", query: { itemCode, hits: 1, page: 1 }, returnedCount: (data.Items as unknown[]).length, currency: "JPY", displayedSales: null, unitsPerOrder: null, buyerDemographics: null }, coverage } };
}

