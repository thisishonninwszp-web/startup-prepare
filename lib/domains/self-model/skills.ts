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

export const FEAT_LINES = [
  "interview",
  "delivery",
  "opening",
  "calibration",
  "persuasion",
  "business",
  "organizing",
  "body",
  "learning",
  "writing",
  "capstone",
] as const;
export type FeatLine = (typeof FEAT_LINES)[number];

export const FEAT_LINE_NAMES: Record<FeatLine, string> = {
  interview: "访谈线",
  delivery: "交付线",
  opening: "开口线",
  calibration: "校准线",
  persuasion: "说服线",
  business: "经营线",
  organizing: "组织线",
  body: "体魄线",
  learning: "学习线",
  writing: "写作线",
  capstone: "组合专长",
};

export type FeatDef = {
  key: string;
  name: string;
  line: FeatLine;
  /** 这条线上的第几格，从 1 开始。组合专长固定为 5。 */
  depth: number;
  /** 需要的技能门槛。 */
  skills: Record<string, number>;
  /** 需要持有的特性（光谱端点名）。 */
  traits?: string[];
  /** 其它计数条件。 */
  counters?: Partial<Record<"settledForecasts" | "litDomains", number>>;
  effect: string;
  /** 前置的专长。同一条线自动串起来，跨线的手写。 */
  requires?: string[];
};

/**
 * 一条路线：四格，从浅到深，自动串前置。
 * 门槛按 30 / 45 / 60 / 75 递增 —— 越往里越要真手艺，
 * 所以一条线点到底本身就是一次长期投入的证明。
 */
function lineOf(
  line: FeatLine,
  steps: [name: string, skills: Record<string, number>, effect: string][]
): FeatDef[] {
  return steps.map(([name, skills, effect], index) => ({
    key: `${line}${index + 1}`,
    name,
    line,
    depth: index + 1,
    skills,
    effect,
    requires: index === 0 ? undefined : [`${line}${index}`],
  }));
}

/** 组合专长：必须同时点到两条线的一定深度，是比较优势真正长出来的地方。 */
function capstone(
  key: string,
  name: string,
  requires: string[],
  skills: Record<string, number>,
  effect: string
): FeatDef {
  return { key, name, line: "capstone", depth: 5, skills, effect, requires };
}

