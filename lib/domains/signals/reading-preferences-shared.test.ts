import { describe, expect, it } from "vitest";
import { applyReadingPreferences, partitionReadingItems, preferenceForItem, readingEventKey, type ReadingPreference } from "./reading-preferences-shared";
import type { Followed } from "./memory-shared";

const preference = (overrides: Partial<ReadingPreference> = {}): ReadingPreference => ({
  signal_id: "anchor", event_key: "event:日银加息", event_label: "日银加息", title: "日银宣布加息",
  preference: "mute", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", ...overrides,
});
const followed = (id: string): Followed => ({ signal_id: id, reason: "opened", mark: null, note: null, at: "2026-10-01", title: "标题", source: "rss:test", fetched_at: "2026-10-01" });

describe("reading preferences", () => {
  it("uses normalized report events and falls back to the signal for broad or absent tags", () => {
    expect(readingEventKey("a", " 日银，加息 ")).toBe("event:日银加息");
    expect(readingEventKey("a", "AI")).toBe("signal:a");
    expect(readingEventKey("b")).toBe("signal:b");
  });
  it("mutes later reports of the same event without hiding unrelated news", () => {
    const items = [{ signal_id: "later", event: "日银加息后银行跟进" }, { signal_id: "other", event: "物流招聘" }];
    expect(partitionReadingItems(items, [preference()])).toEqual({ visible: [items[1]], muted: [items[0]] });
  });
  it("matches the original signal when no event is present and does not spread short tags", () => {
    expect(preferenceForItem({ signal_id: "anchor" }, [preference()])?.preference).toBe("mute");
    expect(preferenceForItem({ signal_id: "other", event: "AI投资" }, [preference({ event_key: "signal:anchor", event_label: "AI" })])).toBeNull();
  });
  it("respects the newest explicit choice when event labels overlap", () => {
    const newer = preference({ signal_id: "new", event_key: "event:日银加息后银行跟进", event_label: "日银加息后银行跟进", preference: "follow", updated_at: "2026-10-02T00:00:00Z" });
    expect(preferenceForItem({ signal_id: "latest", event: "日银加息" }, [newer, preference()])?.preference).toBe("follow");
  });
  it("explicit mute overrides repeated opens and follow adds an otherwise absent story", () => {
    const explicit = preference({ signal_id: "new", event_key: "signal:new", preference: "follow", event_label: null });
    const result = applyReadingPreferences([followed("anchor"), followed("keep")], [preference(), explicit]);
    expect(result.map((r) => r.signal_id)).toEqual(["new", "keep"]);
    expect(result[0]).toMatchObject({ reason: "explicit", title: "日银宣布加息" });
  });
  it("muted anchors also suppress auto-followed reports with a known matching event", () => {
    const result = applyReadingPreferences([followed("later")], [preference()], new Map([["later", "日银加息后银行跟进"]]));
    expect(result).toEqual([]);
  });
  it("removing an override restores the existing automatic behavior", () => {
    const row = followed("anchor");
    expect(applyReadingPreferences([row], [])).toEqual([row]);
  });
});
