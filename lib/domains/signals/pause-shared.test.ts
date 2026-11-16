import { describe, expect, it } from "vitest";
import { earliestOf, isPausedNow, lastTouchNote, latestOf, pausedSentence } from "./pause-shared";

const now = Date.parse("2026-11-16T00:00:00Z");
const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString();

describe("停掉没人点的", () => {
  it("做出来满两周、两周里没人点、没点恢复才停", () => {
    expect(isPausedNow({ firstMade: daysAgo(25), lastTouch: daysAgo(19), resumedAt: null }, now)).toBe(true);
    expect(isPausedNow({ firstMade: daysAgo(25), lastTouch: null, resumedAt: null }, now)).toBe(true);
    // 两周里点过一次
    expect(isPausedNow({ firstMade: daysAgo(25), lastTouch: daysAgo(3), resumedAt: null }, now)).toBe(false);
    // 点过「恢复」，再看两周
    expect(isPausedNow({ firstMade: daysAgo(25), lastTouch: null, resumedAt: daysAgo(13) }, now)).toBe(false);
    expect(isPausedNow({ firstMade: daysAgo(40), lastTouch: null, resumedAt: daysAgo(15) }, now)).toBe(true);
  });

  it("刚开始做的头两周不停；从没做过、日子读不出来的也不停", () => {
    expect(isPausedNow({ firstMade: daysAgo(10), lastTouch: null, resumedAt: null }, now)).toBe(false);
    expect(isPausedNow({ firstMade: null, lastTouch: null, resumedAt: null }, now)).toBe(false);
    expect(isPausedNow({ firstMade: "不是日子", lastTouch: null, resumedAt: null }, now)).toBe(false);
    // 报告的日子只有年月日
    expect(isPausedNow({ firstMade: "2026-10-22", lastTouch: null, resumedAt: null }, now)).toBe(true);
  });

  it("最晚、最早按时间比，不按字比", () => {
    expect(latestOf(["2026-10-28T09:00:00.123456+00:00", "2026-10-28T10:00:00Z", null, "坏的"])).toBe("2026-10-28T10:00:00Z");
    expect(earliestOf(["2026-10-23", undefined, "2026-10-22T23:00:00+09:00"])).toBe("2026-10-22T23:00:00+09:00");
    expect(latestOf([])).toBeNull();
  });

  it("那一句：停了哪几样、最后一次是哪天（东京时间）", () => {
    expect(lastTouchNote("2026-10-28T15:30:00Z")).toBe("10 月 29 日以后没点过");
    expect(lastTouchNote(null)).toBe("一次也没点过");
    expect(
      pausedSentence([
        { kind: "practice", paused: true, lastTouch: "2026-10-28T03:00:00Z" },
        { kind: "business", paused: true, lastTouch: null },
        { kind: "door", paused: false, lastTouch: null },
      ])
    ).toBe("这几样两周多没人点，先停了、不出新的：练习的 AI 先判（10 月 28 日以后没点过）、生意题（一次也没点过）。");
    expect(pausedSentence([{ kind: "door", paused: false, lastTouch: null }])).toBeNull();
  });
});
