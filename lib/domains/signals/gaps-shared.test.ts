import { describe, expect, it } from "vitest";
import type { BriefItem } from "./brief";
import {
  applyRechecks,
  collectJapanGaps,
  dueForRecheck,
  gapIdeaDraft,
  gapObservationText,
  isGapObserved,
  isJapanGap,
  recheckVerdict,
  type GapRecheck,
} from "./gaps-shared";

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

describe("反方向：日本有、中国还没有", () => {
  it("中国那边的结论单独收；两边互不混", () => {
    const it2 = item({ signal_id: "jp", japan: undefined, japan_check: undefined, china_side: "没有。中国还没这种服务。", china_check: found });
    expect(isJapanGap(it2, "china")).toBe(true);
    expect(isJapanGap(it2, "japan")).toBe(false);
    const gaps = collectJapanGaps([{ brief_date: "2026-10-12", items: [it2] }], "china");
    expect(gaps[0].japan).toBe("没有。中国还没这种服务。");
    expect(gapObservationText(gaps[0], "", "china")).toContain("日本有、中国还没有");
  });
});

describe("每月重查", () => {
  const recheck = (over: Partial<GapRecheck>): GapRecheck => ({
    signal_id: "s1",
    side: "japan",
    checked_on: "2026-11-20",
    verdict: "still",
    japan: "没有。",
    source_check: found,
    funded: null,
    ...over,
  });

  it("recheckVerdict：只认查到出处的结论；没出处的有了不算", () => {
    expect(recheckVerdict("有，LINE 上个月上线了。", found)).toBe("arrived");
    expect(recheckVerdict("有类似的，但没普及。", found)).toBe("still");
    expect(recheckVerdict("没有。", { status: "corrected", correction: "c", basis: found.basis })).toBe("still");
    expect(recheckVerdict("有，LINE 上个月上线了。", { status: "unverified", basis: [] })).toBe("unclear");
    expect(recheckVerdict("有，LINE 上个月上线了。", undefined)).toBe("unclear");
    expect(recheckVerdict("拿不准。", found)).toBe("unclear");
  });

  it("applyRechecks：最近一次说有了的挪出来；其余标上最近一次查是哪天", () => {
    const gaps = collectJapanGaps([
      {
        brief_date: "2026-10-01",
        items: [item({ signal_id: "a", event: "甲" }), item({ signal_id: "b", event: "乙" }), item({ signal_id: "c", event: "丙" })],
      },
    ]);
    const { open, arrived } = applyRechecks(
      gaps,
      [
        recheck({ signal_id: "a", checked_on: "2026-11-01", verdict: "still" }),
        recheck({ signal_id: "a", checked_on: "2026-12-01", verdict: "arrived", japan: "有，LINE 上线了。" }),
        recheck({ signal_id: "b", checked_on: "2026-11-01", verdict: "unclear" }),
        recheck({ signal_id: "c", side: "us", checked_on: "2026-11-01", verdict: "arrived" }),
      ],
      "japan"
    );
    expect(arrived.map((g) => [g.signal_id, g.arrivedOn, g.now])).toEqual([["a", "2026-12-01", "有，LINE 上线了。"]]);
    expect(open.map((g) => [g.signal_id, g.lastChecked, g.recheck?.verdict])).toEqual([
      ["b", "2026-11-01", "unclear"],
      // 别的方向上的重查不算
      ["c", "2026-10-01", undefined],
    ]);
  });

  it("dueForRecheck：上次查满 30 天的，最久没查的先查，最多几条", () => {
    const g = (id: string, lastChecked: string) => ({ ...collectJapanGaps([{ brief_date: lastChecked, items: [item({ signal_id: id, event: id })] }])[0], lastChecked, side: "japan" as const });
    const due = dueForRecheck([g("new", "2026-11-01"), g("old", "2026-09-01"), g("mid", "2026-10-01"), g("edge", "2026-10-14")], "2026-11-13", 2);
    expect(due.map((d) => d.signal_id)).toEqual(["old", "mid"]);
    expect(dueForRecheck([g("edge", "2026-10-14")], "2026-11-13", 5).map((d) => d.signal_id)).toEqual(["edge"]);
    expect(dueForRecheck([g("edge", "2026-10-15")], "2026-11-13", 5)).toEqual([]);
  });
});

describe("变成想法：查过能不能搬过来的，把这边不成立的那一条填成最关键假设", () => {
  it("只填查到出处、这边不成立的那一条；没有就不填", () => {
    const [gap] = collectJapanGaps([{ brief_date: "2026-10-12", items: [item({})] }]);
    const basis = [{ url: "u", title: "t", excerpt: "e" }];
    const transfer = {
      created_at: "",
      precedent: null,
      conditions: [
        { name: "人口够密", there: "t", here: "日本也够密。", holds: "yes" as const, basis },
        { name: "大家用微信", there: "t", here: "日本主要用 LINE。", holds: "no" as const, basis },
      ],
    };
    expect(gapIdeaDraft(gap, "japan", transfer).hypothesis.riskiest_assumption).toContain("「大家用微信」");
    expect(gapIdeaDraft(gap, "japan", { ...transfer, conditions: [{ ...transfer.conditions[1], basis: [] }] }).hypothesis).not.toHaveProperty(
      "riskiest_assumption"
    );
    expect(gapIdeaDraft(gap, "japan").hypothesis).not.toHaveProperty("riskiest_assumption");
  });
});
