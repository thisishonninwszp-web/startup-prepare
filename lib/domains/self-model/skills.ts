// 技能与专长。
//
// 技能的成长规则抄的是 CoC:**只有实际用过、并且有结果，才打一个勾**。
// 读书不打勾，看教程不打勾，想明白了不打勾。结算时只有打过勾的技能才涨。
// 这跟这个模块一直守的那条线是同一句话，只是桌游 1981 年就写好了。
//
// 专长抄的是 D&D:有前置、要花专长点、给一个具体效果。
// 它补上了升级系统最大的洞 —— 升级时必须给你一个**选择**，
// 否则等级只是一个会变大的数字。
//
// 两条资源线互相独立：技能靠打勾涨，专长点靠升级发。交叉才解锁节点。

export const SKILL_GROUPS = [
  "info",
  "express",
  "make",
  "run",
  "self",
  "relate",
] as const;
export type SkillGroup = (typeof SKILL_GROUPS)[number];

export const SKILL_GROUP_NAMES: Record<SkillGroup, string> = {
  info: "信息",
  express: "表达",
  make: "造物",
  run: "经营",
  self: "自我",
  relate: "关系",
};

export type SkillDef = { key: string; name: string; group: SkillGroup };

export const SKILL_DEFS: SkillDef[] = [
  { key: "analysis", name: "数据分析", group: "info" },
  { key: "research", name: "查资料", group: "info" },
  { key: "finstmt", name: "读财报", group: "info" },
  { key: "recon", name: "竞品侦查", group: "info" },
  { key: "asking", name: "提问", group: "info" },
  { key: "listening", name: "倾听", group: "info" },
  { key: "observing", name: "观察", group: "info" },
  { key: "experiment", name: "做实验", group: "info" },

  { key: "writing", name: "写作", group: "express" },
  { key: "presenting", name: "演示", group: "express" },
  { key: "negotiating", name: "谈判", group: "express" },
  { key: "persuading", name: "说服", group: "express" },
  { key: "coldopen", name: "冷启动开口", group: "express" },
  { key: "jpbiz", name: "商务日语", group: "express" },
  { key: "explaining", name: "讲清楚一件事", group: "express" },
  { key: "headline", name: "起标题", group: "express" },

  { key: "coding", name: "编程", group: "make" },
  { key: "productdesign", name: "产品设计", group: "make" },
  { key: "prototyping", name: "原型", group: "make" },
  { key: "aiorchestration", name: "AI 编排", group: "make" },
  { key: "automation", name: "自动化", group: "make" },
  { key: "debugging", name: "调试", group: "make" },
  { key: "testing", name: "测试", group: "make" },

  { key: "pricing", name: "定价", group: "run" },
  { key: "finance", name: "财务", group: "run" },
  { key: "hiring", name: "招人", group: "run" },
  { key: "delegating", name: "分工", group: "run" },
  { key: "processdesign", name: "流程设计", group: "run" },
  { key: "support", name: "客服", group: "run" },
  { key: "procurement", name: "采购", group: "run" },
  { key: "partnering", name: "谈合作", group: "run" },

  { key: "retro", name: "复盘", group: "self" },
  { key: "forecasting", name: "预测", group: "self" },
  { key: "scheduling", name: "时间安排", group: "self" },
  { key: "sleepcraft", name: "睡眠管理", group: "self" },
  { key: "training", name: "训练计划", group: "self" },
  { key: "recovery", name: "情绪回收", group: "self" },
  { key: "learning", name: "学新东西", group: "self" },

  { key: "trustbuilding", name: "建立信任", group: "relate" },
  { key: "askinghelp", name: "求助", group: "relate" },
  { key: "feedback", name: "给反馈", group: "relate" },
  { key: "takingheat", name: "挨批评", group: "relate" },
  { key: "conflict", name: "处理冲突", group: "relate" },
  { key: "introducing", name: "介绍自己", group: "relate" },
  { key: "keepingup", name: "维系旧关系", group: "relate" },
];

export const SKILL_TOTAL = SKILL_DEFS.length;
export const SKILL_MAX = 100;

const SKILL_KEYS = new Set(SKILL_DEFS.map((skill) => skill.key));
export function isSkillKey(key: string): boolean {
  return SKILL_KEYS.has(key);
}

export type SkillState = {
  key: string;
  value: number;
  /** 🔥 0–2：没人要求你也会做的程度。影响成长，不影响数值本身。 */
  passion: number;
  /** 本季打过的勾。 */
  ticks: number;
  /** 最后一次打勾距今多少天，从未打过为 null。 */
  daysSinceTick: number | null;
};

/**
 * 一次结算的成长量。
 * 越接近满值涨得越慢（离满值越远，每个勾的价值越大），
 * 单季最多结算 3 个勾 —— 防止靠刷勾数把技能顶上去。
 * 不掷骰：这个模块里没有一个数字应该是随机来的。
 */
export const MAX_TICKS_PER_SEASON = 3;

export function growthFor(state: SkillState): number {
  const ticks = Math.min(state.ticks, MAX_TICKS_PER_SEASON);
  if (ticks <= 0) return 0;
  const room = SKILL_MAX - state.value;
  if (room <= 0) return 0;
  const perTick = Math.max(1, Math.ceil(room / 20));
  // 激情不是加成的借口，只在同样打了勾时略微加快。
  const passionBonus = state.passion > 0 && ticks >= 2 ? 1 : 0;
  return Math.min(room, perTick * ticks + passionBonus);
}

export const RUST_AFTER_DAYS = 180;

