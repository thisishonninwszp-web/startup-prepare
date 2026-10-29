import { describe, expect, it } from "vitest";
import { compareSearchImports, decodeSearchFile, parseSearchImport } from "./imports";

const context = { region: "JP", language: "ja", timeframe: "2026-01至2026-02" };
describe("search observation imports", () => {
  it("reads Trends metadata and preserves zero, suppressed values and missing cells", () => {
    const p = parseSearchImport("trends_web", 'Category: All categories\n\nWeek,旅館: (Japan),ホテル: (Japan)\n2026-01-04,0,<1\n2026-01-11,100,\n', context);
    expect(p.canConfirm).toBe(true);
    expect(p.points.map((v) => [v.value, v.state])).toEqual([[0, "value"], [null, "below_threshold"], [100, "value"], [null, "missing"]]);
    expect(p.points[1].upperBound).toBe(1);
    expect(p.points[0].term).toBe("旅館: (Japan)");
  });
  it("reads Japanese Trends date headers and quoted keyword labels", () => {
    const p = parseSearchImport("trends_web", '\uFEFF週,"予約,変更"\n2026-01-04,42', context);
    expect(p.points[0]).toMatchObject({ term: "予約,変更", value: 42 });
  });
  it("rejects impossible dates and unexpected extra columns without silently losing rows", () => {
    const p = parseSearchImport("trends_web", 'Day,a\n2026-02-30,12\n2026-03-01,1,2', context);
    expect(p.canConfirm).toBe(false); expect(p.issues).toHaveLength(2);
  });
  it("does not accept nonnumeric or out of range Trends observations", () => {
    const p = parseSearchImport("trends_web", 'Month,a\n2026-01,101\n2026-02,hello', context);
    expect(p.canConfirm).toBe(false); expect(p.points).toHaveLength(0);
  });
  it("accepts Ads TSV and preserves estimates and ranges without manufacturing a midpoint", () => {
    const p = parseSearchImport("ads_planner", 'Keyword\tAvg. monthly searches\n旅館\t1K – 10K\nホテル\t0\n夜間\t—', context);
    expect(p.canConfirm).toBe(true);
    expect(p.points[0]).toMatchObject({ value: null, lowerBound: 1000, upperBound: 10000, state: "range" });
    expect(p.points[1].value).toBe(0); expect(p.points[2].state).toBe("missing");
  });
  it("handles quoted CSV thousands and escaped quotes", () => {
    const p = parseSearchImport("ads_planner", 'Keyword,Avg. monthly searches\n"宿泊 \\"相談\\"","1,200"'.replaceAll('\\"', '""'), context);
    expect(p.canConfirm).toBe(true); expect(p.points[0].value).toBe(1200);
  });
  it("requires an explicit collection context", () => {
    expect(parseSearchImport("trends_web", "Week,a\n2026-01-04,1", { ...context, region: "" }).canConfirm).toBe(false);
  });
  it("rejects unsupported formats, duplicate headers and duplicate observations", () => {
    expect(parseSearchImport("ads_planner", "query,count\na,5", context).canConfirm).toBe(false);
    expect(parseSearchImport("trends_web", "Week,a,a\n2026-01-04,1,2", context).canConfirm).toBe(false);
    expect(parseSearchImport("trends_web", "Week,a\n2026-01-04,1\n2026-01-04,2", context).canConfirm).toBe(false);
  });
  it("rejects malformed quoted input and excessive rows", () => {
    expect(parseSearchImport("ads_planner", 'Keyword,Avg. monthly searches\n"unterminated,2', context).canConfirm).toBe(false);
    expect(parseSearchImport("trends_web", "Week,a\n" + "2026-01-04,1\n".repeat(1001), context).canConfirm).toBe(false);
  });
  it("decodes UTF16 TSV exports and rejects malformed encodings", () => {
    const text = "Keyword\tAvg. monthly searches\n旅館\t20";
    const bytes = new Uint8Array(2 + text.length * 2); bytes.set([255, 254]);
    for (let i = 0; i < text.length; i++) { bytes[2 + i * 2] = text.charCodeAt(i) & 255; bytes[3 + i * 2] = text.charCodeAt(i) >> 8; }
    expect(parseSearchImport("ads_planner", decodeSearchFile(bytes), context).points[0].value).toBe(20);
    expect(() => decodeSearchFile(new Uint8Array([255, 254, 10]))).toThrow();
  });
  it("does not reinterpret malformed grouped numeric text as a different quantity", () => {
    expect(parseSearchImport("ads_planner", 'Keyword,Avg. monthly searches\na,"1,2"', context).canConfirm).toBe(false);
    expect(parseSearchImport("trends_web", 'Week,a\n2026-01-04,1K', context).canConfirm).toBe(false);
  });
  it("allows comparison only within identical metric, region, time range and Trends query group", () => {
    const a = parseSearchImport("trends_web", "Week,a\n2026-01-04,1", context);
    expect(compareSearchImports(a, a).comparable).toBe(true);
    expect(compareSearchImports(a, parseSearchImport("trends_web", "Week,a\n2026-01-04,1", { ...context, region: "CN" })).comparable).toBe(false);
    expect(compareSearchImports(a, parseSearchImport("trends_web", "Week,a,b\n2026-01-04,1,2", context)).comparable).toBe(false);
    expect(compareSearchImports(a, parseSearchImport("ads_planner", "Keyword,Avg. monthly searches\na,1", context)).comparable).toBe(false);
  });
  it("does not compare exports with different source category metadata", () => {
    const a = parseSearchImport("trends_web", "Category: All categories\n\nWeek,a\n2026-01-04,1", context);
    const b = parseSearchImport("trends_web", "Category: Travel\n\nWeek,a\n2026-01-04,1", context);
    expect(compareSearchImports(a, b).comparable).toBe(false);
  });
});
