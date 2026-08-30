// 怪物与等级。
//
// 两条规矩，破了这套东西就变成刷分游戏：
//
// 1) 击杀不是新记的一笔账，是**已经发生过的真实动作**换算出来的。
//    对账一条预测、记一个触发窗口、推翻一条假设、练一次、打完一场对战 ——
//    这些事本来就在库里，不存在"打了怪但没做事"，也不存在重复记账。
//
// 2) 经验不抬属性。属性是测出来的能力，等级是"你打了多少"。
//    做那件事会产生数据，数据才让属性动 —— 中间不许有捷径。
//
// 怪物分档的唯一标准：你有多想躲开它。
// BOSS 的定义是「你会预判它的答案，然后跳过它」。

import type { Domain, MainKey } from "./panel";

export const QUEST_TIERS = ["trash", "elite", "boss"] as const;
export type QuestTier = (typeof QUEST_TIERS)[number];

export const TIER_EXP: Record<QuestTier, number> = {
  trash: 10,
  elite: 50,
  boss: 200,
};

export const TIER_LABELS: Record<QuestTier, string> = {
  trash: "小怪",
  elite: "精英",
  boss: "BOSS",
};

export type Quest = {
  id: string;
  tier: QuestTier;
  name: string;
  /** 具体到能马上去做的一句话。 */
  action: string;
  /** 打完会掉什么 —— 必须是能进库的东西，不是"感觉更好"。 */
  drop: string;
  attribute: MainKey;
  domain: Domain;
  exp: number;
};

export type KillTally = {
  trash: number;
  elite: number;
  boss: number;
  total: number;
  exp: number;
};

export type KillInput = {
  /** 记过的触发窗口（含"符合条件但没做"的那些）。 */
  windowsTotal: number;
  /** 其中带第三方或系统佐证的（E3/E4）。 */
  windowsStrong: number;
  /** 已对账的预测。 */
  settledPredictions: number;
  /** 被推翻的假设 —— 最难的一种击杀。 */
  refutedHypotheses: number;
  /** 训练记录。 */
  bodyLogs: number;
  /** 已结束的恶魔对战。 */
  concludedBattles: number;
  /** 已点亮的生活域。 */
  litDomains: number;
};

/**
 * 击杀换算。同一件事只算一档：
 * 带佐证的窗口算精英，其余窗口算小怪，不会两边都记。
 */
export function tallyKills(input: KillInput): KillTally {
  const strong = Math.min(input.windowsStrong, input.windowsTotal);
  const trash = Math.max(0, input.windowsTotal - strong) + input.bodyLogs;
  const elite = strong + input.settledPredictions + input.concludedBattles;
  // 推翻自己 + 每点亮一个新的生活域，都是 BOSS 级。
  const boss = input.refutedHypotheses + Math.max(0, input.litDomains - 1);

  return {
    trash,
    elite,
    boss,
    total: trash + elite + boss,
    exp:
      trash * TIER_EXP.trash + elite * TIER_EXP.elite + boss * TIER_EXP.boss,
  };
}

/** 升到第 n 级需要的累计经验：100 · n(n−1)/2。Lv2=100，Lv3=300，Lv4=600…… */
function expNeededFor(level: number): number {
  return (100 * level * (level - 1)) / 2;
}

export type LevelProgress = {
  level: number;
  /** 本级已积累的经验。 */
  into: number;
  /** 距下一级还差多少。 */
  toNext: number;
};

export function levelFromExp(exp: number): LevelProgress {
  const safe = Math.max(0, exp);
  let level = 1;
  while (expNeededFor(level + 1) <= safe) level += 1;
  return {
    level,
    into: safe - expNeededFor(level),
    toNext: expNeededFor(level + 1) - safe,
  };
}

export type QuestHypothesis = {
  id: string;
  code: string;
  statement: string;
  /** 已观察到的不同情境数。<3 就升不成「特质」。 */
  contexts: number;
  hasPendingPrediction: boolean;
  closed: boolean;
};

export type QuestInput = {
  hypotheses: QuestHypothesis[];
  overduePredictions: { id: string; text: string }[];
  darkDomains: Domain[];
  /** 还没有采集口的子属性。 */
  uncollected: { key: string; name: string; main: MainKey; domain: Domain }[];
};

