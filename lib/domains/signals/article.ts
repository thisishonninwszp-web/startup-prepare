import { extractArticleText } from "./rss";
import { worthFetchingPage } from "./summary";

/**
 * 日本的网站还有不少是 Shift_JIS / EUC-JP（ITmedia 就是），一律按 UTF-8 解会变乱码。
 * 先看响应头的 charset，再看页面开头的 <meta charset>，都没有就当 UTF-8。
 */
export function detectCharset(contentType: string | null, head: string): string {
  const fromHeader = contentType?.match(/charset=["']?([\w-]+)/i)?.[1];
  const fromMeta =
    head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  return (fromHeader || fromMeta || "utf-8").toLowerCase();
}

export function decodeHtml(bytes: ArrayBuffer, contentType: string | null): string {
  // meta 标签都是 ASCII，先按 latin1 读开头一段找 charset，不会被编码影响。
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 4096));
  const charset = detectCharset(contentType, head);
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes); // 不认识的编码名，退回 UTF-8
  }
}

/** 拿一个网页的 HTML（按正确的编码解码）。拿不到返回空串。 */
export async function fetchHtml(url: string, timeoutMs: number): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ideaos-news/1.0)" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    const contentType = res.headers.get("content-type");
    if (!res.ok || !(contentType ?? "").includes("html")) return "";
    return decodeHtml(await res.arrayBuffer(), contentType);
  } catch {
    return "";
  }
}

/** 单条深读时去拿文章正文。拿不到返回空串，分析退回到标题 + 简介。 */
export async function fetchArticleBody(url: string | null): Promise<string> {
  if (!url || !worthFetchingPage(url)) return "";
  const html = await fetchHtml(url, 8_000);
  return html ? extractArticleText(html) : "";
}
