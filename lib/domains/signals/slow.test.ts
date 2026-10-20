import { describe, expect, it } from "vitest";
import { changeOver, changeText, fetchSlowSeries, needsUpdate, parseEstat, parseFx, parseWorldBank, slowSummary, SLOW_VARIABLES, timeOf } from "./slow";

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

describe("e-Stat", () => {
  it("只留月度的点，从旧到新，乘上换算倍数；年份合计和缺值跳过", () => {
    const json = { GET_STATS_DATA: { STATISTICAL_DATA: { DATA_INF: { VALUE: [
      { "@time": "2026000909", $: "3917" },
      { "@time": "2026000000", $: "3900" },
      { "@time": "2026000808", $: "3896" },
      { "@time": "2026000707", $: "-" },
    ] } } } };
    expect(parseEstat(json, 0.1).map((p) => [p.date, Math.round(p.value * 10) / 10])).toEqual([["2026-08", 389.6], ["2026-09", 391.7]]);
    expect(parseEstat(null)).toEqual([]);
  });
});

describe("慢变量：给往下推用的那句数字", () => {
  const variable = SLOW_VARIABLES.find((v) => v.key === "unemployment")!;
  const monthly = (values: number[]) => ({
    variable,
    sourceLabel: "x",
    sourceUrl: "",
    points: values.map((value, i) => ({ date: `${2020 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`, value })),
  });

  it("slowSummary：现在多少、比一年前、比五年前；点不够的那一段不写", () => {
    const series = monthly(Array.from({ length: 13 }, (_, i) => (i === 12 ? 2.6 : 2.4)));
    expect(slowSummary(series)).toBe("现在 2.6 %（2021-01）；比一年前（2020-01）+0.2 个百分点");
    expect(slowSummary(monthly([]))).toBeNull();
  });

  it("changeText：四舍五入后是 0 的说几乎没变", () => {
    expect(changeText(monthly([2.41, 2.44]), 1, "比上个月")).toBe("比上个月（2020-01）几乎没变");
  });
});

describe("慢变量：手填的那几个", () => {
  const tables = SLOW_VARIABLES.filter((v) => v.source.type === "table");

  it("手填的每一组：年份不重复、从旧到新、数都是正的", () => {
    expect(tables.map((v) => v.key)).toEqual(["visitors", "visitors_cn", "cn_residents", "min_wage", "cashless"]);
    for (const v of tables) {
      if (v.source.type !== "table") continue;
      const dates = v.source.points.map((p) => p.date);
      expect(new Set(dates).size).toBe(dates.length);
      expect([...dates].sort()).toEqual(dates);
      expect(v.source.points.every((p) => p.value > 0)).toBe(true);
    }
  });

  it("手填的不用上网，按年份排好；没核对到的年份空着", async () => {
    const cn = await fetchSlowSeries(SLOW_VARIABLES.find((v) => v.key === "visitors_cn")!);
    expect(cn.points.map((p) => p.date)).toEqual(["2019", "2022", "2023", "2024", "2025"]);
    expect(slowSummary(cn)).toBe("现在 909.6 万人（2025 年）；比一年前（2024）+211.5 万人");
  });

  it("timeOf：年份和年月都换成年份上的位置", () => {
    expect(timeOf("2024")).toBe(2024);
    expect(timeOf("2024-07")).toBe(2024.5);
    expect(timeOf("2024-01-15")).toBe(2024);
  });

  it("needsUpdate：手填的最近一年过了一年多还没填才提醒；接口取的不提醒", async () => {
    const cashless = await fetchSlowSeries(SLOW_VARIABLES.find((v) => v.key === "cashless")!);
    expect(needsUpdate(cashless, new Date("2025-06-01"))).toBe(false);
    expect(needsUpdate(cashless, new Date("2026-10-20"))).toBe(true);
    const usd = { variable: SLOW_VARIABLES.find((v) => v.key === "usdjpy")!, points: [{ date: "2020-01-31", value: 1 }], sourceLabel: "", sourceUrl: "" };
    expect(needsUpdate(usd, new Date("2026-10-20"))).toBe(false);
  });
});
