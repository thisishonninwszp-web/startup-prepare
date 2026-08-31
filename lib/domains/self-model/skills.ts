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

import type { MainKey } from "./panel";

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

export type SkillDef = {
  key: string;
  name: string;
  group: SkillGroup;
  /**
   * 这门手艺算在哪个主属性名下。
   * 注意：手艺**不加成属性** —— 属性是行为算出来的，有分母；
   * 手艺的起点是你自己填的。两者在个人页并列显示，各说各的，绝不混算。
   */
  main: MainKey;
  /**
   * 前置技能。不是硬锁 —— 你照样可以练，但**练不上去**：
   * 一项技能的上限 = 所有前置里最低的那个 + HEADROOM。
   *
   * 硬锁不真实：现实里你当然可以硬着头皮去谈判，
   * 只是倾听不行的话，谈判就是上不去。想再深必须回头补地基。
   */
  requires?: string[];
  /**
   * 里程碑：同一项技能，40 和 85 是完全不同的两件事。
   * 每一档都必须是一句**能判定真假**的现实标准 —— 数字本身没有意义，
   * 「已过『敢开口』，正在走向『敢等』」才有。
   */
  milestones?: SkillMilestone[];
};

export type SkillMilestone = {
  /** 到这个值算跨过。 */
  at: number;
  name: string;
  /** 一句能判真假的现实标准。 */
  test: string;
};

export const MILESTONE_TIERS = [40, 65, 85] as const;

/** 前置给的余量：地基之上还能往前探多少。 */
export const SKILL_HEADROOM = 20;

export const SKILL_DEFS: SkillDef[] = [
  { key: "analysis", name: "测算", group: "info", main: "INT" , requires: ["research"] },
  { key: "research", name: "访书", group: "info", main: "INT" },
  { key: "finstmt", name: "读账", group: "info", main: "RES" , requires: ["analysis"] },
  { key: "recon", name: "踩点", group: "info", main: "WIS" , requires: ["research", "observing"] },
  { key: "asking", name: "叩问", group: "info", main: "WIS" , requires: ["listening"] },
  { key: "listening", name: "听风", group: "info", main: "WIS" },
  { key: "observing", name: "明眼", group: "info", main: "WIS" },
  { key: "experiment", name: "验方", group: "info", main: "INT" , requires: ["asking", "analysis"] },

  { key: "writing", name: "执笔", group: "express", main: "CHA" },
  { key: "presenting", name: "登台", group: "express", main: "CHA" , requires: ["explaining"] },
  { key: "negotiating", name: "议价", group: "express", main: "RES" , requires: ["persuading", "listening"] },
  { key: "persuading", name: "游说", group: "express", main: "CHA" , requires: ["explaining", "listening"] },
  { key: "coldopen", name: "搭话", group: "express", main: "LCK" , requires: ["introducing"] },
  { key: "jpbiz", name: "异乡语", group: "express", main: "CHA" },
  { key: "explaining", name: "说书", group: "express", main: "CHA" , requires: ["writing"] },
  { key: "headline", name: "点睛", group: "express", main: "CHA" , requires: ["writing"] },

  { key: "coding", name: "铸造", group: "make", main: "DEX" },
  { key: "productdesign", name: "图样", group: "make", main: "DEX" , requires: ["prototyping", "observing"] },
  { key: "prototyping", name: "打样", group: "make", main: "DEX" , requires: ["coding"] },
  { key: "aiorchestration", name: "驭械", group: "make", main: "DEX" , requires: ["coding", "explaining"] },
  { key: "automation", name: "机关", group: "make", main: "DEX" , requires: ["coding", "debugging"] },
  { key: "debugging", name: "捉虫", group: "make", main: "DEX" , requires: ["coding"] },
  { key: "testing", name: "验货", group: "make", main: "WIL" , requires: ["debugging"] },

  { key: "pricing", name: "标价", group: "run", main: "RES" , requires: ["finance", "analysis"] },
  { key: "finance", name: "算账", group: "run", main: "RES" },
  { key: "hiring", name: "募人", group: "run", main: "CHA" , requires: ["asking", "trustbuilding"] },
  { key: "delegating", name: "派活", group: "run", main: "WIL" , requires: ["explaining"] },
  { key: "processdesign", name: "立规", group: "run", main: "WIL" , requires: ["delegating", "retro"] },
  { key: "support", name: "接客", group: "run", main: "CHA" , requires: ["listening"] },
  { key: "procurement", name: "采买", group: "run", main: "RES" , requires: ["negotiating"] },
  { key: "partnering", name: "结盟", group: "run", main: "RES" , requires: ["negotiating", "trustbuilding"] },

  { key: "retro", name: "复盘", group: "self", main: "WIS" },
  { key: "forecasting", name: "卜算", group: "self", main: "INT" , requires: ["retro", "analysis"] },
  { key: "scheduling", name: "排期", group: "self", main: "WIL" },
  { key: "sleepcraft", name: "安寝", group: "self", main: "CON" },
  { key: "training", name: "淬体", group: "self", main: "STR" },
  { key: "recovery", name: "回气", group: "self", main: "CON" },
  { key: "learning", name: "偷师", group: "self", main: "INT" },

  { key: "trustbuilding", name: "立信", group: "relate", main: "CHA" , requires: ["listening", "introducing"] },
  { key: "askinghelp", name: "求援", group: "relate", main: "RES" , requires: ["introducing"] },
  { key: "feedback", name: "直言", group: "relate", main: "CHA" , requires: ["explaining", "trustbuilding"] },
  { key: "takingheat", name: "受谏", group: "relate", main: "WIL" },
  { key: "conflict", name: "调停", group: "relate", main: "CHA" , requires: ["takingheat", "listening"] },
  { key: "introducing", name: "报名号", group: "relate", main: "LCK" },
  { key: "keepingup", name: "续缘", group: "relate", main: "LCK" , requires: ["trustbuilding"] },
];


