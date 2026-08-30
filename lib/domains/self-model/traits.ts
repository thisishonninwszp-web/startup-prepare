// 特性的品级结算。
//
// 唯一的立场：品级是从修正结构和证据强度**算**出来的，不是谁评的。
// 「双刃」不再是一个形容词 —— 一条特性只要在一个主属性上加、在另一个上减，
// 它就是暗金。这也解释了为什么暗金必须填装备条件：
// 你得知道在什么环境里它的正号大于负号。
//
// 防通胀两道闸：互斥光谱（数据库唯一索引）+ 品级配额（这里）。

import { MAIN_KEYS, type MainKey } from "./panel";

export const RARITIES = [
  "common",
  "magic",
  "rare",
  "epic",
  "legend",
  "set",
  "unique",
] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_LABELS: Record<Rarity, string> = {
  common: "普通",
  magic: "魔法",
  rare: "稀有",
  epic: "史诗",
  legend: "传说",
  set: "套装",
  unique: "暗金",
};

/** 纵向阶梯的配额。套装不设上限——它靠"凑齐"稀缺，不靠配额。 */
export const RARITY_QUOTA: Partial<Record<Rarity, number>> = {
  epic: 2,
  legend: 1,
  unique: 2,
};

export type Polarity = "asset" | "liability" | "double";

export const POLARITY_LABELS: Record<Polarity, string> = {
  asset: "资产",
  liability: "负债",
  double: "双刃",
};

export type TraitModifier = {
  /** panel.ts 里的子属性 key，例 "wis.contact"。 */
  sub: string;
  sign: "plus" | "minus";
  note: string;
};

export type TraitInput = {
  id: string;
  name: string;
  spectrumKey: string;
  modifiers: TraitModifier[];
  backfire: string | null;
  equipNote: string | null;
  setKey: string | null;
  setEffect: string | null;
  refusedOffer: string | null;
  /** 从关联假设借来的证据强度。 */
  evidence: {
    /** 触发窗口总数。 */
    windows: number;
    /** 观察到的不同情境数。 */
    contexts: number;
    /** 已命中的事前预测数。 */
    forecastHits: number;
  };
  status: "held" | "faded";
};

export type Trait = TraitInput & {
  rarity: Rarity;
  polarity: Polarity;
  /** 品级是怎么定的，一句话。 */
  verdict: string;
  /** 达不成的门槛 / 被配额压下来的原因。 */
  blocked: string[];
};

/** 子属性 key 的前缀就是它的主属性，用来判断修正是否跨了主属性。 */
function mainOf(subKey: string): MainKey | null {
  const prefix = subKey.split(".")[0]?.toUpperCase();
  return (MAIN_KEYS as readonly string[]).includes(prefix ?? "")
    ? (prefix as MainKey)
    : null;
}

export function polarityOf(modifiers: TraitModifier[]): Polarity {
  const plus = modifiers.filter((m) => m.sign === "plus");
  const minus = modifiers.filter((m) => m.sign === "minus");
  if (plus.length > 0 && minus.length > 0) return "double";
  if (minus.length > 0) return "liability";
  return "asset";
}

/** 双刃且跨主属性 —— 这才是暗金。同一个主属性里的加减只是内部权衡。 */
function isCrossMain(modifiers: TraitModifier[]): boolean {
  const plusMains = new Set(
    modifiers.filter((m) => m.sign === "plus").map((m) => mainOf(m.sub))
  );
  const minusMains = new Set(
    modifiers.filter((m) => m.sign === "minus").map((m) => mainOf(m.sub))
  );
  for (const main of plusMains) {
    if (main && !minusMains.has(main)) return true;
  }
  return false;
}

type Draft = {
  rarity: Rarity;
  verdict: string;
  blocked: string[];
};

