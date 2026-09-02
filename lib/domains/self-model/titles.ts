// 称号与流派。
//
// 两样都是**派生**的，不存表：同样的状态永远算出同样的结果，
// 也就不存在"发过了但条件其实不成立"这种脏数据。
//
// 称号是这套系统里唯一纯粹为了爽的东西，零方法论代价 ——
// 它不参与任何计算，不影响任何数值，只是把一件难做到的事记下来。
// 所以解锁条件必须指向**难而且正确**的行为：被自己推翻、连续对账、
// 点亮新的域。不奖励"数字变大"，奖励"你做了那件不舒服的事"。
//
// 流派不是选的，是持有的特性长出来的。它变了说明你变了 ——
// 转职是这份档案里最有分量的一行。

export type TitleContext = {
  level: number;
  kills: { trash: number; elite: number; boss: number; total: number };
  /** 被推翻的假设数 —— 最难的一种成就。 */
  refuted: number;
  loadBearing: number;
  settledForecasts: number;
  hitForecasts: number;
  /** 已结算预测里最长的连续命中。 */
  longestHitStreak: number;
  litDomains: number;
  coverage: { lit: number; total: number };
  distinctContexts: number;
  windows: number;
  /** 记录里对己不利的证据条数。 */
  contraryWindows: number;
  heldTraits: string[];
  uniqueTraits: number;
  completeSets: number;
  skillTicks: number;
  maxSkill: number;
  skillsAbove: (threshold: number) => number;
  feats: number;
  trainingDays: number;
  longestSpanDays: number;
  exposures: number;
  newFaces: number;
  acceptedProposals: number;
  commitments: { done: number; total: number };
  sleepEnoughDays: number;
};

export type TitleDef = {
  key: string;
  name: string;
  /** 解锁条件的人话版本。锁着时显示这句。 */
  requirement: string;
  earned: (ctx: TitleContext) => boolean;
};

export const TITLE_DEFS: TitleDef[] = [
  // ---- 起步：把系统真正用起来 ----
  { key: "firstblood", name: "开口", requirement: "击败第一只 BOSS", earned: (c) => c.kills.boss >= 1 },
  { key: "firstbet", name: "下注", requirement: "对账第一条预测", earned: (c) => c.settledForecasts >= 1 },
  { key: "firstiron", name: "举铁", requirement: "记下第一条训练", earned: (c) => c.trainingDays >= 1 },
  { key: "firsttick", name: "开工", requirement: "点亮第一个小技能", earned: (c) => c.skillTicks >= 1 },

  // ---- 最难也最该奖励的：承认自己错了 ----
  { key: "slapped", name: "打脸王", requirement: "推翻 3 条自己写下的判断", earned: (c) => c.refuted >= 3 },
  { key: "firstslap", name: "认栽", requirement: "第一次推翻自己的一条假设", earned: (c) => c.refuted >= 1 },
  { key: "heretic", name: "破戒", requirement: "推翻一条已经可承重的假设", earned: (c) => c.refuted >= 1 && c.loadBearing >= 1 },
  { key: "coroner", name: "验尸官", requirement: "记满 20 条对自己不利的证据", earned: (c) => c.contraryWindows >= 20 },

  // ---- 校准 ----
  { key: "seer", name: "预言家", requirement: "自我预测连续命中 5 次", earned: (c) => c.longestHitStreak >= 5 },
  { key: "ironmouth", name: "铁口", requirement: "累计对账 20 条预测", earned: (c) => c.settledForecasts >= 20 },
  { key: "halfright", name: "一半对", requirement: "对账 10 条且命中过半", earned: (c) => c.settledForecasts >= 10 && c.hitForecasts * 2 >= c.settledForecasts },

  // ---- 域与情境：把自己照亮 ----
  { key: "tripod", name: "三足鼎立", requirement: "同时点亮三个生活域", earned: (c) => c.litDomains >= 3 },
  { key: "allfour", name: "四方", requirement: "四个域全部点亮", earned: (c) => c.litDomains >= 4 },
  { key: "cartographer", name: "制图师", requirement: "在 5 类不同情境里留下记录", earned: (c) => c.distinctContexts >= 5 },
  { key: "halflit", name: "过半", requirement: "点亮一半以上的子属性", earned: (c) => c.coverage.lit * 2 >= c.coverage.total && c.coverage.lit > 0 },

  // ---- 特性 ----
  { key: "firsttrait", name: "有名有姓", requirement: "拿到第一条特性", earned: (c) => c.heldTraits.length >= 1 },
  { key: "doubleedge", name: "双刃", requirement: "持有一条暗金特性", earned: (c) => c.uniqueTraits >= 1 },
  { key: "setpiece", name: "配齐", requirement: "集齐一套套装", earned: (c) => c.completeSets >= 1 },
  { key: "sixfaces", name: "六面", requirement: "同时持有 6 条特性", earned: (c) => c.heldTraits.length >= 6 },

  // ---- 技能与专长 ----
  { key: "journeyman", name: "出师", requirement: "任意一项技能走到精通", earned: (c) => c.maxSkill >= 60 },
  { key: "master", name: "登堂", requirement: "任意一项技能走到专家", earned: (c) => c.maxSkill >= 80 },
  { key: "broadhand", name: "多面手", requirement: "5 项技能同时入了门", earned: (c) => c.skillsAbove(40) >= 5 },
  { key: "hundredticks", name: "百灯", requirement: "累计点亮 100 个小技能", earned: (c) => c.skillTicks >= 100 },
  { key: "firstfeat", name: "开枝", requirement: "点上第一个专长", earned: (c) => c.feats >= 1 },
  { key: "treeup", name: "成树", requirement: "点上 5 个专长", earned: (c) => c.feats >= 5 },

  // ---- 与人 ----
  { key: "opened", name: "摆出来", requirement: "把没做完的东西给人看 10 次", earned: (c) => c.exposures >= 10 },
  { key: "socialite", name: "串门客", requirement: "认识 10 个新面孔", earned: (c) => c.newFaces >= 10 },
  { key: "heard", name: "被听见", requirement: "有 3 条提议被采纳", earned: (c) => c.acceptedProposals >= 3 },
  { key: "kept", name: "说到做到", requirement: "兑现 8 条承诺", earned: (c) => c.commitments.done >= 8 },

  // ---- 身体与恒心 ----
  { key: "regular", name: "常客", requirement: "近 8 周练满 24 天", earned: (c) => c.trainingDays >= 24 },
  { key: "slept", name: "睡饱", requirement: "累计 30 天睡够 7 小时", earned: (c) => c.sleepEnoughDays >= 30 },
  { key: "deepdive", name: "深水", requirement: "单主题连续投入 180 天", earned: (c) => c.longestSpanDays >= 180 },

  // ---- 总量 ----
  { key: "hundredkills", name: "百战", requirement: "累计击杀 100", earned: (c) => c.kills.total >= 100 },
  { key: "levelten", name: "十级", requirement: "角色等级到 10", earned: (c) => c.level >= 10 },
];

