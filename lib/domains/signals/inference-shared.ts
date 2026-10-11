/**
 * 往下推（多层推论）里浏览器端也要用的部分：节点类型、层数上限、三档可能性的叫法。不碰数据库。
 */

/** 五档。"possible" 沿用早期三档时的键名，意思是"一半一半"。 */
export type InferenceLikelihood = "very_likely" | "likely" | "possible" | "unlikely" | "very_unlikely";

export type InferenceNode = {
  id: string;
  /** null 表示第一层（直接从新闻推出来的）。 */
  parent_id: string | null;
  /** 第几层，从 1 开始。 */
  depth: number;
  claim: string;
  why: string;
  watch: string;
  likelihood: InferenceLikelihood;
  /** 档位是谁判的：jev（裁判，和写推论的分开）；Jev 不可用时退回 gemini 自己标的。早期数据没有这个字段。 */
  judged_by?: "jev" | "gemini";
  /** Jev 的分布太平、自己也拿不准。只显示这句话，不显示它的数字。 */
  unsure?: boolean;
  /** 用户给的方向（"往广告行业推""如果日元反而贬值"）；这组节点是按它推出来的。 */
  direction?: string;
  /** 用户在这一步上算过的贝叶斯（先验和证据强度都由用户确认）。 */
  bayes?: BayesState;
  /** 上网查到的事实。来源和原文摘录由代码核对过；Jev 判档时看的就是这些，不看"为什么"。 */
  evidence?: InferenceEvidence[];
};

export type InferenceEvidence = {
  url: string;
  title: string;
  fact: string;
  excerpt: string;
  stance: "supports" | "contradicts" | "context";
};

export const STANCE_LABELS: Record<InferenceEvidence["stance"], string> = {
  supports: "支持",
  contradicts: "反对",
  context: "背景",
};

const ORDER: InferenceLikelihood[] = ["very_likely", "likely", "possible", "unlikely", "very_unlikely"];

/** 同一层按很可能 → 很不可能排。 */
export function byLikelihood(a: InferenceNode, b: InferenceNode): number {
  return ORDER.indexOf(a.likelihood) - ORDER.indexOf(b.likelihood);
}

/** 最多推几层。每层都假设上一层成立，再往下就基本是在编故事了。 */
export const MAX_INFERENCE_DEPTH = 5;

export const LIKELIHOOD_LABELS: Record<InferenceLikelihood, string> = {
  very_likely: "很可能",
  likely: "较可能",
  possible: "一半一半",
  unlikely: "不太可能",
  very_unlikely: "很不可能",
};

/** 方块填几格（满格 5）。 */
export const LIKELIHOOD_FILLED: Record<InferenceLikelihood, number> = {
  very_likely: 5,
  likely: 4,
  possible: 3,
  unlikely: 2,
  very_unlikely: 1,
};

/** 从根到某个节点的整条链（含它自己）。 */
export function chainTo(nodes: InferenceNode[], id: string | null): InferenceNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const chain: InferenceNode[] = [];
  let cur = id ? byId.get(id) : undefined;
  while (cur) {
    chain.unshift(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return chain;
}

export function childrenOf(nodes: InferenceNode[], parentId: string | null): InferenceNode[] {
  return nodes.filter((n) => n.parent_id === parentId).sort(byLikelihood);
}

// ── 贝叶斯：AI 起粗档草稿 → 用户改 → 代码算 ──────────────────────────────

/** 先验五档。AI 只能选档，不能给精确数字；用户可以换档，也可以拖到任意一个数。 */
export type PriorBucket = "rare" | "low" | "even" | "high" | "common";
export const PRIOR_BUCKETS: { key: PriorBucket; label: string; value: number }[] = [
  { key: "rare", label: "很少见", value: 0.1 },
  { key: "low", label: "偏少", value: 0.25 },
  { key: "even", label: "一半一半", value: 0.5 },
  { key: "high", label: "偏多", value: 0.75 },
  { key: "common", label: "很常见", value: 0.9 },
];

/** 证据强度五档，对应似然比（这条证据在"会发生"时比"不会发生"时更常见几倍）。 */
export type EvidenceStrength = "strong_for" | "for" | "neutral" | "against" | "strong_against";
export const EVIDENCE_STRENGTHS: { key: EvidenceStrength; label: string; ratio: number }[] = [
  { key: "strong_for", label: "强烈支持", ratio: 3 },
  { key: "for", label: "支持", ratio: 1.5 },
  { key: "neutral", label: "无关", ratio: 1 },
  { key: "against", label: "反对", ratio: 1 / 1.5 },
  { key: "strong_against", label: "强烈反对", ratio: 1 / 3 },
];

export type BayesEvidence = {
  text: string;
  why: string;
  /** AI 草稿给的档，或用户点的快捷档。 */
  strength: EvidenceStrength;
  /** 用户用滑块细调过的倍数（÷5 到 ×5）；有它就用它，没有就用 strength 对应的倍数。 */
  ratio?: number;
  /** 这条证据来自哪个网页（上网查到的事实才有）。 */
  url?: string;
};

export const MIN_RATIO = 1 / 5;
export const MAX_RATIO = 5;

export function clampRatio(r: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, Number.isFinite(r) && r > 0 ? r : 1));
}

/** 这条证据实际用的倍数。 */
export function evidenceRatio(e: Pick<BayesEvidence, "strength" | "ratio">): number {
  return e.ratio !== undefined ? clampRatio(e.ratio) : ratioOf(e.strength);
}

export type BayesState = {
  /** 先验：用户确认过的数（0.05–0.95）。 */
  prior: number;
  priorWhy: string;
  evidence: BayesEvidence[];
  /** AI 起的草稿原样留着，方便对照"我改了哪些"。 */
  draft: { prior: PriorBucket; evidence: EvidenceStrength[] };
};

export function ratioOf(strength: EvidenceStrength): number {
  return EVIDENCE_STRENGTHS.find((s) => s.key === strength)?.ratio ?? 1;
}

export function priorValue(bucket: PriorBucket): number {
  return PRIOR_BUCKETS.find((b) => b.key === bucket)?.value ?? 0.5;
}

/** 后验 = 先验赔率 × 每条证据的似然比，再换回概率。 */
export function posterior(prior: number, ratios: number[]): number {
  const p = Math.min(0.99, Math.max(0.01, prior));
  const odds = (p / (1 - p)) * ratios.reduce((acc, r) => acc * r, 1);
  return odds / (1 + odds);
}

export function formatPercent(p: number): string {
  return `${Math.round(p * 100)}%`;
}
