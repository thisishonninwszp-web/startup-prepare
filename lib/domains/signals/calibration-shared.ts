/**
 * 校准（原则 1 例外四：概率和分数只用于对世界事件的预测）。不碰数据库、不碰网络。
 *
 * 「训练一个模型」在这里是两件小事，几百道对过账的题就够学：
 * 1. AI 的校准：AI 说七成的事，历史上实际发生几成 —— 学一条曲线把它的数往回拉（Platt：在对数几率上乘一个斜率、加一个偏移）。
 * 2. 合成：AI 和市场的数合成一个时各该听多少（逻辑回归的两个权重）。
 * 学得对不对只看交叉验证：每次留一部分题不给它学，在这些没见过的题上算分。在没见过的题上没变好，就不用。
 */

export type Point = { p: number; y: boolean };

const EPS = 0.01;
export const clampP = (p: number) => Math.min(1 - EPS, Math.max(EPS, p));
export const logit = (p: number) => Math.log(clampP(p) / (1 - clampP(p)));
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** 学校准、合成至少要这么多道对过账的题（少了学出来的多半是运气）。 */
export const CALIBRATION_MIN = 100;
/** 分数、比率满这么多道才显示（同例外四的门槛）。 */
export const SCORE_MIN = 10;
export const BIN_MIN = 5;

