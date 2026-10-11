/**
 * 新闻简介：只用发布方自己写的文字（RSS 摘要，或文章页的 og:description），
 * 不让 AI 编 —— 只有标题的时候编出来的"简介"就是瞎猜。
 */

const MIN_LENGTH = 20;
const MAX_LENGTH = 400;

/** 这段摘要值不值得显示。Hacker News 的 "Comments"、Google News 把标题重复一遍的，都不算。 */
export function usableSummary(title: string | null, summary: string | null): string {
  const s = (summary ?? "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  // Google News 的标题带 " - 媒体名" 尾巴，摘要是"标题 媒体名"，比的时候去掉尾巴。
  const t = (title ?? "").replace(/\s+-\s+[^-]+$/, "").trim();
  if (s.length < MIN_LENGTH) return "";
  if (t && s.startsWith(t)) return "";
  return s.length > MAX_LENGTH ? `${s.slice(0, MAX_LENGTH)}…` : s;
}

/** 这个链接要不要去页面上找简介。Google News 的跳转页只有一句通用说明，不去。 */
export function worthFetchingPage(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return !host.endsWith("news.google.com");
  } catch {
    return false;
  }
}
