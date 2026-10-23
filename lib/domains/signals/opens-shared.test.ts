import { describe, expect, it } from "vitest";
import { opensBySource, repeatOpened } from "./opens-shared";

describe("他点开了哪几条", () => {
  it("点开过两天以上才算在跟，新的在前", () => {
    const rows = [
      { signal_id: "a", opened_on: "2026-10-20", first_at: "2026-10-20T01:00:00Z" },
      { signal_id: "a", opened_on: "2026-10-22", first_at: "2026-10-22T01:00:00Z" },
      { signal_id: "b", opened_on: "2026-10-22", first_at: "2026-10-22T02:00:00Z" },
      { signal_id: "c", opened_on: "2026-10-18", first_at: "2026-10-18T01:00:00Z" },
      { signal_id: "c", opened_on: "2026-10-23", first_at: "2026-10-23T01:00:00Z" },
    ];
    expect(repeatOpened(rows)).toEqual([
      { signal_id: "c", at: "2026-10-23T01:00:00Z", days: 2 },
      { signal_id: "a", at: "2026-10-22T01:00:00Z", days: 2 },
    ]);
  });

  it("每个源点开过几条，同一条只算一次", () => {
    const m = opensBySource([
      { signal_id: "a", source: "nikkei" },
      { signal_id: "a", source: "nikkei" },
      { signal_id: "b", source: "nikkei" },
      { signal_id: "c", source: "36kr" },
    ]);
    expect(Object.fromEntries(m)).toEqual({ nikkei: 2, "36kr": 1 });
  });
});
