import { describe, expect, it } from "vitest";
import { baseSentence, categoryBase, lagLabel, lagMonths, monthIndex } from "./atlas-shared";

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
