/** 搜索结果合并：几组结果按 URL 去重、按先后顺序留前 max 篇。没有正文或链接的丢掉。 */
export function mergeSources<T extends { url: string; content: string }>(groups: T[][], max: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const group of groups) {
    for (const r of group) {
      if (!r.url || !r.content || seen.has(r.url)) continue;
      seen.add(r.url);
      out.push(r);
      if (out.length >= max) return out;
    }
  }
  return out;
}
