import { describe, expect, it } from "vitest";
import {
  applyPlatt,
  backtestReport,
  binPoints,
  crossValidated,
  describePlatt,
  drillStats,
  fitLogistic,
  fitPlatt,
  logit,
  sigmoid,
  usableCalibration,
  type BacktestRow,
} from "./calibration-shared";

/** 固定种子的随机数（测试每次一样）。 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** 造一批题：真实概率 q 随机，AI 说的是 sigmoid(k · logit(q))（k > 1 就是说得太满），结果按 q 抽。 */
function synthetic(n: number, k: number, seed = 1): BacktestRow[] {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const q = 0.05 + r() * 0.9;
    return { id: String(i), ai: sigmoid(k * logit(q)), market: q, y: r() < q };
  });
}

describe("逻辑回归和校准", () => {
  it("学得回造数据时用的参数", () => {
    const r = rng(7);
    const xs: number[][] = [];
    const ys: boolean[] = [];
    for (let i = 0; i < 4000; i++) {
      const x = r() * 6 - 3;
      xs.push([x]);
      ys.push(r() < sigmoid(0.5 + 1.5 * x));
    }
    const [b, a] = fitLogistic(xs, ys);
    expect(b).toBeCloseTo(0.5, 0);
    expect(a).toBeCloseTo(1.5, 0);
  });

  it("AI 说得太满时，学到的斜率小于 1，校准后在没见过的题上更准", () => {
    const rows = synthetic(600, 2.5);
    const c = fitPlatt(rows.map((r) => ({ p: r.ai, y: r.y })));
    expect(c.a).toBeLessThan(0.7);
    const report = backtestReport(rows);
    expect(report.calibratedBrier).not.toBeNull();
    expect(report.calibratedBrier!).toBeLessThan(report.aiBrier);
    expect(usableCalibration(report)).not.toBeNull();
    expect(describePlatt(report.platt!)).toContain("说得太满");
  });

  it("合成：市场就是真实概率时，市场的权重大、AI 的权重小", () => {
    const report = backtestReport(synthetic(600, 2.5, 3));
    expect(report.combo).not.toBeNull();
    expect(report.combo!.wMarket).toBeGreaterThan(report.combo!.wAi);
    expect(report.suspicious).toBe(false);
  });

  it("题不够时不学", () => {
    const report = backtestReport(synthetic(60, 2.5));
    expect(report.platt).toBeNull();
    expect(report.combo).toBeNull();
    expect(usableCalibration(report)).toBeNull();
  });

  it("AI 比当时的市场准太多：标出来（可能见过答案）", () => {
    const rows = synthetic(200, 1, 5).map((r) => ({ ...r, ai: r.y ? 0.9 : 0.1 }));
    expect(backtestReport(rows).suspicious).toBe(true);
  });

  it("恒等校准不改数", () => {
    expect(applyPlatt(0.7, { a: 1, b: 0 })).toBeCloseTo(0.7, 6);
  });

  it("交叉验证：每道题的预测都来自没学过它的那一份", () => {
    const rows = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const preds = crossValidated(rows, 5, (train) => (row) => (train.includes(row) ? -1 : 1));
    expect(preds.every((p) => p === 1)).toBe(true);
  });

  it("五格", () => {
    const bins = binPoints([
      { p: 0.1, y: false },
      { p: 0.15, y: true },
      { p: 0.95, y: true },
    ]);
    expect(bins.map((b) => b.n)).toEqual([2, 0, 0, 0, 1]);
    expect(bins[0].happened).toBe(1);
  });
});

describe("他的校准练习成绩", () => {
  it("记得结果的不计分；满 10 道才给分；先写基准率的那些比一比调整有没有用", () => {
    const answers = Array.from({ length: 12 }, (_, i) => ({ probability: 0.7, baseRate: 0.5, knew: false, y: i % 2 === 0, market: 0.6, ai: null }));
    answers.push({ probability: null as unknown as number, baseRate: null as unknown as number, knew: true, y: true, market: 0.5, ai: null });
    const s = drillStats(answers);
    expect(s.n).toBe(12);
    expect(s.knew).toBe(1);
    expect(s.you).toBeCloseTo((0.3 ** 2 + 0.7 ** 2) / 2, 6);
    expect(s.ai).toBeNull();
    expect(s.baseOnly?.base).toBeCloseTo(0.25, 6);
    expect(drillStats(answers.slice(0, 5)).you).toBeNull();
  });
});
