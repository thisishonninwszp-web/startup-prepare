import { describe, expect, it } from "vitest";
import { changeOver, parseFx, parseWorldBank, SLOW_VARIABLES } from "./slow";

describe("慢变量", () => {
  it("世界银行：去掉空值，从旧到新", () => {
    const json = [{ page: 1 }, [{ date: "2025", value: 30 }, { date: "2024", value: null }, { date: "2023", value: 29.5 }]];
    expect(parseWorldBank(json)).toEqual([{ date: "2023", value: 29.5 }, { date: "2025", value: 30 }]);
    expect(parseWorldBank(null)).toEqual([]);
  });

  it("汇率：每个月只留最后一个交易日", () => {
    const json = { rates: { "2026-09-01": { JPY: 160 }, "2026-09-30": { JPY: 150 }, "2026-10-09": { JPY: 153 } } };
    expect(parseFx(json, "JPY")).toEqual([{ date: "2026-09-30", value: 150 }, { date: "2026-10-09", value: 153 }]);
  });

  it("和 n 个点之前比；点不够就不比", () => {
    const pts = [{ date: "2023", value: 10 }, { date: "2024", value: 12 }, { date: "2025", value: 11 }];
    expect(changeOver(pts, 1)).toEqual({ from: { date: "2024", value: 12 }, delta: -1 });
    expect(changeOver(pts, 5)).toBeNull();
  });

  it("每个慢变量都写了为什么值得盯", () => {
    for (const v of SLOW_VARIABLES) expect(v.why.length).toBeGreaterThan(10);
  });
});
