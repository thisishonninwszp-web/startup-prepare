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
  /**
   * BOSS 的台词。它不是提示语，是**你脑子里的那句原话** ——
   * BOSS 的定义就是"你会预判它的答案然后跳过它"，
   * 所以把那句预判原样摆出来，是最省事也最难受的提醒。
   */
  taunt?: string;
};

/** ISO 周编号，例 2026-W35。一周只点一次名。 */
export function isoWeekKey(date: Date): string {
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  // ISO：周四决定这一周属于哪一年。
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
  );
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * 逃跑加成：一只怪每被躲开一周，掉落经验上浮。
 * 躲得越久越难开口，所以回报也该越高 —— 这是这套系统里唯一一处
 * "拖延反而给更多"，而它成立的理由是：拖延本身已经付过代价了。
 */
export const FLEE_BONUS_PER_WEEK = 0.25;
export const FLEE_BONUS_CAP = 2;

export function fleeAdjustedExp(baseExp: number, weeksSeen: number): number {
  const fled = Math.max(0, weeksSeen - 1);
  const multiplier = Math.min(1 + fled * FLEE_BONUS_PER_WEEK, 1 + FLEE_BONUS_CAP);
  return Math.round(baseExp * multiplier);
}

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
  /** 其余状态。全部可选 —— 没喂进来的部分就不生成对应的怪。 */
  state?: QuestState;
};

export type QuestState = {
  /** 建过卡没有。没建卡时技能表整个是死的。 */
  hasCharacter?: boolean;
  /** 未结算的技能勾。 */
  openTicks?: number;
  /** 练过但快生锈的技能。 */
  rusting?: { key: string; name: string; daysSinceTick: number }[];
  /** 已解锁、可以点的专长。 */
  unlockedFeats?: { key: string; name: string }[];
  featPointsLeft?: number;
  /** 只差一项前置的专长。 */
  nearFeats?: { key: string; name: string; missing: string }[];
  heldTraitCount?: number;
  /** 双刃特性里还没写反噬条件的。 */
  backfireMissing?: { id: string; name: string }[];
  refuted?: number;
  loadBearing?: number;
  /** 平均把握度减实际命中率。正数=系统性高估。 */
  calibrationOffset?: number | null;
  /** 连续两次落空的假设。 */
  missStreak?: { id: string; code: string }[];
  /** 已结算但没挂到任何假设上的预测数。 */
  looseSettled?: number;
  /** 记录过结果的提议总数。 */
  proposalsTotal?: number;
  commitments?: { done: number; total: number };
  /** 最高的一项技能值，以及已点的专长数。 */
  maxSkill?: number;
  takenFeats?: number;
};

export const MAX_QUESTS = 10;

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
 * 其余怪物。每一条都指向一个卡住的地方，而不是"再多做一点"。
 * 顺序无所谓 —— 最后统一按档位排。
 */
