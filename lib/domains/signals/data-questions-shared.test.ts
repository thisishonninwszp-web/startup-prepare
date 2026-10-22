import { describe, expect, it } from "vitest";
import { closeOnOrBefore, monthResolveOn, monthUpShare, prevMonth, toTokyoDay, upShare, weekAhead } from "./data-questions-shared";

describe("数据题", () => {
  it("一周后同一个星期几，周末挪到周五", () => {
    expect(weekAhead("2026-10-23")).toBe("2026-10-30"); // 周五 → 下周五
    expect(weekAhead("2026-10-24")).toBe("2026-10-30"); // 周六 → 下周五
  });

  it("收盘取那天或以前最后一个；时间戳按日本日期", () => {
    expect(toTokyoDay(Date.parse("2026-10-23T16:00:00Z") / 1000)).toBe("2026-10-24");
    const s = [
      { day: "2026-10-28", close: 1 },
      { day: "2026-10-29", close: 2 },
      { day: "2026-11-02", close: 3 },
    ];
    expect(closeOnOrBefore(s, "2026-10-31")?.close).toBe(2);
    expect(closeOnOrBefore(s, "2026-10-27")).toBeNull();
  });

  it("统计基准：隔 5 个交易日比当时高的比例；样本不够不给", () => {
    const rising = Array.from({ length: 200 }, (_, i) => 100 + i);
    expect(upShare(rising)).toBe(1);
    expect(upShare(rising.slice(0, 50))).toBeNull();
  });

  it("维基：满两年用往年同月，不够用最近 24 个月", () => {
    const h = [
      { month: "2024-09", views: 100 },
      { month: "2024-10", views: 150 },
      { month: "2025-09", views: 100 },
      { month: "2025-10", views: 90 },
      { month: "2026-09", views: 100 },
    ];
    expect(monthUpShare(h, "2026-10")).toEqual({ p: 0.5, how: "往年 2 次里同一个月比前一个月多的比例" });
    expect(monthUpShare(h.slice(0, 2), "2026-10")).toBeNull();
    expect(prevMonth("2026-01")).toBe("2025-12");
    expect(monthResolveOn("2026-10")).toBe("2026-11-03");
  });
});
