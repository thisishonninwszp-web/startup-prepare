/**
 * 记忆层（浏览器端也要用的部分，不碰数据库、不碰网络）：
 * 抓到的每一条新闻都存着（external_signals，一条不删），算一个「意思的指纹」，能按意思搜、能看这件事以前和后来；
 * 他看到时点一下的标记是以后想起来的钩子 —— 标过的过 7 天、30 天、一年再拿出来给他看一次。
 */

export type MarkKind = "important" | "mine" | "doubt";

export const MARK_LABELS: Record<MarkKind, string> = { important: "重要", mine: "跟我有关", doubt: "存疑" };

export type ArchiveHit = { id: string; source: string; url: string | null; title: string | null; snippet: string; fetched_at: string; similarity?: number };

export type Mark = { signal_id: string; mark: MarkKind; note: string | null; created_at: string };

/** 回头看的几个间隔（天）。 */
export const RESURFACE_DAYS = [7, 30, 365] as const;

export const RESURFACE_LABELS: Record<(typeof RESURFACE_DAYS)[number], string> = { 7: "一周前", 30: "一个月前", 365: "一年前" };

/** 算指纹用的文字：标题加正文开头。 */
export function embedText(row: { title: string | null; raw_text: string }): string {
  return `${row.title ?? ""}\n${row.raw_text ?? ""}`.trim().slice(0, 1500);
}

/** PostgREST 把 vector 列读成字符串「[0.1,0.2,…]」；解析不了返回 null。 */
export function parseVector(v: unknown): number[] | null {
  if (Array.isArray(v)) return v.map(Number);
  if (typeof v !== "string") return null;
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.map(Number) : null;
  } catch {
    return null;
  }
}

/** 日本的某一天（YYYY-MM-DD）往前 n 天那一天的起止（ISO，按日本时间）。 */
export function tokyoDayRange(today: string, daysAgo: number): { from: string; to: string } {
  const start = Date.parse(`${today}T00:00:00+09:00`) - daysAgo * 86_400_000;
  return { from: new Date(start).toISOString(), to: new Date(start + 86_400_000).toISOString() };
}

/** 关键词命中和按意思命中合在一起：关键词的在前（他记得原词时最准），同一条只留一次。 */
export function mergeHits(keyword: ArchiveHit[], semantic: ArchiveHit[], limit: number): ArchiveHit[] {
  const seen = new Set<string>();
  const out: ArchiveHit[] = [];
  for (const h of [...keyword, ...semantic]) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}

/** RSS 里带来的 &nbsp; 这类 HTML 符号还原、多余空白压成一个（显示和交给 AI 都用这个）。 */
export function cleanSnippet(t: string | null | undefined): string {
  return (t ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** 相似到什么程度才算「同一件事的以前 / 后来」。 */
export const SAME_STORY = 0.72;