function stateQuests(state: QuestState): Quest[] {
  const quests: Quest[] = [];
  const push = (quest: Quest) => quests.push(quest);

  if (state.hasCharacter === false) {
    push({
      id: "state:character",
      tier: "trash",
      name: "建卡",
      action: "45 项技能各给一个起始值，凭直觉，15 分钟",
      drop: "技能表与专长树解锁 —— 在这之前它们整个是死的",
      attribute: "INT",
      domain: "self",
      exp: TIER_EXP.trash,
    });
  }

  if ((state.openTicks ?? 0) >= 3) {
    push({
      id: "state:settle",
      tier: "trash",
      name: `结算 ${state.openTicks} 个勾`,
      action: "去技能页签点结算，看这一轮涨了什么",
      drop: "技能成长入账",
      attribute: "INT",
      domain: "self",
      exp: TIER_EXP.trash,
    });
  }

  for (const skill of (state.rusting ?? []).slice(0, 2)) {
    push({
      id: `state:rust:${skill.key}`,
      tier: "trash",
      name: `「${skill.name}」快生锈了`,
      action: `${skill.daysSinceTick} 天没用过。找一件真事用一次，然后打勾`,
      drop: "止住生锈",
      attribute: "INT",
      domain: "work",
      exp: TIER_EXP.trash,
    });
  }

  if ((state.featPointsLeft ?? 0) > 0) {
    for (const feat of (state.unlockedFeats ?? []).slice(0, 2)) {
      push({
        id: `state:feat:${feat.key}`,
        tier: "elite",
        name: `点上「${feat.name}」`,
        action: "前置已经满了，专长点也还有 —— 点了才生效",
        drop: "专长树往前走一格",
        attribute: "INT",
        domain: "self",
        exp: TIER_EXP.elite,
      });
    }
  }

  for (const feat of (state.nearFeats ?? []).slice(0, 2)) {
    push({
      id: `state:near:${feat.key}`,
      tier: "elite",
      name: `「${feat.name}」只差一项`,
      action: `差 ${feat.missing}`,
      drop: "解锁一个专长",
      attribute: "INT",
      domain: "work",
      exp: TIER_EXP.elite,
    });
  }

  if (state.heldTraitCount === 0) {
    push({
      id: "state:scan",
      tier: "trash",
      name: "扫描特性库",
      action: "去特性页签扫一遍，看现在的数值够到哪几条",
      drop: "第一批特性",
      attribute: "WIS",
      domain: "self",
      exp: TIER_EXP.trash,
    });
  }

  for (const trait of (state.backfireMissing ?? []).slice(0, 2)) {
    push({
      id: `state:backfire:${trait.id}`,
      tier: "elite",
      name: `给「${trait.name}」写反噬条件`,
      action: "什么情况下它会从资产变成负债",
      drop: "它才拿得到暗金 —— 不写反噬的双刃只是一句夸奖",
      attribute: "WIS",
      domain: "self",
      exp: TIER_EXP.elite,
    });
  }

  if ((state.refuted ?? 0) === 0 && (state.loadBearing ?? 0) >= 1) {
    push({
      id: "state:norefute",
      tier: "boss",
      name: "一条都没被推翻过",
      taunt: "「这条我很确定，不用查了。」",
      action: "挑手上最有把握的那条假设，专门去找它的反例",
      drop: "「认栽」称号 · 而且这是整套系统里最难的一种击杀",
      attribute: "WIS",
      domain: "self",
      exp: TIER_EXP.boss,
    });
  }

  if ((state.calibrationOffset ?? 0) > 15) {
    push({
      id: "state:overconfident",
      tier: "elite",
      name: "把握度系统性偏高",
      action: `平均把握度比实际命中率高 ${state.calibrationOffset} 个点。下一条押注往下压`,
      drop: "校准偏移收窄",
      attribute: "INT",
      domain: "work",
      exp: TIER_EXP.elite,
    });
  }

  for (const hypothesis of (state.missStreak ?? []).slice(0, 2)) {
    push({
      id: `state:miss:${hypothesis.id}`,
      tier: "boss",
      name: `${hypothesis.code} 连续两次落空`,
      taunt: "「只是运气不好，再看看。」",
      action: "给它写三个替代解释，以及能区分它们的观察",
      drop: "它已经掉回猜想 —— 现在要么换个说法，要么推翻它",
      attribute: "WIS",
      domain: "self",
      exp: TIER_EXP.boss,
    });
  }

  if ((state.looseSettled ?? 0) > 0) {
    push({
      id: "state:loose",
      tier: "trash",
      name: `${state.looseSettled} 条已结算的预测没挂假设`,
      action: "挂上去，它们才算数",
      drop: "升档只由挂在假设上的预测驱动",
      attribute: "INT",
      domain: "work",
      exp: TIER_EXP.trash,
    });
  }

  if (state.proposalsTotal === 0) {
    push({
      id: "state:proposal",
      tier: "elite",
      name: "记一次提议和它的下场",
      action: "你提过什么、对方接没接。「还没下文」也要记",
      drop: "「说话有人听」开张 —— 只记提了不记结果，采纳率没有分母",
      attribute: "CHA",
      domain: "work",
      exp: TIER_EXP.elite,
    });
  }

  const commitments = state.commitments;
  if (
    commitments &&
    commitments.total >= 3 &&
    commitments.done * 2 < commitments.total
  ) {
    push({
      id: "state:debt",
      tier: "boss",
      name: "先还一条旧账",
      taunt: "「那件事对方应该早忘了。」",
      action: `承诺兑现 ${commitments.done}/${commitments.total}。挑一条最早的，今天做完`,
      drop: "「说到做到」往回走一步",
      attribute: "CHA",
      domain: "people",
      exp: TIER_EXP.boss,
    });
  }

  if ((state.maxSkill ?? 0) >= 60 && (state.takenFeats ?? 0) === 0) {
    push({
      id: "state:firstfeat",
      tier: "elite",
      name: "你已经够格点第一个专长",
      action: "去专长树看看哪条前置已经满了",
      drop: "「开枝」称号",
      attribute: "INT",
      domain: "self",
      exp: TIER_EXP.elite,
    });
  }

  return quests;
}

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
      taunt: "「在别的地方应该也一样吧。」",
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

  if (input.state) quests.push(...stateQuests(input.state));

  const order: Record<QuestTier, number> = { boss: 0, elite: 1, trash: 2 };
  return quests
    .sort((a, b) => order[a.tier] - order[b.tier])
    .slice(0, MAX_QUESTS);
}