/** 每项技能的里程碑。数据大，单独放一张表，SKILL_DEFS 在构造时挂上去。 */
const MILESTONES: Record<string, SkillMilestone[]> = {
  analysis: [{ at: MILESTONE_TIERS[0], name: "会画图", test: "把一份原始数据画成一张说明问题的图" }, { at: MILESTONE_TIERS[1], name: "会问对问题", test: "先想清楚要回答什么，再决定跑什么" }, { at: MILESTONE_TIERS[2], name: "会说因果", test: "能说清相关与因果的差别在哪，并设计出区分它们的观察" }],
  research: [{ at: MILESTONE_TIERS[0], name: "找得到", test: "半小时内找到一手资料而不是二手转述" }, { at: MILESTONE_TIERS[1], name: "辨得清", test: "能判断一份资料可不可信、谁出的钱" }, { at: MILESTONE_TIERS[2], name: "挖得深", test: "顺着引用往上翻到源头" }],
  finstmt: [{ at: MILESTONE_TIERS[0], name: "看得懂", test: "读完一张损益表能说出公司靠什么赚钱" }, { at: MILESTONE_TIERS[1], name: "看得出异常", test: "发现一个和同行不一样的科目并说出为什么" }, { at: MILESTONE_TIERS[2], name: "能倒推", test: "从报表倒推出经营动作" }],
  recon: [{ at: MILESTONE_TIERS[0], name: "列得出", test: "列出三家真实竞品和它们在卖什么" }, { at: MILESTONE_TIERS[1], name: "看得出打法", test: "说清对手靠什么活着" }, { at: MILESTONE_TIERS[2], name: "预判得到", test: "在对手动作之前说出他会做什么，并对账" }],
  asking: [{ at: MILESTONE_TIERS[0], name: "敢问", test: "在会上问出一个别人没问的问题" }, { at: MILESTONE_TIERS[1], name: "问到具体", test: "把「怎么样」换成「上次是什么时候、怎么处理的」" }, { at: MILESTONE_TIERS[2], name: "问到痛处", test: "问出对方原本不打算说的那句" }],
  listening: [{ at: MILESTONE_TIERS[0], name: "不打断", test: "一次对话里完整听完对方的三段话" }, { at: MILESTONE_TIERS[1], name: "听得出没说的", test: "复述出对方回避的那部分" }, { at: MILESTONE_TIERS[2], name: "听完能改", test: "因为听到的东西改掉自己的方案" }],
  observing: [{ at: MILESTONE_TIERS[0], name: "记得住", test: "事后能白描出现场发生了什么" }, { at: MILESTONE_TIERS[1], name: "看得出不对劲", test: "指出一个和描述不符的细节" }, { at: MILESTONE_TIERS[2], name: "看得出模式", test: "从三次现场里抽出同一条规律" }],
  experiment: [{ at: MILESTONE_TIERS[0], name: "会设条件", test: "写出一个能判真假的观察条件" }, { at: MILESTONE_TIERS[1], name: "会做对照", test: "设计出能区分两种解释的观察" }, { at: MILESTONE_TIERS[2], name: "会控变量", test: "在真实环境里排掉主要干扰" }],
  writing: [{ at: MILESTONE_TIERS[0], name: "写得完", test: "连续四周每周一篇" }, { at: MILESTONE_TIERS[1], name: "写得清", test: "有人照着你写的做对了一件事" }, { at: MILESTONE_TIERS[2], name: "写得动人", test: "有人主动转发并说出被打动的点" }],
  presenting: [{ at: MILESTONE_TIERS[0], name: "讲得完", test: "十分钟不看稿讲完一件事" }, { at: MILESTONE_TIERS[1], name: "讲得住", test: "被打断提问后还能回到主线" }, { at: MILESTONE_TIERS[2], name: "讲得服", test: "讲完当场有人改变决定" }],
  negotiating: [{ at: MILESTONE_TIERS[0], name: "敢开口", test: "主动提出一个价格或条件" }, { at: MILESTONE_TIERS[1], name: "敢等", test: "在对方沉默时不先降价" }, { at: MILESTONE_TIERS[2], name: "能扩饼", test: "找到双方都更好的第三个选项" }],
  persuading: [{ at: MILESTONE_TIERS[0], name: "说得出理由", test: "给出一条对方在意的理由，不是你在意的" }, { at: MILESTONE_TIERS[1], name: "换得动框架", test: "让对方接受一个新的衡量标准" }, { at: MILESTONE_TIERS[2], name: "留得下痕迹", test: "对方在你不在场时也照这个说" }],
  coldopen: [{ at: MILESTONE_TIERS[0], name: "发得出去", test: "给一个陌生人发出第一条消息" }, { at: MILESTONE_TIERS[1], name: "有人回", test: "冷启动回复率过三成" }, { at: MILESTONE_TIERS[2], name: "约得到人", test: "从冷开口约到一次真实对话" }],
  jpbiz: [{ at: MILESTONE_TIERS[0], name: "场面话过关", test: "邮件和会议不出失礼" }, { at: MILESTONE_TIERS[1], name: "能谈事", test: "用日语把一件复杂的事谈完" }, { at: MILESTONE_TIERS[2], name: "能谈钱", test: "用日语谈价格和条件" }],
  explaining: [{ at: MILESTONE_TIERS[0], name: "说得完整", test: "一件事能说完不漏关键" }, { at: MILESTONE_TIERS[1], name: "三句说完", test: "同一件事能压到三句话" }, { at: MILESTONE_TIERS[2], name: "换人也懂", test: "换一个完全不同背景的人也听懂" }],
  headline: [{ at: MILESTONE_TIERS[0], name: "能起", test: "给每篇东西起一个标题" }, { at: MILESTONE_TIERS[1], name: "有人点", test: "标题带来的打开率能被观测到" }, { at: MILESTONE_TIERS[2], name: "一句抓住", test: "标题本身被人引用" }],
  coding: [{ at: MILESTONE_TIERS[0], name: "写得动", test: "独立做出一个能用的小东西" }, { at: MILESTONE_TIERS[1], name: "读得懂别人的", test: "接手别人的代码并改对" }, { at: MILESTONE_TIERS[2], name: "扛得住复杂", test: "结构撑得住第三次需求变化" }],
  productdesign: [{ at: MILESTONE_TIERS[0], name: "画得出", test: "画出一个能让人看懂的流程" }, { at: MILESTONE_TIERS[1], name: "砍得掉", test: "主动删掉一个自己喜欢但没人用的功能" }, { at: MILESTONE_TIERS[2], name: "有人用", test: "设计的东西被真人反复使用" }],
  prototyping: [{ at: MILESTONE_TIERS[0], name: "做得快", test: "一天内做出可点的原型" }, { at: MILESTONE_TIERS[1], name: "做得像", test: "原型能骗过真实用户测出反应" }, { at: MILESTONE_TIERS[2], name: "做得省", test: "用最少的东西验掉最大的未知" }],
  aiorchestration: [{ at: MILESTONE_TIERS[0], name: "会指挥", test: "把一个任务拆给 AI 分步完成" }, { at: MILESTONE_TIERS[1], name: "会验收", test: "能判断 AI 的输出哪里不对" }, { at: MILESTONE_TIERS[2], name: "会搭系统", test: "串成一条不用你盯的流水" }],
  automation: [{ at: MILESTONE_TIERS[0], name: "省一次", test: "把一件重复的事自动化一次" }, { at: MILESTONE_TIERS[1], name: "省一类", test: "一类事都不用手动了" }, { at: MILESTONE_TIERS[2], name: "无人值守", test: "东西在你不看的时候也在跑" }],
  debugging: [{ at: MILESTONE_TIERS[0], name: "找得到", test: "能定位到出错的那一行" }, { at: MILESTONE_TIERS[1], name: "问得对", test: "先假设再验证，不靠乱改" }, { at: MILESTONE_TIERS[2], name: "防得住", test: "修完顺手加上防止复发的东西" }],
  testing: [{ at: MILESTONE_TIERS[0], name: "会写", test: "关键路径有测试" }, { at: MILESTONE_TIERS[1], name: "会挑", test: "知道哪些该测哪些不必" }, { at: MILESTONE_TIERS[2], name: "拦得住", test: "测试真的挡下过一次事故" }],
  pricing: [{ at: MILESTONE_TIERS[0], name: "定得出", test: "给一个东西定出价格并说出依据" }, { at: MILESTONE_TIERS[1], name: "敢涨", test: "涨过一次价并观察反应" }, { at: MILESTONE_TIERS[2], name: "按价值", test: "价格跟着客户拿到的价值走" }],
  finance: [{ at: MILESTONE_TIERS[0], name: "算得清", test: "说得出这个月钱去哪了" }, { at: MILESTONE_TIERS[1], name: "看得远", test: "算得出跑道还有几个月" }, { at: MILESTONE_TIERS[2], name: "排得开", test: "在多个用途之间做出可辩护的取舍" }],
  hiring: [{ at: MILESTONE_TIERS[0], name: "说得清要谁", test: "写出一条能筛人的岗位描述" }, { at: MILESTONE_TIERS[1], name: "面得出", test: "面试问出能预测表现的东西" }, { at: MILESTONE_TIERS[2], name: "留得住", test: "招进来的人待过一年" }],
  delegating: [{ at: MILESTONE_TIERS[0], name: "交得出", test: "把一件完整的事交出去" }, { at: MILESTONE_TIERS[1], name: "忍得住", test: "交出去之后不半路收回" }, { at: MILESTONE_TIERS[2], name: "带得起", test: "对方做得比你预期好" }],
  processdesign: [{ at: MILESTONE_TIERS[0], name: "写得下来", test: "把一件事的做法写成别人能照做的步骤" }, { at: MILESTONE_TIERS[1], name: "跑得起来", test: "别人照着做成功了" }, { at: MILESTONE_TIERS[2], name: "不用盯", test: "流程自己在转" }],
  support: [{ at: MILESTONE_TIERS[0], name: "答得上", test: "回答客户的问题" }, { at: MILESTONE_TIERS[1], name: "听得出共性", test: "从多次咨询里抽出同一个问题" }, { at: MILESTONE_TIERS[2], name: "改得掉", test: "因为客服反馈改掉了产品" }],
  procurement: [{ at: MILESTONE_TIERS[0], name: "买得到", test: "找到并买到需要的东西" }, { at: MILESTONE_TIERS[1], name: "比得出", test: "能说清三家的差别不只是价格" }, { at: MILESTONE_TIERS[2], name: "谈得下来", test: "拿到比标价更好的条件" }],
  partnering: [{ at: MILESTONE_TIERS[0], name: "搭得上", test: "促成第一次合作对话" }, { at: MILESTONE_TIERS[1], name: "谈得成", test: "签下一个双方都投入的合作" }, { at: MILESTONE_TIERS[2], name: "经得起", test: "合作撑过一次冲突" }],
  retro: [{ at: MILESTONE_TIERS[0], name: "写得下", test: "每周写下一条学到了" }, { at: MILESTONE_TIERS[1], name: "找得到根", test: "找到的不是表面原因" }, { at: MILESTONE_TIERS[2], name: "改得动", test: "复盘之后行为真的变了" }],
  forecasting: [{ at: MILESTONE_TIERS[0], name: "敢押", test: "写下一条带日期的预测" }, { at: MILESTONE_TIERS[1], name: "对得上账", test: "十条以上已结算" }, { at: MILESTONE_TIERS[2], name: "押得准", test: "命中率稳定在你的把握度附近" }],
  scheduling: [{ at: MILESTONE_TIERS[0], name: "排得下", test: "一周有计划" }, { at: MILESTONE_TIERS[1], name: "守得住", test: "计划和实际的偏差在可控范围" }, { at: MILESTONE_TIERS[2], name: "留得出", test: "主动留白并且没被占用" }],
  sleepcraft: [{ at: MILESTONE_TIERS[0], name: "记得住", test: "连续两周记录睡眠" }, { at: MILESTONE_TIERS[1], name: "睡得够", test: "过半的夜晚睡够七小时" }, { at: MILESTONE_TIERS[2], name: "睡得稳", test: "作息波动小于一小时" }],
  training: [{ at: MILESTONE_TIERS[0], name: "动起来", test: "连续四周有训练" }, { at: MILESTONE_TIERS[1], name: "有计划", test: "训练按计划推进而不是凭心情" }, { at: MILESTONE_TIERS[2], name: "练出来", test: "同一动作的重量确实在涨" }],
  recovery: [{ at: MILESTONE_TIERS[0], name: "察觉得到", test: "能说出自己现在状态不好" }, { at: MILESTONE_TIERS[1], name: "停得下", test: "在崩之前主动停" }, { at: MILESTONE_TIERS[2], name: "回得快", test: "挫折后回到基线的天数缩短" }],
  learning: [{ at: MILESTONE_TIERS[0], name: "学得进", test: "学完能复述" }, { at: MILESTONE_TIERS[1], name: "用得上", test: "学完两周内用在真事上" }, { at: MILESTONE_TIERS[2], name: "学得快", test: "从不会到能用的时间在缩短" }],
  trustbuilding: [{ at: MILESTONE_TIERS[0], name: "说到做到", test: "小事上兑现" }, { at: MILESTONE_TIERS[1], name: "给得出", test: "先给出价值而不是先要" }, { at: MILESTONE_TIERS[2], name: "被托付", test: "有人把重要的事交给你" }],
  askinghelp: [{ at: MILESTONE_TIERS[0], name: "开得了口", test: "卡住时向人求助一次" }, { at: MILESTONE_TIERS[1], name: "问得准", test: "把问题问到对方能答的粒度" }, { at: MILESTONE_TIERS[2], name: "有来有往", test: "求助之后关系更近而不是更远" }],
  feedback: [{ at: MILESTONE_TIERS[0], name: "给得出", test: "指出一个具体问题而不是感受" }, { at: MILESTONE_TIERS[1], name: "给得中", test: "对方听完知道该改什么" }, { at: MILESTONE_TIERS[2], name: "给得受", test: "对方谢你而不是躲你" }],
  takingheat: [{ at: MILESTONE_TIERS[0], name: "受得住", test: "被批评后不当场反驳" }, { at: MILESTONE_TIERS[1], name: "分得清", test: "能分出哪部分对哪部分不对" }, { at: MILESTONE_TIERS[2], name: "用得上", test: "因为批评改掉了一件事" }],
  conflict: [{ at: MILESTONE_TIERS[0], name: "不逃", test: "把冲突摆到桌面上" }, { at: MILESTONE_TIERS[1], name: "对事", test: "冲突里不攻击人" }, { at: MILESTONE_TIERS[2], name: "修得回", test: "冲突之后关系还在" }],
  introducing: [{ at: MILESTONE_TIERS[0], name: "说得出", test: "三十秒说清自己在做什么" }, { at: MILESTONE_TIERS[1], name: "对方记得住", test: "对方能复述你在做什么" }, { at: MILESTONE_TIERS[2], name: "对方想知道更多", test: "介绍完对方主动追问" }],
  keepingup: [{ at: MILESTONE_TIERS[0], name: "记得住人", test: "记得对方上次说过什么" }, { at: MILESTONE_TIERS[1], name: "有来往", test: "不只在有事时才联系" }, { at: MILESTONE_TIERS[2], name: "久了还在", test: "两年以上的关系还活着" }],
};

