import type { ReasoningEntry } from "./domain";
/** Explicit provenance only; conclusion text is never searched for IDs. */
export function dependentClaimIds(entries: ReasoningEntry[], originalIds: string[]): string[] {
  const affected = new Set(originalIds); let changed = true;
  while (changed) { changed = false; for (const entry of entries) if (!affected.has(entry.id) && entry.payload.claimIds.some(id => affected.has(id))) { affected.add(entry.id); changed = true; } }
  return [...affected];
}