/** 单条特性的候选品级，还没过配额。 */
function draftRarity(trait: TraitInput): Draft {
  const blocked: string[] = [];
  const polarity = polarityOf(trait.modifiers);
  const { windows, contexts, forecastHits } = trait.evidence;

  if (trait.setKey) {
    return { rarity: "set", verdict: "属于一个套装，凑齐才解锁效果", blocked };
  }

  if (trait.refusedOffer && trait.refusedOffer.trim().length > 0) {
    if (contexts >= 2 && windows >= 3) {
      return {
        rarity: "legend",
        verdict: "曾为它推掉过一个具体的好处 ⇒ 不可交易",
        blocked,
      };
    }
    blocked.push("传说级还需要 ≥3 条触发窗口且跨 ≥2 类情境");
  }

  if (polarity === "double") {
    if (isCrossMain(trait.modifiers)) {
      if (!trait.backfire || trait.backfire.trim().length === 0) {
        blocked.push("双刃特性必须写出反噬条件，否则它只是一句夸奖");
        return { rarity: "magic", verdict: "有正有负，但没写反噬条件", blocked };
      }
      return {
        rarity: "unique",
        verdict: "修正有正有负且跨主属性 ⇒ 自动判定「双刃」",
        blocked,
      };
    }
    return {
      rarity: "rare",
      verdict: "加减都落在同一个主属性里，属于内部权衡，不算双刃",
      blocked,
    };
  }

  if (polarity === "liability") {
    return { rarity: "common", verdict: "修正全为负 ⇒ 负债", blocked };
  }

  // 纯正修正：靠证据决定爬多高。
  if (forecastHits >= 1 && contexts >= 3 && windows >= 5) {
    return { rarity: "epic", verdict: "修正全为正 · 跨 3 类情境 · 有押中的预测", blocked };
  }
  if (windows >= 5 && contexts >= 2) {
    if (forecastHits < 1) blocked.push("升史诗还需要一条押中的事前预测");
    if (contexts < 3) blocked.push("升史诗还需要第 3 类情境");
    return { rarity: "rare", verdict: "修正全为正，证据站得住", blocked };
  }
  if (windows >= 3) {
    blocked.push(`还需 ${Math.max(0, 5 - windows)} 条触发窗口`);
    return { rarity: "magic", verdict: "修正全为正，证据还薄", blocked };
  }
  blocked.push(`还需 ${Math.max(0, 3 - windows)} 条触发窗口`);
  return { rarity: "common", verdict: "刚记下来，还没什么证据", blocked };
}

/** 证据分，只用于配额时排序谁留在高位。 */
function evidenceScore(trait: TraitInput): number {
  const { windows, contexts, forecastHits } = trait.evidence;
  return forecastHits * 100 + contexts * 10 + windows;
}

/** 配额降级的目标：暗金和传说都退回稀有，史诗退回稀有。 */
const DEMOTE_TO: Record<string, Rarity> = {
  epic: "rare",
  legend: "rare",
  unique: "rare",
};

/**
 * 结算一批特性。
 * 配额只在"持有中"的特性之间竞争 —— 已褪色的不占位置。
 */
export function assignRarities(traits: TraitInput[]): Trait[] {
  const drafts = new Map<string, Draft>();
  for (const trait of traits) drafts.set(trait.id, draftRarity(trait));

  const held = traits
    .filter((trait) => trait.status === "held")
    .sort((a, b) => evidenceScore(b) - evidenceScore(a));

  const used: Partial<Record<Rarity, number>> = {};
  for (const trait of held) {
    const draft = drafts.get(trait.id);
    if (!draft) continue;
    const quota = RARITY_QUOTA[draft.rarity];
    if (quota === undefined) continue;
    const taken = used[draft.rarity] ?? 0;
    if (taken < quota) {
      used[draft.rarity] = taken + 1;
      continue;
    }
    // 配额满了：证据弱的那条退回稀有，并把理由写清楚。
    draft.blocked = [
      ...draft.blocked,
      `${RARITY_LABELS[draft.rarity]}配额已满（${quota} 条），按证据强度排在后面`,
    ];
    draft.rarity = DEMOTE_TO[draft.rarity] ?? "rare";
    draft.verdict = "配额降级";
  }

  return traits.map((trait) => {
    const draft = drafts.get(trait.id) ?? {
      rarity: "common" as Rarity,
      verdict: "",
      blocked: [],
    };
    return {
      ...trait,
      rarity: draft.rarity,
      polarity: polarityOf(trait.modifiers),
      verdict: draft.verdict,
      blocked: draft.blocked,
    };
  });
}

export type TraitSet = {
  key: string;
  effect: string | null;
  members: Trait[];
  held: number;
  size: number;
  complete: boolean;
};

/** 套装进度。缺口一直亮着，它自己就是待办事项。 */
export function collectSets(traits: Trait[]): TraitSet[] {
  const byKey = new Map<string, Trait[]>();
  for (const trait of traits) {
    if (!trait.setKey) continue;
    byKey.set(trait.setKey, [...(byKey.get(trait.setKey) ?? []), trait]);
  }
  return [...byKey.entries()].map(([key, members]) => {
    const held = members.filter((member) => member.status === "held").length;
    return {
      key,
      effect: members.find((member) => member.setEffect)?.setEffect ?? null,
      members,
      held,
      size: members.length,
      complete: held === members.length && members.length > 1,
    };
  });
}
