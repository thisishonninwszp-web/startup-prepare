/**
 * Google News 的链接是跳转页（news.google.com/rss/articles/…），直接抓只能拿到 Google 自己的页面。
 * 还原原文地址：先打开跳转页拿到它藏的签名和时间戳，再拿去换真正的链接。
 *
 * 这个接口不是 Google 公开的，哪天变了就会失效 —— 所以任何一步失败都返回 null，
 * 调用方退回现在的样子（标"没读到正文"），报告照常。
 */

const TIMEOUT_MS = 8_000;
const UA = "Mozilla/5.0 (compatible; ideaos-news/1.0)";

export function isGoogleNewsUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("news.google.com");
  } catch {
    return false;
  }
}

/** 跳转链接里的文章编号（/articles/ 后面那段）。 */
export function googleNewsArticleId(url: string): string | null {
  const m = url.match(/news\.google\.com\/(?:rss\/)?articles\/([^/?#]+)/);
  return m ? m[1] : null;
}

/** 跳转页里的签名和时间戳。 */
export function parseSignature(html: string): { signature: string; timestamp: string } | null {
  const signature = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const timestamp = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
  return signature && timestamp ? { signature, timestamp } : null;
}

/** 从换链接接口的返回里取出原文地址；不是 http(s) 链接就当没拿到。 */
export function parseDecodedUrl(text: string): string | null {
  const url = text.match(/\[\\"garturlres\\",\\"([^\\"]+)\\"/)?.[1];
  return url && /^https?:\/\//.test(url) && !isGoogleNewsUrl(url) ? url : null;
}

export async function resolveGoogleNewsUrl(url: string): Promise<string | null> {
  const id = googleNewsArticleId(url);
  if (!id) return null;
  try {
    const page = await fetch(`https://news.google.com/rss/articles/${id}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!page.ok) return null;
    const sig = parseSignature(await page.text());
    if (!sig) return null;
    const req = [
      [
        "Fbv4je",
        `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${sig.timestamp},"${sig.signature}"]`,
      ],
    ];
    const res = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": UA },
      body: `f.req=${encodeURIComponent(JSON.stringify([req]))}`,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return parseDecodedUrl(await res.text());
  } catch {
    return null;
  }
}
