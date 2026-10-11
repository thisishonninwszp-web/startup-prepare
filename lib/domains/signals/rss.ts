/**
 * 极简 RSS 2.0 / Atom 解析。只取标题、链接、发布时间、摘要四样，
 * 不引第三方 XML 库 —— 新闻源的结构足够规整，正则就够用，解析不了的条目直接丢掉。
 */

export type FeedItem = {
  title: string;
  link: string;
  /** 解析不出时间时为 null，排序时沉底。 */
  publishedAt: Date | null;
  summary: string;
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]).trim() : "";
}

function parseDate(text: string): Date | null {
  if (!text) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 文章页里发布方自己写的简介：og:description 优先，没有就用 meta description。 */
export function extractPageDescription(html: string): string {
  const metas = html.match(/<meta\s[^>]*>/gi) ?? [];
  const find = (key: RegExp) => {
    for (const meta of metas) {
      if (!key.test(meta)) continue;
      const content = meta.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      if (content) return stripTags(decode(content[1] ?? content[2] ?? ""));
    }
    return "";
  };
  return (
    find(/property\s*=\s*["']og:description["']/i) ||
    find(/name\s*=\s*["']description["']/i)
  );
}

/**
 * 文章正文的粗提取：只取 <p> 段落里的文字，去掉脚本和样式。
 * 给 AI 做单条分析用，不求完美 —— 拿不到就退回标题 + 简介。
 */
export function extractArticleText(html: string, maxLength = 3000): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const paragraphs: string[] = [];
  let total = 0;
  for (const m of cleaned.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi)) {
    const text = stripTags(decode(m[1]));
    if (text.length < 20) continue; // 跳过"シェア""関連記事"之类的碎片
    paragraphs.push(text);
    total += text.length;
    if (total >= maxLength) break;
  }
  return paragraphs.join("\n").slice(0, maxLength);
}

export function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];

  for (const m of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const block = m[1];
    items.push({
      title: stripTags(tag(block, "title")),
      link: tag(block, "link") || tag(block, "guid"),
      publishedAt: parseDate(tag(block, "pubDate") || tag(block, "dc:date")),
      summary: stripTags(tag(block, "description")),
    });
  }

  for (const m of xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)) {
    const block = m[1];
    const href = block.match(/<link[^>]*href="([^"]+)"/i);
    items.push({
      title: stripTags(tag(block, "title")),
      link: href ? decode(href[1]) : "",
      publishedAt: parseDate(tag(block, "published") || tag(block, "updated")),
      summary: stripTags(tag(block, "summary") || tag(block, "content")),
    });
  }

  return items.filter((it) => it.title && /^https?:\/\//.test(it.link));
}
