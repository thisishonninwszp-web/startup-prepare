// 自我假设的档位规则。
//
// 这个文件是整个 /self 模块的守门人：档位怎么升、怎么降、什么时候归档，
// 全部写死在这里，AI 只有提名假设的权力，不参与判定，也不输出任何数字。
//
// 核心规则（宪法原则 1 的例外条款要求数值由代码算出，不由 AI 给出）：
//   升档  只由 E5 驱动 —— 一条已到期且命中的事前预测。
//         E1–E4 的证据只能扩大适用范围，不能升档。
//         理由：靠"又找到一条支持证据"升档，等于允许系统讨好用户；
//         押注在先、挨打在后，才是唯一无法作弊的路径。
//   降档  连续 2 条已结算预测落空 → 直接掉回 hunch。
//         反证权重大于正证，因为搜索过程本身系统性偏向正证。
//   归档  距最后一条证据超过 12 个月 → archived（不是推翻，是过期）。

export const SELF_TIERS = [
  "hunch",
  "working",
  "load_bearing",
  "refuted",
  "archived",
] as const;

export type SelfTier = (typeof SELF_TIERS)[number];

export const SELF_HYPOTHESIS_KINDS = [
  "trait",
  "state",
  "context_behavior",
  "skill",
  "preference",
  "value",
  "motivation",
] as const;

export type SelfHypothesisKind = (typeof SELF_HYPOTHESIS_KINDS)[number];

export const WINDOW_GRADES = ["E1", "E2", "E3", "E4"] as const;
export type WindowGrade = (typeof WINDOW_GRADES)[number];

export type SelfWindow = {
  occurred_on: string; // YYYY-MM-DD
  context_key: string;
  outcome: "hit" | "miss";
  grade: WindowGrade;
  cost_paid?: string | null;
};

export type SelfPrediction = {
  due_at: string; // ISO
  outcome: "pending" | "hit" | "miss";
  resolved_at?: string | null;
};

// 升档阶梯。refuted / archived 是终态，不在阶梯上。
const LADDER: SelfTier[] = ["hunch", "working", "load_bearing"];

const MS_PER_DAY = 86_400_000;
const ARCHIVE_AFTER_DAYS = 365;
// 少于 5 个触发窗口时不显示比率，只显示样本数：
// n=2 的 "100%" 比没有数字更容易误导人。
export const MIN_WINDOWS_FOR_RATE = 5;

/** 触发率：符合触发条件的情境中，该行为实际出现的比例。有分母才允许显示。 */
export function computeIntensity(windows: SelfWindow[]): {
  hits: number;
  total: number;
  rate: number | null;
  displayable: boolean;
} {
  const total = windows.length;
  const hits = windows.filter((w) => w.outcome === "hit").length;
  const displayable = total >= MIN_WINDOWS_FOR_RATE;
  return {
    hits,
    total,
    rate: displayable ? Math.round((hits / total) * 100) : null,
    displayable,
  };
}

/** 观察到该行为的不同情境数。只在一类情境里重复，不算跨情境。 */
export function contextCount(windows: SelfWindow[]): number {
  const keys = new Set(
    windows
      .filter((w) => w.outcome === "hit")
      .map((w) => w.context_key.trim())
      .filter((k) => k.length > 0)
  );
  return keys.size;
}

export type PromotionGate = {
  ok: boolean;
  missing: string[];
};

/**
 * 不同 kind 的证据门槛不同。默认归入 context_behavior 是有意的：
 * 大多数被当成"特质"的东西，真身是"在某类条件下的行为"，
 * 升级为 trait 需要举证，不是默认。
 */
