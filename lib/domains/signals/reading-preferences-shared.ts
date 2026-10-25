import type { Followed } from "./memory-shared";

export type ReadingPreferenceValue = "follow" | "mute";
export type ReadingPreference = {
  signal_id: string;
  event_key: string;
  event_label: string | null;
  preference: ReadingPreferenceValue;
  created_at: string;
  updated_at: string;
  title: string | null;
  source?: string;
  fetched_at?: string;
};
export type ReadingPreferencesState =
  | { status: "ready"; preferences: ReadingPreference[] }
  | { status: "missing-schema"; preferences: [] };
export type ReadingItem = { signal_id: string; event?: string | null };

const normalizeEvent = (event: string) => event.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");

export function readingEventKey(signalId: string, event?: string | null): string {
  const normalized = normalizeEvent(event ?? "");
  return normalized.length >= 4 ? `event:${normalized}` : `signal:${signalId}`;
}

function matches(item: ReadingItem, preference: ReadingPreference): boolean {
  if (item.signal_id === preference.signal_id) return true;
  if (!item.event || !preference.event_key.startsWith("event:")) return false;
  const key = readingEventKey(item.signal_id, item.event);
  if (!key.startsWith("event:")) return false;
  const a = key.slice(6);
  const b = preference.event_key.slice(6);
  return a === b || a.includes(b) || b.includes(a);
}

export function preferenceForItem(item: ReadingItem, preferences: ReadingPreference[]): ReadingPreference | null {
  return preferences.filter((p) => matches(item, p)).sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.event_key.localeCompare(b.event_key))[0] ?? null;
}

export function partitionReadingItems<T extends ReadingItem>(items: T[], preferences: ReadingPreference[]): { visible: T[]; muted: T[] } {
  const visible: T[] = [];
  const muted: T[] = [];
  for (const item of items) (preferenceForItem(item, preferences)?.preference === "mute" ? muted : visible).push(item);
  return { visible, muted };
}

export function applyReadingPreferences(followed: Followed[], preferences: ReadingPreference[], events: Map<string, string> = new Map()): Followed[] {
  const result = new Map<string, Followed>();
  for (const p of preferences) {
    if (p.preference !== "follow" || preferenceForItem({ signal_id: p.signal_id, event: p.event_label }, preferences)?.preference !== "follow") continue;
    result.set(p.signal_id, {
      signal_id: p.signal_id, reason: "explicit", mark: null, note: null,
      at: p.updated_at, title: p.title, source: p.source ?? "", fetched_at: p.fetched_at ?? p.created_at,
    });
  }
  for (const row of followed) {
    if (preferenceForItem({ signal_id: row.signal_id, event: events.get(row.signal_id) }, preferences)?.preference === "mute") continue;
    if (!result.has(row.signal_id)) result.set(row.signal_id, row);
  }
  return [...result.values()];
}
