import { describe, expect, it } from "vitest";
import { atlasTimeline, baseSentence, categoryBase, countedCases, lagBuckets, lagLabel, lagMonths, monthIndex, noUpgrade, unprovenClaims } from "./atlas-shared";

describe("时差图谱", () => {
  it("monthIndex / lagMonths：年、年月、年月日都认；日本更早、认不出、没到的不算", () => {
    expect(monthIndex("2018")).toBe(2018 * 12);
    expect(monthIndex("2018-10-05")).toBe(2018 * 12 + 9);
    expect(monthIndex("2018-13")).toBeNull();
    expect(monthIndex("去年")).toBeNull();
    expect(lagMonths("2014", "2018-10-05")).toBe(57);
    expect(lagMonths("2016-04-22", "2017-08")).toBe(16);
    expect(lagMonths("2018", null)).toBeNull();
    expect(lagMonths("2020", "2018")).toBeNull();
  });

  it("lagLabel：一年以内说几个月，以上说约几年", () => {
    expect(lagLabel(7)).toBe("7 个月");
    expect(lagLabel(24)).toBe("约 2 年");
    expect(lagLabel(57)).toBe("约 4.8 年");
    expect(lagLabel(null)).toBe("—");
  });

  it("categoryBase / baseSentence：只数次数；中国公司带进来的退出了几件单独数", () => {
    const base = categoryBase([
      { lag_months: 16, outcome: "exited", carrier: "china" },
      { lag_months: 57, outcome: "widespread", carrier: "local" },
      { lag_months: null, outcome: "blocked", carrier: "local" },
      { lag_months: 12, outcome: "widespread", carrier: "china" },
    ]);
    expect(base).toMatchObject({ total: 4, quick: 2, slow: 1, notYet: 1, chinaCarried: 2, chinaExited: 1 });
    expect(base.outcomes.widespread).toBe(2);
    expect(baseSentence("mobility", base)).toBe("图谱里「出行」有 4 件：2 件 3 年内到了日本，1 件 3 年以上才到，1 件至今没到或被卡住；进来又退出的 1 件。");
    expect(baseSentence("food", categoryBase([]))).toContain("还没有");
  });
});

describe("核实只许往更差改", () => {
  it("noUpgrade：往更成的提不认，往更差的降可以", () => {
    expect(noUpgrade("niche", "widespread")).toBe("niche");
    expect(noUpgrade("partial", "widespread")).toBe("partial");
    expect(noUpgrade("blocked", "niche")).toBe("blocked");
    expect(noUpgrade("widespread", "partial")).toBe("partial");
    expect(noUpgrade("niche", "exited")).toBe("exited");
  });
});

describe("裁判过没过", () => {
  it("unprovenClaims：三样里每一样都要有一条原文被判证明了它", () => {
    expect(unprovenClaims([{ proves: "origin" }, { proves: "japan" }, { proves: "outcome" }, { proves: null }])).toEqual([]);
    expect(unprovenClaims([{ proves: "japan" }, { proves: null }, {}])).toEqual(["origin", "outcome"]);
  });

  it("countedCases：没过裁判的不算，没判过、裁判不可用的照算", () => {
    const cases = [{ judge_status: "passed" as const }, { judge_status: "failed" as const }, { judge_status: null }, { judge_status: "unavailable" as const }];
    expect(countedCases(cases)).toHaveLength(3);
  });
});

describe("lagBuckets", () => {
  it("counts each bucket and puts not-arrived last", () => {
    const out = lagBuckets([{ lag_months: 6 }, { lag_months: 12 }, { lag_months: 30 }, { lag_months: 61 }, { lag_months: null }]);
    expect(out.map((b) => b.value)).toEqual([2, 1, 0, 1, 1]);
    expect(out[out.length - 1].label).toBe("至今没到");
  });
});

describe("atlasTimeline", () => {
  const base = { outcome: "partial" as const, judge_status: "passed" as const };
  it("places rows on a year axis and draws not-arrived cases to today", () => {
    const t = atlasTimeline(
      [
        { ...base, id: "b", thing: "扫码支付", origin: "china", origin_date: "2014-01", japan_date: "2016-01", lag_months: 24 },
        { ...base, id: "a", thing: "共享单车", origin: "china", origin_date: "2016", japan_date: null, lag_months: null, outcome: "absent" },
      ],
      "2026-10-21"
    )!;
    expect(t.rows.map((r) => r.id)).toEqual(["b", "a"]);
    expect(t.rows[0].from).toBe(0);
    expect(t.rows[0].arrived).toBe(true);
    expect(t.rows[1].arrived).toBe(false);
    expect(t.rows[1].to).toBe(t.today);
    expect(t.ticks[0]).toEqual({ year: 2014, at: 0 });
    expect(t.ticks[t.ticks.length - 1].year).toBe(2026);
    expect(t.today).toBeGreaterThan(t.ticks[t.ticks.length - 1].at);
    expect(t.ticks.every((x) => x.year % 2 === 0)).toBe(true);
  });

  it("skips unreadable dates and Japan-earlier cases, dims judge failures", () => {
    const t = atlasTimeline(
      [
        { ...base, id: "x", thing: "x", origin: "us", origin_date: "某年", japan_date: null, lag_months: null },
        { ...base, id: "y", thing: "y", origin: "us", origin_date: "2020-05", japan_date: "2019-01", lag_months: null },
        { ...base, id: "z", thing: "z", origin: "us", origin_date: "2020-05", japan_date: "2021-05", lag_months: 12, judge_status: "failed" },
      ],
      "2026-10-21"
    )!;
    expect(t.rows.map((r) => r.id)).toEqual(["z"]);
    expect(t.rows[0].counted).toBe(false);
    expect(t.rows[0].text).toContain("不算进统计");
  });

  it("returns null when nothing can be drawn", () => {
    expect(atlasTimeline([], "2026-10-21")).toBeNull();
  });
});
