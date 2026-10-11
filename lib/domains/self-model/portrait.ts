/**
 * 写法画像：Jev 读你自己写下的字，在四个维度上各给一个档位分布。
 *
 * 这是 CLAUDE.md 原则 1 的例外二：数字原样来自 Jev，不是代码从行为算的。
 * 所以它必须一直说清楚自己量的是什么 —— 你怎么讲自己，不是你做了什么。
 * 这里只放纯逻辑：维度怎么叫、原文怎么挑、结果怎么读。问 Jev 的话在 lib/ai/portrait.ts。
 */

export const PORTRAIT_AXES = [
  {
    key: "attribution",
    name: "归因方向",
    low: "怪外面",
    high: "找自己",
    hint: "事情没成的时候，你写的原因是别人、时间、运气，还是你自己当时的决定。",
  },
  {
    key: "commitment",
    name: "承诺的具体度",
    low: "争取、多做",
    high: "谁、什么、哪天",
    hint: "你写计划时，是「争取多接触用户」，还是「周四前约 3 个人聊」。",
  },
  {
    key: "doing",
    name: "做事 vs 想事",
    low: "多是想法",
    high: "多是做了的事",
    hint: "你写下的东西里，已经做了的事和结果多，还是打算、分析、想法多。",
  },
  {
    key: "risk",
    name: "对风险的姿态",
    low: "先等想清楚",
    high: "先试一下",
    hint: "遇到拿不准的事，你写的是先小步试，还是先等条件成熟。",
  },
] as const;

export type PortraitAxisKey = (typeof PORTRAIT_AXES)[number]["key"];

/** 每个维度的档位数（0..4）。 */
export const PORTRAIT_LEVELS = 5;

export type WritingKind = "retro" | "observation" | "declaration" | "learned";

export const WRITING_KIND_LABELS: Record<WritingKind, string> = {
  retro: "周复盘里你说的",
  observation: "随手捕捉",
  declaration: "自我陈述",
  learned: "学到了",
};

export type Writing = { kind: WritingKind; date: string; text: string };

export type PortraitAxisResult = {
  /** 期望档位，0..4，可以落在两档之间。 */
  score: number;
  /** Jev 报的把握。 */
  confidence: number;
  /** 每一档的概率，下标即档位。 */
  probabilities: number[];
  /** 「这批文字里有没有讲到这件事」的概率。低于门槛就是读不出来。 */
  evidence: number;
};

export type PortraitAnswers = Record<PortraitAxisKey, PortraitAxisResult>;

/** 少于这么多段，Jev 读到的只是几句话，不叫画像。 */
export const MIN_WRITINGS = 5;
/** 一次送去的总字数上限。 */
export const MAX_CHARS = 12_000;
/** 单段超长就截断，免得一篇长文吃掉整份额度。 */
export const MAX_CHARS_PER_ITEM = 600;
/** 有依据的门槛。 */
export const EVIDENCE_THRESHOLD = 0.5;

export type WritingSelection = {
  picked: Writing[];
  counts: Record<WritingKind, number>;
  chars: number;
};

/** 从新到旧挑，挑满为止。 */
export function selectWritings(
  writings: Writing[],
  maxChars: number = MAX_CHARS,
  perItem: number = MAX_CHARS_PER_ITEM
): WritingSelection {
  const counts: Record<WritingKind, number> = {
    retro: 0,
    observation: 0,
    declaration: 0,
    learned: 0,
  };
  const picked: Writing[] = [];
  let chars = 0;
  const sorted = writings
    .map((item) => ({ ...item, text: item.text.trim() }))
    .filter((item) => item.text.length > 0)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  for (const item of sorted) {
    const text =
      item.text.length > perItem ? `${item.text.slice(0, perItem)}…` : item.text;
    if (chars + text.length > maxChars) break;
    picked.push({ ...item, text });
    counts[item.kind] += 1;
    chars += text.length;
  }
  return { picked, counts, chars };
}

export function renderWritings(picked: Writing[]): string {
  return [
    "以下是同一个人在不同场合亲手写下的文字，按时间从新到旧。",
    ...picked.map(
      (item) => `[${item.date}｜${WRITING_KIND_LABELS[item.kind]}] ${item.text}`
    ),
  ].join("\n");
}

export function hasEvidence(result: PortraitAxisResult): boolean {
  return result.evidence >= EVIDENCE_THRESHOLD;
}

/** 和上一份比，档位挪了多少。上一份没有或两边有一边读不出来，就不比。 */
export function scoreShift(
  current: PortraitAxisResult,
  previous: PortraitAxisResult | undefined
): number | null {
  if (!previous || !hasEvidence(current) || !hasEvidence(previous)) return null;
  return Math.round((current.score - previous.score) * 10) / 10;
}

export function formatScore(score: number): string {
  return score.toFixed(1);
}

export function formatPercent(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}