/** 生锈：半年没打过勾就开始掉。点满就走的技能不该一直算在你头上。 */
export function rustFor(state: SkillState): number {
  if (state.ticks > 0) return 0;
  if (state.daysSinceTick === null) return 0;
  if (state.daysSinceTick < RUST_AFTER_DAYS) return 0;
  const seasons = Math.floor(state.daysSinceTick / RUST_AFTER_DAYS);
  return -Math.min(state.value, seasons * 2);
}

// ---------------------------------------------------------------------------
// 专长
// ---------------------------------------------------------------------------

export type FeatDef = {
  key: string;
  name: string;
  /** 需要的技能门槛。 */
  skills: Record<string, number>;
  /** 需要持有的特性（光谱端点名）。 */
  traits?: string[];
  /** 需要的其它计数条件，由调用方喂进来。 */
  counters?: Partial<Record<"settledForecasts" | "litDomains", number>>;
  effect: string;
  /** 前置的专长。构成树。 */
  requires?: string[];
};

export const FEAT_DEFS: FeatDef[] = [
  {
    key: "coldread",
    name: "冷读",
    skills: { asking: 40, listening: 40 },
    effect: "一次访谈产出双倍证据：一条触发窗口可同时挂两条假设",
  },
  {
    key: "deepinterview",
    name: "深访",
    skills: { asking: 55, observing: 45 },
    requires: ["coldread"],
    effect: "访谈记录自动生成一条候选假设",
  },
  {
    key: "customerprofile",
    name: "顾客侧写",
    skills: { observing: 60, analysis: 50 },
    requires: ["deepinterview"],
    effect: "顾客域的怪物经验 ×1.5",
  },
  {
    key: "icebreaker",
    name: "破冰",
    skills: { coldopen: 30 },
    effect: "新面孔类怪物经验 ×1.5",
  },
  {
    key: "strangerroom",
    name: "陌生局",
    skills: { coldopen: 50, trustbuilding: 40 },
    requires: ["icebreaker"],
    effect: "进新场子时额外记一条情境，加速特质举证",
  },
  {
    key: "lonesmith",
    name: "独狼工坊",
    skills: { coding: 60, writing: 40 },
    traits: ["掘井人"],
    effect: "无搭档时「半座桥」的惩罚减半",
  },
  {
    key: "soloship",
    name: "一人交付",
    skills: { automation: 50, testing: 40 },
    requires: ["lonesmith"],
    effect: "收敛率按交付物计，不按项目数计",
  },
  {
    key: "ironmouth",
    name: "铁口",
    skills: { forecasting: 50 },
    counters: { settledForecasts: 10 },
    effect: "押注时显示你在该领域的历史命中率",
  },
  {
    key: "coroner",
    name: "验尸",
    skills: { retro: 45, analysis: 40 },
    effect: "每条 Kill 决策自动进入事迹与参照类",
  },
  {
    key: "mapmaker",
    name: "制图",
    skills: { experiment: 40, scheduling: 35 },
    counters: { litDomains: 3 },
    effect: "怪物清单每周多给一只，优先指向最暗的域",
  },
  {
    key: "quartermaster",
    name: "粮草官",
    skills: { finance: 40, pricing: 35 },
    effect: "底牌快照到期自动提醒，跑道变化进事迹",
  },
  {
    key: "sparring",
    name: "对练",
    skills: { takingheat: 40, feedback: 35 },
    effect: "「听得进反话」的样本按对战与真人反馈合并计算",
  },
];

export type FeatAvailability = {
  def: FeatDef;
  taken: boolean;
  unlocked: boolean;
  missing: string[];
};

export type FeatContext = {
  skills: Record<string, number>;
  traits: string[];
  taken: string[];
  settledForecasts: number;
  litDomains: number;
  featPointsLeft: number;
};

const SKILL_NAMES = new Map(SKILL_DEFS.map((skill) => [skill.key, skill.name]));

export function evaluateFeat(def: FeatDef, ctx: FeatContext): FeatAvailability {
  const taken = ctx.taken.includes(def.key);
  const missing: string[] = [];

  for (const [key, min] of Object.entries(def.skills)) {
    const value = ctx.skills[key] ?? 0;
    if (value < min) {
      missing.push(`${SKILL_NAMES.get(key) ?? key} ${value}/${min}`);
    }
  }
  for (const trait of def.traits ?? []) {
    if (!ctx.traits.includes(trait)) missing.push(`需持有「${trait}」`);
  }
  for (const required of def.requires ?? []) {
    if (!ctx.taken.includes(required)) {
      const name = FEAT_DEFS.find((item) => item.key === required)?.name;
      missing.push(`需先点「${name ?? required}」`);
    }
  }
  if (def.counters?.settledForecasts !== undefined) {
    const have = ctx.settledForecasts;
    const need = def.counters.settledForecasts;
    if (have < need) missing.push(`已结算预测 ${have}/${need}`);
  }
  if (def.counters?.litDomains !== undefined) {
    const have = ctx.litDomains;
    const need = def.counters.litDomains;
    if (have < need) missing.push(`已点亮的域 ${have}/${need}`);
  }

  return { def, taken, unlocked: !taken && missing.length === 0, missing };
}

export function evaluateFeats(ctx: FeatContext): FeatAvailability[] {
  return FEAT_DEFS.map((def) => evaluateFeat(def, ctx));
}

/** 角色每升 2 级给 1 点专长点。稀缺是刻意的：稀缺才需要选。 */
export const LEVELS_PER_FEAT_POINT = 2;

export function featPointsFor(level: number, taken: number): number {
  const earned = Math.floor(Math.max(1, level) / LEVELS_PER_FEAT_POINT);
  return Math.max(0, earned - taken);
}