for (const def of SKILL_DEFS) {
  def.milestones = MILESTONES[def.key];
}

/** 这项技能现在处在哪一档，下一档是什么。 */
export function milestoneOf(def: SkillDef, value: number): {
  passed: SkillMilestone[];
  next: SkillMilestone | null;
} {
  const all = def.milestones ?? [];
  return {
    passed: all.filter((item) => value >= item.at),
    next: all.find((item) => value < item.at) ?? null,
  };
}

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

/**
 * 一项技能现在最高能到多少。
 * 没有前置的技能顶到 100；有前置的，被最弱的那根地基拖着。
 */
export function skillCeiling(
  key: string,
  values: Record<string, number>
): { ceiling: number; limitedBy: { key: string; name: string; value: number } | null } {
  const def = SKILL_DEFS.find((item) => item.key === key);
  if (!def?.requires || def.requires.length === 0) {
    return { ceiling: SKILL_MAX, limitedBy: null };
  }
  let weakest: { key: string; name: string; value: number } | null = null;
  for (const required of def.requires) {
    const value = values[required] ?? 0;
    if (!weakest || value < weakest.value) {
      weakest = {
        key: required,
        name: SKILL_DEFS.find((item) => item.key === required)?.name ?? required,
        value,
      };
    }
  }
  if (!weakest) return { ceiling: SKILL_MAX, limitedBy: null };
  const ceiling = Math.min(SKILL_MAX, weakest.value + SKILL_HEADROOM);
  return { ceiling, limitedBy: weakest };
}

