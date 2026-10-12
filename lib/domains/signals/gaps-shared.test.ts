import { describe, expect, it } from "vitest";
import type { BriefItem } from "./brief";
import { collectJapanGaps, gapObservationText, isGapObserved, isJapanGap } from "./gaps-shared";

const found = { status: "supported" as const, basis: [{ url: "https://example.jp", title: "t", excerpt: "原文原文原文原文" }] };

function item(over: Partial<BriefItem>): BriefItem {
  return {
    signal_id: "s1",
    title: "微信开放 AI 入口",
    url: "https://example.cn/1",
    source: "人人都是产品经理",
    headline: "微信在 28 个场景开放 AI",
    background: "b",
    for_you: "f",
    event: "微信AI入口",
    japan: "没有。LINE 还没这么做。",
    japan_check: found,
    ...over,
  };
}

describe("isJapanGap", () => {
  it("只收查到出处、结论是没有或没普及的", () => {
    expect(isJapanGap(item({}))).toBe(true);
    expect(isJapanGap(item({ japan: "有类似的，但没普及。" }))).toBe(true);
    expect(isJapanGap(item({ japan: "有，LINE 早就有了。" }))).toBe(false);
    expect(isJapanGap(item({ japan: "拿不准。" }))).toBe(false);
    expect(isJapanGap(item({ japan_check: { status: "unverified", basis: [] } }))).toBe(false);
    expect(isJapanGap(item({ japan_check: undefined }))).toBe(false);
    expect(isJapanGap(item({ extra: true }))).toBe(false);
  });
});

describe("collectJapanGaps", () => {
  it("同一条、同一件事只留最新的那次", () => {
    const gaps = collectJapanGaps([
      { brief_date: "2026-10-13", items: [item({ signal_id: "new", event: "微信AI入口扩大" })] },
      { brief_date: "2026-10-12", items: [item({ signal_id: "old" }), item({ signal_id: "other", event: "即时零售" })] },
    ]);
    expect(gaps.map((g) => [g.signal_id, g.brief_date])).toEqual([
      ["new", "2026-10-13"],
      ["other", "2026-10-12"],
    ]);
  });
});

describe("记成观察", () => {
  it("你的那句话放最前面；记过的认得出来", () => {
    const [gap] = collectJapanGaps([{ brief_date: "2026-10-12", items: [item({})] }]);
    const text = gapObservationText(gap, " 做电商的店主可能需要 ");
    expect(text.split("\n")[0]).toBe("做电商的店主可能需要");
    expect(text).toContain("中国有、日本还没有：微信在 28 个场景开放 AI");
    expect(isGapObserved(gap, [text])).toBe(true);
    expect(isGapObserved(gap, ["别的观察"])).toBe(false);
  });
});
