import type { Platform } from "../domain";

const HOSTS: Record<Platform, readonly string[]> = {
  rakuten: ["www.rakuten.co.jp", "item.rakuten.co.jp", "review.rakuten.co.jp"],
  xiaohongshu: ["www.xiaohongshu.com", "xiaohongshu.com", "www.xiaohongshu.com", "mall.xiaohongshu.com"],
};
/** No network lookup or redirect following: only explicit public platform hosts. */
export function publicSourceUrl(value: string, platform: Platform): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("来源链接无效"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !HOSTS[platform]?.includes(url.hostname)) throw new Error("仅支持明确的平台 HTTPS 公开链接");
  url.hash = "";
  // Tracking and credential-bearing parameters are not material evidence.
  url.search = "";
  return url.toString();
}
export function boundedText(value: string, maximum: number, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(`${label}缺失或过长`);
  return value;
}
