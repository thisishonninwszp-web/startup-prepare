/**
 * 楽天市场商品搜索：全站只走这一个（官方文档 webservice.rakuten.co.jp/documentation/ichiba-item-search，版本 2026-07-01）。
 * 旧接口 app.rakuten.co.jp 2026-05 停了、旧应用 ID 不能用；新接口要 applicationId + accessKey，另外带上 Referer
 * （有开发者实测不带会被拒；要和楽天那边 Allowed websites 里登记的域名一致）。
 *
 * 环境变量：RAKUTEN_APPLICATION_ID（早先材料抓取用的名字 RAKUTEN_APP_ID 也认）、RAKUTEN_ACCESS_KEY；
 * RAKUTEN_REFERER 不填就用 APP_URL，再没有用线上地址。
 */

const ENDPOINT = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";

export function rakutenKeys(): { applicationId: string; accessKey: string } | null {
  const applicationId = (process.env.RAKUTEN_APPLICATION_ID || process.env.RAKUTEN_APP_ID || "").trim();
  const accessKey = (process.env.RAKUTEN_ACCESS_KEY || "").trim();
  return applicationId && accessKey ? { applicationId, accessKey } : null;
}

/**
 * 发给楽天的 Referer：要和楽天那边 Allowed websites 登记的域名一致。
 * 环境变量里只写了域名（startup-prepare.vercel.app）也行，这里补成完整网址 —— Referer 要的是网址，不是域名。
 */
export function rakutenReferer(raw = process.env.RAKUTEN_REFERER || process.env.APP_URL || ""): string {
  const v = raw.trim() || "https://startup-prepare.vercel.app/";
  const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  return /^https?:\/\/[^/]+$/i.test(url) ? `${url}/` : url;
}

/** 搜一次（formatVersion=2，Items 是扁平的）。没配 Key 返回 "no-key"；接口出错返回 { error }，页面上要看得出卡在哪。 */
export async function rakutenItemSearch(
  params: Record<string, string>,
  timeoutMs = 8_000
): Promise<unknown | "no-key" | { error: string }> {
  const keys = rakutenKeys();
  if (!keys) return "no-key";
  const referer = rakutenReferer();
  const query = new URLSearchParams({ ...keys, format: "json", formatVersion: "2", ...params });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${ENDPOINT}?${query}`, { signal: controller.signal, headers: { Referer: referer, Origin: new URL(referer).origin, "User-Agent": "IdeaOS/1.0" } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("rakuten search failed", res.status, body.slice(0, 300));
      return { error: `楽天返回 ${res.status}${body ? `：${body.slice(0, 120)}` : ""}` };
    }
    return await res.json();
  } catch (e) {
    return { error: e instanceof Error ? e.message.slice(0, 120) : "没连上" };
  } finally {
    clearTimeout(timer);
  }
}
