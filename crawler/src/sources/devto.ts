import type { RawSignal } from "../types.js";
import { PER_SOURCE_LIMIT } from "../config.js";

export async function fetchDevTo(query: string): Promise<RawSignal[]> {
  const tag = query.trim().toLowerCase().replace(/\s+/g, "");
  const params = new URLSearchParams({ tag, per_page: String(PER_SOURCE_LIMIT) });
  const res = await fetch(`https://dev.to/api/articles?${params.toString()}`, {
    headers: { "User-Agent": "ideaos-crawler/0.1" },
  });
  if (!res.ok) throw new Error(`Dev.to ${res.status}`);
  const items = (await res.json()) as {
    id: number;
    title?: string;
    description?: string;
    url?: string;
    slug?: string;
  }[];
  return items
    .map((it): RawSignal | null => {
      const text = (it.description ?? it.title ?? "").trim();
      if (!text) return null;
      return {
        source: "devto",
        sourceId: String(it.id),
        url: it.url ?? null,
        title: it.title ?? "Dev.to article",
        rawText: text,
        query,
      };
    })
    .filter((r): r is RawSignal => r !== null);
}