export const FEAT_DEFS: FeatDef[] = [
  ...lineOf("interview", [
    ["冷读", { asking: 30, listening: 30 }, "一次访谈的记录可同时挂两条假设"],
    ["深访", { asking: 45, observing: 40 }, "访谈记录自动生成一条候选假设"],
    ["顾客侧写", { observing: 60, analysis: 50 }, "顾客域的怪物经验 ×1.5"],
    ["需求考古", { asking: 75, research: 60 }, "从旧对话里翻出被忽略的需求线索"],
  ]),
  ...lineOf("delivery", [
    ["独狼工坊", { coding: 30, prototyping: 30 }, "无搭档时「半座桥」的惩罚减半"],
    ["一人交付", { automation: 45, testing: 40 }, "收敛率按交付物计，不按项目数计"],
    ["自动流水线", { automation: 60, debugging: 55 }, "重复工作转成脚本，节省的时间进「自己的时间」"],
    ["无人值守", { automation: 75, testing: 65 }, "东西在你不看的时候也在跑"],
  ]),
  ...lineOf("opening", [
    ["破冰", { coldopen: 30 }, "新面孔类怪物经验 ×1.5"],
    ["陌生局", { coldopen: 45, trustbuilding: 40 }, "进新场子额外记一条情境，加速特质举证"],
    ["引荐人", { trustbuilding: 60, keepingup: 45 }, "别人开始替你介绍人"],
    ["自来客", { trustbuilding: 75, introducing: 60 }, "有人主动找上门"],
  ]),
  ...lineOf("calibration", [
    ["铁口", { forecasting: 30 }, "押注时显示你在该领域的历史命中率"],
    ["赔率盘", { forecasting: 45, analysis: 40 }, "把握度自动按你的历史偏移校正"],
    ["预案", { forecasting: 60, retro: 50 }, "押注时同时写下「如果错了就做什么」"],
    ["先手", { forecasting: 75, observing: 60 }, "在事情发生前就摆好对账条件"],
  ]),
  ...lineOf("persuasion", [
    ["讲得清", { explaining: 30 }, "同一件事能用三句话说完"],
    ["带得动", { persuading: 45, presenting: 40 }, "提议被采纳率进入「说话有人听」的加成"],
    ["定调", { persuading: 60, negotiating: 50 }, "在别人还没定调时先给出框架"],
    ["背书", { persuading: 75, trustbuilding: 60 }, "你说的话本身成为理由"],
  ]),
  ...lineOf("business", [
    ["会算账", { finance: 30 }, "底牌快照自动提醒，跑道变化进事迹"],
    ["定得出价", { pricing: 45, finance: 40 }, "价格不再靠猜，有可复算的依据"],
    ["谈得成", { negotiating: 60, partnering: 50 }, "谈判类记录自动生成一条参照类"],
    ["拿得到钱", { pricing: 75, negotiating: 65 }, "从「有人用」走到「有人付钱」"],
  ]),
  ...lineOf("organizing", [
    ["交得出去", { delegating: 30 }, "把一件事完整地交给别人，而不是分一半"],
    ["带得动人", { delegating: 45, feedback: 40 }, "给反馈之后对方真的改了"],
    ["立得住规矩", { processdesign: 60, delegating: 55 }, "流程写下来之后不用你盯"],
    ["不在也转", { processdesign: 75, hiring: 55 }, "你休假一周，东西照样在走"],
  ]),
  ...lineOf("body", [
    ["有日课", { training: 30 }, "训练类怪物经验 ×1.5"],
    ["抗得住", { training: 45, recovery: 40 }, "高压期的状态波动幅度变小"],
    ["恢复快", { sleepcraft: 60, recovery: 55 }, "挫折后回到基线的天数缩短"],
    ["常年在线", { training: 75, sleepcraft: 65 }, "身体不再是任何计划的变量"],
  ]),
  ...lineOf("learning", [
    ["现学现卖", { learning: 30 }, "先做后补的学习方式获得加成"],
    ["拆得开", { research: 45, analysis: 40 }, "把一个大问题拆成能各自验证的小问题"],
    ["做实验", { experiment: 60, analysis: 55 }, "设计出能区分两种解释的观察"],
    ["自建方法", { experiment: 75, explaining: 60 }, "总结出别人也能照着做的做法"],
  ]),
  ...lineOf("writing", [
    ["写得完", { writing: 30 }, "连续四周每周产出一篇"],
    ["有人读", { writing: 45, headline: 40 }, "单篇触达 100 人"],
    ["有人转", { writing: 60, headline: 55 }, "写作类曝光进入「敢给人看」的加成"],
    ["有人付费", { writing: 75, pricing: 50 }, "因文字产生第一笔收入"],
  ]),

  // ---------------- 组合专长 ----------------
  // 比较优势不在任何单一一条线上，它长在两条线的交叉处。
  capstone(
    "独立作者",
    "独立作者",
    ["writing3", "delivery2"],
    { writing: 60, coding: 45 },
    "写作与交付互相供料：写的东西自己能做出来，做的东西自己能讲清楚"
  ),
  capstone(
    "一人公司",
    "一人公司",
    ["delivery3", "business2"],
    { automation: 60, pricing: 45 },
    "无搭档时的全部惩罚减半，收敛率按收入计"
  ),
  capstone(
    "顾问",
    "顾问",
    ["interview3", "persuasion2"],
    { observing: 60, persuading: 45 },
    "访谈直接产出对方肯照做的结论"
  ),
  capstone(
    "猎手",
    "猎手",
    ["opening3", "calibration2"],
    { coldopen: 60, forecasting: 45 },
    "接触前先押注，命中率进入「押注准头」"
  ),
  capstone(
    "教练",
    "教练",
    ["learning3", "persuasion2"],
    { experiment: 60, explaining: 45 },
    "你的方法别人照着做也成立"
  ),
  capstone(
    "铁人",
    "铁人",
    ["body3", "delivery2"],
    { training: 60, automation: 45 },
    "长周期项目不再因为身体掉线"
  ),
  capstone(
    "操盘手",
    "操盘手",
    ["business3", "organizing2"],
    { negotiating: 60, delegating: 45 },
    "谈成的事有人接得住"
  ),
  capstone(
    "斥候队长",
    "斥候队长",
    ["interview3", "opening2"],
    { asking: 60, trustbuilding: 45 },
    "别人替你去接触，情报照样回来"
  ),
];

export const FEAT_TOTAL = FEAT_DEFS.length;

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

export type FeatPath = {
  line: FeatLine;
  name: string;
  steps: FeatAvailability[];
  /** 这条线上你走到第几格。 */
  reached: number;
  /** 下一格，以及它差什么。全点满时为 null。 */
  next: FeatAvailability | null;
};

/**
 * 把专长排成路线。散着一堆卡片看不出方向，
 * 排成线之后"下一步往哪走"才是一眼能看见的东西。
 */
export function featPaths(availability: FeatAvailability[]): FeatPath[] {
  return FEAT_LINES.map((line) => {
    const steps = availability
      .filter((item) => item.def.line === line)
      .sort((a, b) => a.def.depth - b.def.depth);
    const reached = steps.filter((step) => step.taken).length;
    const next = steps.find((step) => !step.taken) ?? null;
    return { line, name: FEAT_LINE_NAMES[line], steps, reached, next };
  }).filter((path) => path.steps.length > 0);
}

/** 角色每升 2 级给 1 点专长点。稀缺是刻意的：稀缺才需要选。 */
export const LEVELS_PER_FEAT_POINT = 2;

export function featPointsFor(level: number, taken: number): number {
  const earned = Math.floor(Math.max(1, level) / LEVELS_PER_FEAT_POINT);
  return Math.max(0, earned - taken);
}