const MAX_QUESTS = 8;

/** 点亮一个黑域最省力的那一下。 */
const DOMAIN_OPENERS: Record<
  Domain,
  { name: string; action: string; drop: string; tier: QuestTier; attribute: MainKey }
> = {
  body: {
    name: "第一条训练记录",
    action: "动作 + 重量 + 次数，20 秒",
    drop: "身体域首次点亮 —— 你的第 2 类情境",
    tier: "trash",
    attribute: "STR",
  },
  people: {
    name: "找一个人看你还没做完的东西",
    action: "现在手上任何一个半成品，给一个具体的人看",
    drop: "人际域首次点亮 · 「敢给人看」开张",
    tier: "elite",
    attribute: "CHA",
  },
  self: {
    name: "填三个底牌数",
    action: "跑道还剩几个月 · 能叫来的人有几个 · 每周能自己支配几小时",
    drop: "自己域首次点亮 · 底牌开张",
    tier: "trash",
    attribute: "RES",
  },
  work: {
    name: "记一次真实接触",
    action: "找一个真人问一句，然后记下来",
    drop: "工作域首次点亮",
    tier: "elite",
    attribute: "WIS",
  },
};

/**
 * 生成本周怪物。排序：BOSS 在前，因为它们是你最想躲的，
 * 也是唯一能把假设推上去的那几下。
 */
export function buildQuests(input: QuestInput): Quest[] {
  const quests: Quest[] = [];

  // BOSS：情境数不够的活跃假设 —— 必须换个场子再验一次。
  for (const hypothesis of input.hypotheses) {
    if (hypothesis.closed || hypothesis.contexts >= 3) continue;
    quests.push({
      id: `context:${hypothesis.id}`,
      tier: "boss",
      name: `换个场子验 ${hypothesis.code}`,
      action: `在工作之外的场合，找一次「${hypothesis.statement}」会不会同样发生`,
      drop: `情境数 ${hypothesis.contexts} → ${hypothesis.contexts + 1}（升「特质」需要 3）`,
      attribute: "WIS",
      domain: "people",
      exp: TIER_EXP.boss,
    });
  }

  // BOSS：点亮一个从没照过的域。
  for (const domain of input.darkDomains) {
    const opener = DOMAIN_OPENERS[domain];
    quests.push({
      id: `domain:${domain}`,
      tier: opener.tier === "trash" ? "trash" : "elite",
      name: opener.name,
      action: opener.action,
      drop: opener.drop,
      attribute: opener.attribute,
      domain,
      exp: TIER_EXP[opener.tier],
    });
  }

  // 精英：已经到期却还没对账的预测。不对账的预测等于没押过。
  for (const prediction of input.overduePredictions) {
    quests.push({
      id: `resolve:${prediction.id}`,
      tier: "elite",
      name: "对账",
      action: prediction.text,
      drop: "「押注准头」的分母 +1 —— 唯一能让假设升档的证据",
      attribute: "INT",
      domain: "work",
      exp: TIER_EXP.elite,
    });
  }

  // 精英：没有任何在押预测的活跃假设。
  for (const hypothesis of input.hypotheses) {
    if (hypothesis.closed || hypothesis.hasPendingPrediction) continue;
    quests.push({
      id: `bet:${hypothesis.id}`,
      tier: "elite",
      name: `给 ${hypothesis.code} 押一注`,
      action: `写一句到期能判真假的预测，附上把握度`,
      drop: "升档只由已命中的事前预测驱动，不押就永远停在原地",
      attribute: "INT",
      domain: "work",
      exp: TIER_EXP.elite,
    });
  }

  // 小怪：把还没开张的子属性开张。
  for (const sub of input.uncollected) {
    quests.push({
      id: `open:${sub.key}`,
      tier: "trash",
      name: `${sub.name} 开张`,
      action: "记第一条，之后它就会自己长",
      drop: `子属性点亮 +1`,
      attribute: sub.main,
      domain: sub.domain,
      exp: TIER_EXP.trash,
    });
  }

  const order: Record<QuestTier, number> = { boss: 0, elite: 1, trash: 2 };
  return quests
    .sort((a, b) => order[a.tier] - order[b.tier])
    .slice(0, MAX_QUESTS);
}
