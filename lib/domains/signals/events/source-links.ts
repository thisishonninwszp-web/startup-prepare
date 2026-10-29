import type { SourceRef } from "./research-shared";
export type SourceLinkCandidate = { fromSnapshotId: string; toSnapshotId: string; relation: "cites" | "reprints"; refs: SourceRef[] };
function normalizedUrl(raw: string | null): string | null {
  try { const url = new URL(raw ?? ""); if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null; url.hash = ""; return url.href; }
  catch { return null; }
}
export function proposeSourceLinks(sources: { id: string; source_url: string | null; captured_text: string }[]): SourceLinkCandidate[] {
  const byUrl = new Map<string, string>(); for (const row of sources) { const url = normalizedUrl(row.source_url); if (url) byUrl.set(url, row.id); }
  const result: SourceLinkCandidate[] = []; const seen = new Set<string>();
  for (const row of sources) {
    for (const match of row.captured_text.matchAll(/https?:\/\/[^\s<>"'，。；）)]+/g)) {
      const target = byUrl.get(normalizedUrl(match[0]) ?? ""); if (!target || target === row.id) continue;
      const start = Math.max(0, match.index! - 100); const end = Math.min(row.captured_text.length, match.index! + match[0].length + 100);
      const quote = row.captured_text.slice(start, end);
      if (!/转载|原文链接|引用|据[^。\n]{0,24}报道|\bsource\b|\bvia\b|\breprint(?:ed)?\b/i.test(quote)) continue;
      const key = `${row.id}:${target}`; if (seen.has(key)) continue; seen.add(key);
      result.push({ fromSnapshotId: row.id, toSnapshotId: target, relation: /转载|reprint/i.test(quote) ? "reprints" : "cites", refs: [{ snapshotId: row.id, quote }] });
      if (result.length >= 20) return result;
    }
  }
  return result;
}
