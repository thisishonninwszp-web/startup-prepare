import type { RawSignal } from "../types.js";
import { PER_SOURCE_LIMIT } from "../config.js";

export async function fetchLobsters(query: string): Promise<RawSignal[]> {
  const params = new URLSearchParams({ q: query, what: "stories", order: "newest" });
  const res = await fetch(`https://lobste.rs/search.json?${params.toString()}`, {
    headers: { "User-Agent": "ideaos-crawler/0.1" },
  });
  if (!res.ok) throw new Error(`Lobste.rs ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  const hits = (
    Array.isArray(data.results)
      ? data.results
      : Array.isArray(data.hits)
        ? data.hits
        : []
  ) as {
    short_id?: string;
    title?: string;
    url?: string;
    description?: string;
    comments_url?: string;
  }[];
  return hits
    .slice(0, PER_SOURCE_LIMIT)
    .map((h): RawSignal | null => {
      const text = (h.description ?? h.title ?? "").trim();
      if (!text) return null;
      return {
        source: "lobsters",
        sourceId: h.short_id ?? h.url ?? String(Date.now() + Math.random()),
        url: h.comments_url ?? h.url ?? null,
        title: h.title ?? "Lobste.rs",
        rawText: text,
        query,
      };
    })
    .filter((r): r is RawSignal => r !== null);
}
