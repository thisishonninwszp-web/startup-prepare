import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { decodeHtml } from "@/lib/domains/signals/article";
import { extractArticleText } from "@/lib/domains/signals/rss";

/**
 * 读一个用户分享进来的网页。服务器替人去访问网址，就得防着被人拿来探内网
 * （localhost、云服务器的元数据地址、局域网的路由器……）：
 * 每一跳都先查 DNS，地址落在内网 / 本机 / 保留段就不去；重定向手动跟，每跳都再查一次。
 */

export type PageResult = { ok: true; finalUrl: string; title: string; body: string } | { ok: false; reason: string };

const MAX_REDIRECTS = 4;
const MIN_BODY = 80;

/** 这个 IP 是不是内网、本机或保留地址。 */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === "::1" || x === "::") return true;
    if (x.startsWith("::ffff:")) return isPrivateAddress(x.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb)/.test(x);
  }
  return true;
}

async function hostIsPublic(hostname: string): Promise<boolean> {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (isIP(h)) return !isPrivateAddress(h);
  try {
    const addrs = await lookup(h, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

function titleOf(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const t = og ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  return t
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** extract：从 HTML 里取正文的办法（默认只取 <p> 段落，读文章用；上网查证时要连列表、表格一起取）。 */
export async function fetchPublicPage(
  url: string,
  extract: (html: string) => string = (html) => extractArticleText(html, 12_000)
): Promise<PageResult> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return { ok: false, reason: "地址格式不对" };
    }
    if (!["http:", "https:"].includes(parsed.protocol)) return { ok: false, reason: "只读 http / https 的网页" };
    if (!(await hostIsPublic(parsed.hostname))) return { ok: false, reason: "这个地址不在公网上，不去读" };

    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
          "Accept-Language": "ja,zh-CN;q=0.9,en;q=0.8",
        },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
    } catch {
      return { ok: false, reason: "网页打不开（超时或连不上）" };
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return { ok: false, reason: "网页跳转到了一个空地址" };
      current = new URL(next, current).toString();
      continue;
    }
    if (!res.ok) return { ok: false, reason: `网页返回了 ${res.status}` };
    const contentType = res.headers.get("content-type");
    if (!(contentType ?? "").includes("html")) return { ok: false, reason: "这不是网页（可能是图片或文件）" };
    const html = decodeHtml(await res.arrayBuffer(), contentType);
    const body = extract(html);
    if (body.length < MIN_BODY) return { ok: false, reason: "页面上没找到像样的正文（可能要登录，或者正文是脚本画出来的）" };
    return { ok: true, finalUrl: current, title: titleOf(html), body };
  }
  return { ok: false, reason: "跳转太多次" };
}