export function growthFor(state: SkillState, ceiling = SKILL_MAX): number {
  const ticks = Math.min(state.ticks, MAX_TICKS_PER_SEASON);
  if (ticks <= 0) return 0;
  const room = Math.min(SKILL_MAX, ceiling) - state.value;
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
  "scouting",
  "compounding",
  "craft",
  "grit",
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
  scouting: "侦查线",
  compounding: "复利线",
  craft: "匠心线",
  grit: "心力线",
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

  ...lineOf("scouting", [
    ["摸底", { recon: 30 }, "列得出三家真实竞品在卖什么"],
    ["拼图", { recon: 45, research: 40 }, "从零散信息里拼出对手的处境"],
    ["看穿打法", { recon: 60, analysis: 50 }, "说清对手靠什么活着"],
    ["预判动作", { recon: 75, forecasting: 55 }, "在对手动作之前押注，并且对账"],
  ]),
  ...lineOf("compounding", [
    ["记得住人", { keepingup: 30 }, "记得对方上次说过什么"],
    ["有来往", { keepingup: 45, trustbuilding: 40 }, "不只在有事时才联系"],
    ["被想起", { trustbuilding: 60, keepingup: 55 }, "别人遇到相关的事会想到你"],
    ["被推荐", { trustbuilding: 75, introducing: 60 }, "有人替你把你介绍出去"],
  ]),
  ...lineOf("craft", [
    ["做得像", { prototyping: 30 }, "原型能骗过真实用户测出反应"],
    ["做得省", { prototyping: 45, productdesign: 40 }, "用最少的东西验掉最大的未知"],
    ["做得稳", { testing: 60, debugging: 50 }, "测试真的挡下过一次事故"],
    ["做得久", { productdesign: 75, testing: 65 }, "东西撑过第三次需求变化"],
  ]),
  ...lineOf("grit", [
    ["撑得住", { takingheat: 30 }, "被批评后不当场反驳"],
    ["缓得过来", { recovery: 45, takingheat: 40 }, "挫折后能说出自己现在状态不好"],
    ["不怕难看", { takingheat: 60, feedback: 50 }, "主动去找对自己不利的评价"],
    ["越挫越准", { recovery: 75, retro: 65 }, "每次挫折都换回一条能用的判断"],
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
  capstone(
    "情报官",
    "情报官",
    ["scouting3", "calibration2"],
    { recon: 60, forecasting: 45 },
    "看清对手之后先押注再验证，情报变成可对账的判断"
  ),
  capstone(
    "老友",
    "老友",
    ["compounding3", "opening2"],
    { keepingup: 60, coldopen: 45 },
    "新认识的人会留下来，旧关系会带来新的人"
  ),
  capstone(
    "工头",
    "工头",
    ["craft3", "organizing2"],
    { testing: 60, delegating: 45 },
    "做得稳的东西可以交出去，交出去之后还稳"
  ),
  capstone(
    "不倒翁",
    "不倒翁",
    ["grit3", "body2"],
    { recovery: 60, training: 45 },
    "身体和心力互相兜底，长周期项目不因为任何一边掉线"
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
