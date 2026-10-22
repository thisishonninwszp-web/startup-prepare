import { describe, expect, it } from "vitest";
import { isMonth, lineStatus, monthRange, monthWeeks, nextHref, shiftMonth, weekLabel } from "./monthly-shared";

describe("月报的日子", () => {
  it("month range and shifting across years", () => {
    expect(monthRange("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(monthRange("2026-10")).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(isMonth("2026-13")).toBe(false);
  });

  it("only finished weeks that touch the month count", () => {
    // 2026-10-22 是周四：9/28 那周（含 10/1–10/4）、10/5、10/12 三周过完了，10/19 那周还没过完
    expect(monthWeeks("2026-10", "2026-10-22")).toEqual(["2026-09-28", "2026-10-05", "2026-10-12"]);
    // 9 月：8/31 那周到 9/28 那周（9/28 那周的周日 10/4 已过）
    expect(monthWeeks("2026-09", "2026-10-22")).toEqual(["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
    expect(weekLabel(1, "2026-10-05")).toBe("第 2 周（10/5–10/11）");
  });

  it("status by the last counted week", () => {
    const weeks = ["2026-09-28", "2026-10-05", "2026-10-12"];
    expect(lineStatus(["2026-09-28", "2026-10-12"], weeks)).toBe("still");
    expect(lineStatus(["2026-09-28", "2026-10-05"], weeks)).toBe("faded");
  });

  it("next step goes straight to the related gap or idea", () => {
    expect(nextHref("door", [{ kind: "gap", id: "s1", side: "us", title: "x" }])).toBe("/signals/gaps/door?side=us&signal=s1");
    expect(nextHref("gaps", [{ kind: "idea", id: "i1", title: "x" }])).toBe("/ideas/i1#gaps");
    expect(nextHref("door", [])).toBe("/signals/gaps");
  });
});
