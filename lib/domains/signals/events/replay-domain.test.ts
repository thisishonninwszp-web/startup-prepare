import { describe, expect, it } from "vitest";
import { replayExport, replayInput } from "./replay-domain";
describe("historical replay boundary", () => {
  it("rejects malformed cutoff and mode", () => {
    expect(() => replayInput("2026-02-30", "archived")).toThrow();
    expect(() => replayInput("2026-01-01T00:00:00Z", "future")).toThrow();
  });
  it("normalizes valid timezone offsets without moving the calendar validation", () => {
    expect(replayInput("2026-01-01T00:00:00+09:00", "archived").cutoff).toBe("2025-12-31T15:00:00.000Z");
  });
  it("exports only revealed material and the immutable practice guess", () => {
    const result = replayExport({ id: "s", cutoff: "2026-01-01T00:00:00Z", mode: "recovered", guess: "No", revealed: 0, materials: [], complete: false, latestTitle: "SECRET", future: [{title:"FUTURE"}] } as never);
    expect(result).not.toContain("SECRET"); expect(result).not.toContain("FUTURE"); expect(result).toContain("No"); expect(result).toContain("回溯补录");
  });
});