export const TITLE_TOTAL = TITLE_DEFS.length;

export type TitleState = { def: TitleDef; earned: boolean };

export function evaluateTitles(ctx: TitleContext): TitleState[] {
  return TITLE_DEFS.map((def) => ({ def, earned: def.earned(ctx) }));
}

// ---------------------------------------------------------------------------
// 流派
// ---------------------------------------------------------------------------

export type BuildDef = {
  key: string;
  mark: string;
  name: string;
  /** 这一派靠什么打。 */
  play: string;
  /** 天然弱点，必须写 —— 只有优点的流派是奉承。 */
  weakness: string;
  traits: string[];
};

export const BUILD_DEFS: BuildDef[] = [
  {
    key: "artisan",
    mark: "🔨",
    name: "工匠",
    play: "靠一件东西做到别人做不到",
    weakness: "憋太久，不接触现实",
    traits: ["掘井人", "封顶匠", "塔中人", "千锤手"],
  },
  {
    key: "ranger",
    mark: "🗡️",
    name: "游猎者",
    play: "靠接触量和速度撞出机会",
    weakness: "深度不足，做不出壁垒",
    traits: ["游商", "火折子", "多头蛇", "串门"],
  },
  {
    key: "scout",
    mark: "🧭",
    name: "侦察兵",
    play: "靠信息更新永远比别人早",
    weakness: "永远在看，不落地",
    traits: ["验尸官", "测风者", "风向旗", "探路人"],
  },
  {
    key: "warden",
    mark: "🛡️",
    name: "守成者",
    play: "靠交付和可靠积累复利",
    weakness: "不冒险，吃不到大的",
    traits: ["押印", "封顶匠", "压舱石", "日课僧"],
  },
  {
    key: "herald",
    mark: "🎭",
    name: "布道者",
    play: "靠影响力聚人聚资源",
    weakness: "内核薄，经不起深问",
    traits: ["摆摊人", "铜锣手", "串门", "持号角"],
  },
  {
    key: "alchemist",
    mark: "⚗️",
    name: "炼金术士",
    play: "靠组合和高频试验",
    weakness: "什么都试，什么都不深",
    traits: ["多头蛇", "野路子", "千锤手", "拾获者"],
  },
];

export type BuildMatch = {
  def: BuildDef;
  matched: string[];
};

/** 至少命中两条才算一个流派 —— 一条特性说明不了打法。 */
export const BUILD_MIN_MATCH = 2;

export function matchBuild(heldTraits: string[]): BuildMatch | null {
  const held = new Set(heldTraits);
  let best: BuildMatch | null = null;
  for (const def of BUILD_DEFS) {
    const matched = def.traits.filter((name) => held.has(name));
    if (matched.length < BUILD_MIN_MATCH) continue;
    if (!best || matched.length > best.matched.length) {
      best = { def, matched };
    }
  }
  return best;
}

/** 离下一个流派还差哪几条。空手时给出所有候选，帮人看清楚可以往哪长。 */
export function buildProgress(heldTraits: string[]): {
  def: BuildDef;
  matched: string[];
  missing: string[];
}[] {
  const held = new Set(heldTraits);
  return BUILD_DEFS.map((def) => {
    const matched = def.traits.filter((name) => held.has(name));
    return {
      def,
      matched,
      missing: def.traits.filter((name) => !held.has(name)),
    };
  }).sort((a, b) => b.matched.length - a.matched.length);
}
