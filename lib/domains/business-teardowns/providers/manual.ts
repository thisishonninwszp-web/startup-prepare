import type { MerchantInput, Platform, SnapshotInput } from "../domain";
import { boundedText, publicSourceUrl } from "./shared";

export interface ManualMaterialInput {
  platform: Platform; platformShopId: string; name: string; sourceUrl: string;
  capturedText: string; coverage: string; publishedAt?: string | null;
}
/** User-selected public excerpt only. Buyer identities must be removed before submission. */
export function buildManualMaterial(input: ManualMaterialInput, options?: {allowEmptyExcerpt:boolean}): { merchant: MerchantInput; snapshot: SnapshotInput } {
  if (!["rakuten", "xiaohongshu"].includes(input.platform)) throw new Error("不支持的平台");
  const sourceUrl = publicSourceUrl(input.sourceUrl, input.platform);
  const platformShopId = boundedText(input.platformShopId, 180, "用户提供的店铺ID").trim();
  let merchantUrl = sourceUrl;
  let identityScope: MerchantInput["identityScope"] = "user_supplied_unverified";
  let identityNotice = "店铺ID由用户提供，尚未通过官方接口确认；同一小红书店铺可能被不同人工ID重复登记";
  if (input.platform === "rakuten") {
    const url = new URL(sourceUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    const shopCode = segments[0] ?? "";
    const genericPaths = new Set(["category", "event", "search", "info", "ranking", "review", "help", "sitemap", "ichiba", "rms"]);
    if (!["item.rakuten.co.jp", "www.rakuten.co.jp"].includes(url.hostname) || !/^[a-zA-Z0-9_-]+$/.test(shopCode) || genericPaths.has(shopCode) || (url.hostname === "item.rakuten.co.jp" && segments.length < 2)) throw new Error("来源链接不能建立明确的楽天店铺身份，请提供店铺或商品链接");
    if (shopCode !== platformShopId) throw new Error("店铺ID与来源链接不一致");
    merchantUrl = `https://www.rakuten.co.jp/${shopCode}/`;
    identityScope = "platform_shop_id";
    identityNotice = "店铺ID取自公开楽天链接的店铺路径；摘录由用户提供，未通过官方接口核验正文";
  }
  const text = options?.allowEmptyExcerpt && input.capturedText === '' ? '' : boundedText(input.capturedText, 12000, "公开摘录");
  if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text) || /(?:\+?\d[\d ()-]{8,}\d)/.test(text)) throw new Error("请先移除买家联系方式和身份信息");
  const publishedAt = input.publishedAt ?? null;
  if (publishedAt !== null && !Number.isFinite(Date.parse(publishedAt))) throw new Error("来源发布日期无效");
  return {
    merchant: { platform: input.platform, platformShopId, name: boundedText(input.name, 200, "店铺名称").trim(), sourceUrl: merchantUrl, identityScope },
    snapshot: { platform: input.platform, itemId: null, origin: "manual_excerpt", sourceUrl, publishedAt, captureScope: "manual_transcription", capturedText: text || null, quantities: [], structured: { identityNotice, buyerIdentity: "excluded_by_user" }, coverage: boundedText(input.coverage, 1000, "摘录范围") },
  };
}