export function promotionGate(
  kind: SelfHypothesisKind,
  target: SelfTier,
  windows: SelfWindow[]
): PromotionGate {
  const missing: string[] = [];
  const strong = windows.filter(
    (w) => w.outcome === "hit" && (w.grade === "E3" || w.grade === "E4")
  ).length;
  const contexts = contextCount(windows);

  if (windows.length < MIN_WINDOWS_FOR_RATE) {
    missing.push(`触发窗口需 ≥${MIN_WINDOWS_FOR_RATE}（当前 ${windows.length}）`);
  }

  // 动机不可直接观测，只是多条行为的最简解释，永远停在工作假设。
  if (kind === "motivation" && target === "load_bearing") {
    missing.push("动机类假设不可承重：它只是对行为的最简解释，不是观察");
  }

  // 状态有起止时间，本就不该被当成稳定结论。
  if (kind === "state" && target !== "hunch") {
    missing.push("状态类假设不升档：它描述的是一段时期，不是这个人");
  }

  if (kind === "trait") {
    if (contexts < 3) missing.push(`特质需跨 ≥3 类情境（当前 ${contexts}）`);
    if (strong < 2) missing.push(`特质需 ≥2 条 E3 以上证据（当前 ${strong}）`);
  }

  if (kind === "value") {
    const withCost = windows.filter(
      (w) => w.outcome === "hit" && (w.cost_paid ?? "").trim().length > 0
    ).length;
    // 没付过代价的"价值观"是 preference，写成 value 就是自我美化。
    if (withCost < 1) missing.push("价值观需 ≥1 条付出过代价的证据");
  }

  return { ok: missing.length === 0, missing };
}

export type TierEvaluation = {
  tier: SelfTier;
  changed: boolean;
  reasons: string[];
};

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.floor((to - from) / MS_PER_DAY);
}

function lastEvidenceDate(
  windows: SelfWindow[],
  predictions: SelfPrediction[]
): string | null {
  const dates: string[] = [
    ...windows.map((w) => w.occurred_on),
    ...predictions
      .filter((p) => p.outcome !== "pending" && p.resolved_at)
      .map((p) => p.resolved_at as string),
  ];
  if (dates.length === 0) return null;
  return dates.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b));
}

/** 已结算的预测，按结算时间升序。 */
function settledPredictions(predictions: SelfPrediction[]): SelfPrediction[] {
  return predictions
    .filter((p) => p.outcome === "hit" || p.outcome === "miss")
    .sort(
      (a, b) =>
        Date.parse(a.resolved_at ?? a.due_at) -
        Date.parse(b.resolved_at ?? b.due_at)
    );
}

export function evaluateTier(input: {
  kind: SelfHypothesisKind;
  currentTier: SelfTier;
  windows: SelfWindow[];
  predictions: SelfPrediction[];
  today: string; // YYYY-MM-DD
}): TierEvaluation {
  const { kind, currentTier, windows, predictions, today } = input;
  const keep = (reason: string): TierEvaluation => ({
    tier: currentTier,
    changed: false,
    reasons: [reason],
  });

  // 被推翻的假设保留原状：它是"我曾经这样看自己"的时间序列，比当前结论更有价值。
  if (currentTier === "refuted") return keep("已推翻，保留记录");
  if (currentTier === "archived") return keep("已归档");

  const settled = settledPredictions(predictions);

  // 降档优先于升档：同一轮里既有命中也有连续落空时，先认落空。
  const lastTwo = settled.slice(-2);
  if (lastTwo.length === 2 && lastTwo.every((p) => p.outcome === "miss")) {
    if (currentTier === "hunch") return keep("连续 2 次落空，已在最低档");
    return {
      tier: "hunch",
      changed: true,
      reasons: ["基于它的预测连续 2 次落空 → 掉回猜想，并需要给出替代解释"],
    };
  }

  const lastEvidence = lastEvidenceDate(windows, predictions);
  if (lastEvidence && daysBetween(lastEvidence, today) > ARCHIVE_AFTER_DAYS) {
    return {
      tier: "archived",
      changed: true,
      reasons: [`距最后一条证据 ${daysBetween(lastEvidence, today)} 天 → 自动归档`],
    };
  }

  const index = LADDER.indexOf(currentTier);
  if (index < 0 || index === LADDER.length - 1) {
    return keep("已在最高档");
  }

  // 每升一档要多一条命中的事前预测：working 需 1 条，load_bearing 需 2 条。
  // 用累计命中数而不是"自上次升档以来"，档位就成了证据的纯函数，
  // 不依赖任何升降历史，重算多少次结果都一样。
  const hits = settled.filter((p) => p.outcome === "hit").length;
  const target = LADDER[index + 1];
  const required = index + 1;
  if (hits < required) {
    return keep(
      `升档只由已命中的事前预测驱动：需 ${required} 条，当前 ${hits} 条`
    );
  }

  const gate = promotionGate(kind, target, windows);
  if (!gate.ok) {
    return { tier: currentTier, changed: false, reasons: gate.missing };
  }

  return {
    tier: target,
    changed: true,
    reasons: [`一条事前预测命中，且证据门槛已满足 → 升至 ${target}`],
  };
}
