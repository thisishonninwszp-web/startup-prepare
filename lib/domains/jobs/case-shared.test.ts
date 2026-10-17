import { describe, expect, it } from "vitest";
import { assertNoPraiseJa, isCaseType, isStuckStep, minutesTaken, stuckCounts } from "./case-shared";

describe("用了几分钟", () => {
  it("至少 1 分钟，没交是 null", () => {
    expect(minutesTaken("2026-10-17T10:00:00Z", "2026-10-17T10:12:20Z")).toBe(12);
    expect(minutesTaken("2026-10-17T10:00:00Z", "2026-10-17T10:00:10Z")).toBe(1);
    expect(minutesTaken("2026-10-17T10:00:00Z", null)).toBeNull();
  });
});

describe("卡在哪一步的次数", () => {
  it("只数他点了的、最近 10 道；total 是一共练了几道", () => {
    const drills = [
      ...Array.from({ length: 11 }, (_, i) => ({
        stuck_step: "numbers" as const,
        created_at: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      })),
      { stuck_step: "split" as const, created_at: "2026-10-20T00:00:00Z" },
      { stuck_step: null, created_at: "2026-10-21T00:00:00Z" },
    ];
    const r = stuckCounts(drills);
    expect(r.total).toBe(13);
    expect(r.recent).toBe(10);
    expect(r.counts).toEqual({ define: 0, split: 1, numbers: 9, prioritize: 0, conclude: 0 });
  });
});

describe("类型守卫", () => {
  it("只认五类、五种题型，不认原型上的键", () => {
    expect(isStuckStep("numbers")).toBe(true);
    expect(isStuckStep("toString")).toBe(false);
    expect(isCaseType("sizing")).toBe(true);
    expect(isCaseType("other")).toBe(false);
  });
});

describe("日文不许夸", () => {
  it("带夸奖报错", () => {
    expect(() => assertNoPraiseJa(["素晴らしい構造ですね。では次に"])).toThrow(/夸奖/);
    expect(() => assertNoPraiseJa(["その数字はどこから来ましたか。"])).not.toThrow();
  });
});
