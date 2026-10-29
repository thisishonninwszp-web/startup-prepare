import { describe, expect, it } from "vitest";
import { groupTimeline, validateOccurrence, validateUuid, type TimelineEntry } from "./domain";

describe("event time semantics", () => {
  it("rejects impossible calendar dates rather than normalizing them", () => {
    expect(() => validateOccurrence({ from: "2026-02-30", to: "2026-02-30", precision: "day", quote: "announced" }, "announced")).toThrow();
  });
  it("requires exact source evidence and an ordered precision interval", () => {
    expect(() => validateOccurrence({ from: "2026-01-01", to: "2026-12-31", precision: "month", quote: "announced" }, "announced")).toThrow();
    expect(() => validateOccurrence({ from: "2026-01-01", to: "2026-01-01", precision: "day", quote: "invented" }, "announced")).toThrow();
    expect(validateOccurrence({ from: "2024-02", to: null, precision: "month", quote: "announced" }, "It was announced.")).toEqual({ from: "2024-02", to: null, precision: "month", quote: "announced" });
  });
  it("keeps undated published and occurred items separate from capture dates", () => {
    const a = { signalId: "a", publishedAt: null, capturedAt: "2026-02-01", occurred: null } as TimelineEntry;
    const b = { signalId: "b", publishedAt: "2026-01-01", capturedAt: "2026-02-02", occurred: null } as TimelineEntry;
    expect(groupTimeline([a, b], "published")).toEqual({ dated: [b], undated: [a] });
    expect(groupTimeline([a, b], "occurred")).toEqual({ dated: [], undated: [a, b] });
    expect(groupTimeline([a, b], "captured")).toEqual({ dated: [b, a], undated: [] });
  });
  it("rejects malformed identifiers before any database operation", () => {
    expect(() => validateUuid("other-user")).toThrow();
    expect(validateUuid("11111111-1111-4111-8111-111111111111")).toBe("11111111-1111-4111-8111-111111111111");
  });
});