/** 解 Ax = b（高斯消元，选主元）；奇异时返回 null。 */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[pivot][c])) pivot = r;
    if (Math.abs(m[pivot][c]) < 1e-12) return null;
    [m[c], m[pivot]] = [m[pivot], m[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** 逻辑回归（带截距，牛顿法；一点点 L2，样本少时别飞掉）。返回 [截距, w1, w2, …]。 */
export function fitLogistic(xs: number[][], ys: boolean[], l2 = 1e-3, iters = 50): number[] {
  const d = (xs[0]?.length ?? 0) + 1;
  let w = new Array<number>(d).fill(0);
  for (let it = 0; it < iters; it++) {
    const g = new Array<number>(d).fill(0);
    const h = Array.from({ length: d }, () => new Array<number>(d).fill(0));
    for (let i = 0; i < xs.length; i++) {
      const x = [1, ...xs[i]];
      const p = sigmoid(x.reduce((s, xj, j) => s + xj * w[j], 0));
      const r = p - (ys[i] ? 1 : 0);
      const s = Math.max(p * (1 - p), 1e-9);
      for (let j = 0; j < d; j++) {
        g[j] += r * x[j];
        for (let k = 0; k < d; k++) h[j][k] += s * x[j] * x[k];
      }
    }
    for (let j = 1; j < d; j++) {
      g[j] += l2 * w[j];
      h[j][j] += l2;
    }
    const step = solve(h, g);
    if (!step) break;
    w = w.map((wj, j) => wj - step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-9) break;
  }
  return w;
}

export type Platt = { a: number; b: number };

/** 学 AI 的校准：校准后 = sigmoid(a · logit(AI) + b)。a < 1 说明 AI 说得太满，b < 0 说明它偏向说「会」。 */
export function fitPlatt(points: Point[]): Platt {
  const [b, a] = fitLogistic(
    points.map((pt) => [logit(pt.p)]),
    points.map((pt) => pt.y)
  );
  return { a, b };
}

export function applyPlatt(p: number, c: Platt): number {
  return sigmoid(c.a * logit(p) + c.b);
}

export function meanBrier(points: Point[]): number {
  return points.reduce((s, pt) => s + (pt.p - (pt.y ? 1 : 0)) ** 2, 0) / Math.max(points.length, 1);
}

/** k 折交叉验证：第 i 道题分到第 i % k 折；每折用别的折学、在这一折上预测。返回每道题在没被学过时的预测。 */
export function crossValidated<T>(rows: T[], k: number, fit: (train: T[]) => (row: T) => number): number[] {
  const out = new Array<number>(rows.length).fill(NaN);
  for (let f = 0; f < k; f++) {
    const train = rows.filter((_, i) => i % k !== f);
    const predict = fit(train);
    rows.forEach((r, i) => {
      if (i % k === f) out[i] = predict(r);
    });
  }
  return out;
}

export type Bin = { lo: number; hi: number; n: number; happened: number; meanP: number | null };

/** 五格：说 0–20%、20–40%……的各几道、实际发生几道、平均说了几成。 */
export function binPoints(points: Point[]): Bin[] {
  const bins: Bin[] = [0, 0.2, 0.4, 0.6, 0.8].map((lo) => ({ lo, hi: lo + 0.2, n: 0, happened: 0, meanP: null }));
  const sums = bins.map(() => 0);
  for (const pt of points) {
    const i = Math.min(4, Math.floor(pt.p * 5));
    bins[i].n += 1;
    if (pt.y) bins[i].happened += 1;
    sums[i] += pt.p;
  }
  return bins.map((b, i) => ({ ...b, meanP: b.n > 0 ? Math.round((sums[i] / b.n) * 100) / 100 : null }));
}

export type BacktestRow = { id: string; ai: number; market: number | null; y: boolean };

export type BacktestReport = {
  n: number;
  /** 同一批题上的平均分（越小越准）。 */
  aiBrier: number;
  marketBrier: number | null;
  /** 永远说「这批题里会的比例」能拿的分：比它还差就是没用。 */
  baseBrier: number;
  /** 学到的校准（题够才有）。 */
  platt: Platt | null;
  /** 交叉验证下校准后的平均分；比 aiBrier 小才算学到了东西。 */
  calibratedBrier: number | null;
  /** 合成（AI + 市场）的权重和交叉验证下的平均分。 */
  combo: { wAi: number; wMarket: number; brier: number } | null;
  aiBins: Bin[];
  marketBins: Bin[];
  /** AI 比当时的市场准太多：它可能见过答案（知识没停在说的那天）。 */
  suspicious: boolean;
};

/** 回测报告：AI、市场、基准的分，学校准、学合成（都用交叉验证检查）。rows 按固定顺序排好（同样的题每次分到同样的折）。 */
export function backtestReport(rows: BacktestRow[]): BacktestReport {
  const n = rows.length;
  const ai = rows.map((r) => ({ p: r.ai, y: r.y }));
  const withMarket = rows.filter((r): r is BacktestRow & { market: number } => r.market !== null);
  const rate = rows.filter((r) => r.y).length / Math.max(n, 1);
  const aiBrier = meanBrier(ai);
  const marketBrier = withMarket.length > 0 ? meanBrier(withMarket.map((r) => ({ p: r.market, y: r.y }))) : null;

  let platt: Platt | null = null;
  let calibratedBrier: number | null = null;
  let combo: BacktestReport["combo"] = null;
  if (n >= CALIBRATION_MIN) {
    platt = fitPlatt(ai);
    const cv = crossValidated(ai, 5, (train) => {
      const c = fitPlatt(train);
      return (pt) => applyPlatt(pt.p, c);
    });
    calibratedBrier = meanBrier(ai.map((pt, i) => ({ p: cv[i], y: pt.y })));
    if (withMarket.length >= CALIBRATION_MIN) {
      const feats = (r: { ai: number; market: number }) => [logit(r.ai), logit(r.market)];
      const [, wAi, wMarket] = fitLogistic(withMarket.map(feats), withMarket.map((r) => r.y));
      const cvCombo = crossValidated(withMarket, 5, (train) => {
        const w = fitLogistic(train.map(feats), train.map((r) => r.y));
        return (r) => sigmoid(w[0] + w[1] * logit(r.ai) + w[2] * logit(r.market));
      });
      combo = { wAi, wMarket, brier: meanBrier(withMarket.map((r, i) => ({ p: cvCombo[i], y: r.y }))) };
    }
  }
  return {
    n,
    aiBrier,
    marketBrier,
    baseBrier: rate * (1 - rate),
    platt,
    calibratedBrier,
    combo,
    aiBins: binPoints(ai),
    marketBins: binPoints(withMarket.map((r) => ({ p: r.market, y: r.y }))),
    suspicious: n >= 50 && marketBrier !== null && aiBrier < marketBrier - 0.02,
  };
}

/** 校准值得用：题够、而且交叉验证下确实比原来的数准。 */
export function usableCalibration(r: Pick<BacktestReport, "platt" | "calibratedBrier" | "aiBrier">): Platt | null {
  return r.platt && r.calibratedBrier !== null && r.calibratedBrier < r.aiBrier ? r.platt : null;
}

/** 校准学到的东西写成一句人话。 */
export function describePlatt(c: Platt): string {
  const shape = c.a < 0.85 ? "AI 说得太满：它说很有把握的事，实际没那么常发生，要往中间拉" : c.a > 1.15 ? "AI 说得太保守：要往两头推" : "AI 的把握程度大致合适";
  const lean = c.b < -0.2 ? "；整体偏向说「会」" : c.b > 0.2 ? "；整体偏向说「不会」" : "";
  return shape + lean;
}

export type DrillAnswer = { probability: number | null; baseRate: number | null; knew: boolean; y: boolean; market: number | null; ai: number | null };

export type DrillStats = {
  /** 计分的题（不算他记得结果的）。 */
  n: number;
  knew: number;
  you: number | null;
  /** 同一批题上市场、AI 的分（市场、AI 缺的那几道不算）。 */
  market: number | null;
  ai: number | null;
  /** 只写基准率、不调整的话能拿几分（他先写了基准率的那些题）：调整让他更准还是更不准。 */
  baseOnly: { n: number; base: number; adjusted: number } | null;
  bins: Bin[];
};

/** 他在校准练习里的成绩。 */
export function drillStats(answers: DrillAnswer[]): DrillStats {
  const scored = answers.filter((a): a is DrillAnswer & { probability: number } => !a.knew && a.probability !== null);
  const you = scored.map((a) => ({ p: a.probability, y: a.y }));
  const withMarket = scored.filter((a): a is typeof a & { market: number } => a.market !== null);
  const withAi = scored.filter((a): a is typeof a & { ai: number } => a.ai !== null);
  const withBase = scored.filter((a): a is typeof a & { baseRate: number } => a.baseRate !== null);
  const enough = (k: number) => k >= SCORE_MIN;
  return {
    n: scored.length,
    knew: answers.filter((a) => a.knew).length,
    you: enough(you.length) ? meanBrier(you) : null,
    market: enough(withMarket.length) ? meanBrier(withMarket.map((a) => ({ p: a.market, y: a.y }))) : null,
    ai: enough(withAi.length) ? meanBrier(withAi.map((a) => ({ p: a.ai, y: a.y }))) : null,
    baseOnly: enough(withBase.length)
      ? {
          n: withBase.length,
          base: meanBrier(withBase.map((a) => ({ p: a.baseRate, y: a.y }))),
          adjusted: meanBrier(withBase.map((a) => ({ p: a.probability, y: a.y }))),
        }
      : null,
    bins: binPoints(you),
  };
}
