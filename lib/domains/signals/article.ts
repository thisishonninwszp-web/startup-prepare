import { extractArticleText } from "./rss";
import { worthFetchingPage } from "./summary";

/** 单条深读时去拿文章正文。拿不到返回空串，分析退回到标题 + 简介。 */
export async function fetchArticleBody(url: string | null): Promise<string> {
  if (!url || !worthFetchingPage(url)) return "";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ideaos-news/1.0)" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return "";
    return extractArticleText(await res.text());
  } catch {
    return "";
  }
}
