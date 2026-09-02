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
  /**
   * 白话含义。名字取得有味道是为了记得住，但记得住不等于看得懂 ——
   * 界面上鼠标放上去要能立刻知道这门手艺到底指什么。
   */
  gloss: string;
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
  { key: "analysis", name: "测算", gloss: "把数字变成能下判断的东西", group: "info", main: "INT" , requires: ["research"] },
  { key: "research", name: "访书", gloss: "找得到一手资料，并判断可不可信", group: "info", main: "INT" },
  { key: "finstmt", name: "读账", gloss: "从报表看出一家公司靠什么活着", group: "info", main: "RES" , requires: ["analysis"] },
  { key: "recon", name: "踩点", gloss: "搞清楚对手在卖什么、怎么活", group: "info", main: "WIS" , requires: ["research", "observing"] },
  { key: "asking", name: "叩问", gloss: "问出别人没问的那个问题", group: "info", main: "WIS" , requires: ["listening"] },
  { key: "listening", name: "听风", gloss: "听完，包括对方没说出口的", group: "info", main: "WIS" },
  { key: "observing", name: "明眼", gloss: "现场看得见细节，事后说得出来", group: "info", main: "WIS" },
  { key: "experiment", name: "验方", gloss: "设计一个能判真假的观察", group: "info", main: "INT" , requires: ["asking", "analysis"] },

  { key: "writing", name: "执笔", gloss: "把想法变成别人能读的文字", group: "express", main: "CHA" },
  { key: "presenting", name: "登台", gloss: "站着把一件事讲完", group: "express", main: "CHA" , requires: ["explaining"] },
  { key: "negotiating", name: "议价", gloss: "在有利益冲突时谈出条件", group: "express", main: "RES" , requires: ["persuading", "listening"] },
  { key: "persuading", name: "游说", gloss: "让对方改变决定", group: "express", main: "CHA" , requires: ["explaining", "listening"] },
  { key: "coldopen", name: "搭话", gloss: "对不认识的人开第一句口", group: "express", main: "LCK" , requires: ["introducing"] },
  { key: "jpbiz", name: "异乡语", gloss: "用日语把正经事谈完", group: "express", main: "CHA" },
  { key: "explaining", name: "说书", gloss: "把复杂的事说到别人听懂", group: "express", main: "CHA" , requires: ["writing"] },
  { key: "headline", name: "点睛", gloss: "一句话让人愿意点进来", group: "express", main: "CHA" , requires: ["writing"] },

  { key: "coding", name: "铸造", gloss: "自己动手把东西做出来", group: "make", main: "DEX" },
  { key: "productdesign", name: "图样", gloss: "决定做什么、不做什么", group: "make", main: "DEX" , requires: ["prototyping", "observing"] },
  { key: "prototyping", name: "打样", gloss: "快速做个能试的东西", group: "make", main: "DEX" , requires: ["coding"] },
  { key: "aiorchestration", name: "驭械", gloss: "指挥 AI 分步完成一件事并验收", group: "make", main: "DEX" , requires: ["coding", "explaining"] },
  { key: "automation", name: "机关", gloss: "把重复的事交给机器", group: "make", main: "DEX" , requires: ["coding", "debugging"] },
  { key: "debugging", name: "捉虫", gloss: "定位并修掉出错的地方", group: "make", main: "DEX" , requires: ["coding"] },
  { key: "testing", name: "验货", gloss: "提前拦下会出事的地方", group: "make", main: "WIL" , requires: ["debugging"] },

  { key: "pricing", name: "标价", gloss: "给东西定出一个站得住的价", group: "run", main: "RES" , requires: ["finance", "analysis"] },
  { key: "finance", name: "算账", gloss: "算得清钱从哪来、到哪去", group: "run", main: "RES" },
  { key: "hiring", name: "募人", gloss: "找到并留住合适的人", group: "run", main: "CHA" , requires: ["asking", "trustbuilding"] },
  { key: "delegating", name: "派活", gloss: "把一件完整的事交出去", group: "run", main: "WIL" , requires: ["explaining"] },
  { key: "processdesign", name: "立规", gloss: "把做法写成别人能照做的步骤", group: "run", main: "WIL" , requires: ["delegating", "retro"] },
  { key: "support", name: "接客", gloss: "接住客户的问题并改掉根因", group: "run", main: "CHA" , requires: ["listening"] },
  { key: "procurement", name: "采买", gloss: "买到该买的，条件还不错", group: "run", main: "RES" , requires: ["negotiating"] },
  { key: "partnering", name: "结盟", gloss: "促成并维持一段合作", group: "run", main: "RES" , requires: ["negotiating", "trustbuilding"] },

  { key: "retro", name: "复盘", gloss: "回头看，找到真正的原因", group: "self", main: "WIS" },
  { key: "forecasting", name: "卜算", gloss: "事前押注，事后对账", group: "self", main: "INT" , requires: ["retro", "analysis"] },
  { key: "scheduling", name: "排期", gloss: "把时间排给该做的事", group: "self", main: "WIL" },
  { key: "sleepcraft", name: "安寝", gloss: "睡够、睡稳", group: "self", main: "CON" },
  { key: "training", name: "淬体", gloss: "按计划练，而不是凭心情", group: "self", main: "STR" },
  { key: "recovery", name: "回气", gloss: "察觉状态、停得下、回得来", group: "self", main: "CON" },
  { key: "learning", name: "偷师", gloss: "从不会到能用", group: "self", main: "INT" },

  { key: "trustbuilding", name: "立信", gloss: "让别人愿意把事交给你", group: "relate", main: "CHA" , requires: ["listening", "introducing"] },
  { key: "askinghelp", name: "求援", gloss: "卡住时开得了口", group: "relate", main: "RES" , requires: ["introducing"] },
  { key: "feedback", name: "直言", gloss: "把问题说到对方听得进去", group: "relate", main: "CHA" , requires: ["explaining", "trustbuilding"] },
  { key: "takingheat", name: "受谏", gloss: "被批评时还能听", group: "relate", main: "WIL" },
  { key: "conflict", name: "调停", gloss: "把冲突摆上桌并谈出安排", group: "relate", main: "CHA" , requires: ["takingheat", "listening"] },
  { key: "introducing", name: "报名号", gloss: "三十秒说清自己在做什么", group: "relate", main: "LCK" },
  { key: "keepingup", name: "续缘", gloss: "关系不因为没事就断", group: "relate", main: "LCK" , requires: ["trustbuilding"] },

  // ---------------- 进阶：站在基础之上，有分叉 ----------------
  { key: "rhetoric", name: "修辞", gloss: "同一件事说得更有力", group: "express", main: "CHA", requires: ["writing"] },
  { key: "structure", name: "谋篇", gloss: "先有骨架再有文字", group: "express", main: "CHA", requires: ["writing", "explaining"] },
  { key: "narrative", name: "叙事", gloss: "把信息装进有起伏的故事里", group: "express", main: "CHA", requires: ["rhetoric", "structure"] },
  { key: "teachingwrite", name: "教化", gloss: "写出别人能照着做的东西", group: "express", main: "CHA", requires: ["structure", "explaining"] },
  { key: "architecture", name: "构架", gloss: "决定东西怎么分块、边界在哪", group: "make", main: "DEX", requires: ["coding", "productdesign"] },
  { key: "performance", name: "调优", gloss: "找出慢在哪并改快", group: "make", main: "DEX", requires: ["coding", "debugging"] },
  { key: "systemcraft", name: "造系统", gloss: "搭一个不用你盯的系统", group: "make", main: "DEX", requires: ["architecture", "automation"] },
  { key: "dataplumb", name: "理数", gloss: "把数据接通、洗净、看得见", group: "make", main: "INT", requires: ["coding", "analysis"] },
  { key: "probing", name: "追问", gloss: "顺着回答往下追到事实", group: "info", main: "WIS", requires: ["asking", "listening"] },
  { key: "profiling", name: "侧写", gloss: "说清一个人在意什么、会怎么选", group: "info", main: "WIS", requires: ["observing", "probing"] },
  { key: "synthesis", name: "归纳", gloss: "把散的材料收成一句能行动的话", group: "info", main: "INT", requires: ["analysis", "research"] },
  { key: "cashflow", name: "现金流", gloss: "看得见未来几个月的现金曲线", group: "run", main: "RES", requires: ["finance"] },
  { key: "uniteconomics", name: "单位经济", gloss: "一单赚多少、成本在哪块", group: "run", main: "RES", requires: ["pricing", "finance"] },
  { key: "channel", name: "渠道", gloss: "找到并押中触达客户的路", group: "run", main: "RES", requires: ["recon", "partnering"] },
  { key: "mentoring", name: "带人", gloss: "把人带到能独立完成", group: "relate", main: "CHA", requires: ["feedback", "delegating"] },
  { key: "mediating", name: "斡旋", gloss: "在两方之间谈出一个安排", group: "relate", main: "CHA", requires: ["conflict", "listening"] },
  { key: "metacog", name: "自省", gloss: "看得见自己的情绪怎么影响判断", group: "self", main: "WIS", requires: ["retro", "recovery"] },
  { key: "focuscraft", name: "凝神", gloss: "坐得住，被打断也回得来", group: "self", main: "WIL", requires: ["scheduling", "recovery"] },
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
  rhetoric: [{ at: MILESTONE_TIERS[0], name: "会打比方", test: "用一个比喻让人当场懂" }, { at: MILESTONE_TIERS[1], name: "有节奏", test: "长短句换着来，读起来不累" }, { at: MILESTONE_TIERS[2], name: "有回响", test: "有人引用你的原句" }],
  structure: [{ at: MILESTONE_TIERS[0], name: "有骨架", test: "写之前列得出结构" }, { at: MILESTONE_TIERS[1], name: "能重排", test: "同一批材料排出两种讲法" }, { at: MILESTONE_TIERS[2], name: "藏得住", test: "结构不露痕迹" }],
  narrative: [{ at: MILESTONE_TIERS[0], name: "讲得出故事", test: "把一件事讲成有起伏的故事" }, { at: MILESTONE_TIERS[1], name: "有人代入", test: "读者说像在说自己" }, { at: MILESTONE_TIERS[2], name: "能带信息", test: "故事本身承载判断，不是装饰" }],
  teachingwrite: [{ at: MILESTONE_TIERS[0], name: "有人照做", test: "3 人反馈按你写的做了" }, { at: MILESTONE_TIERS[1], name: "能省时间", test: "别人不用问你就能上手" }, { at: MILESTONE_TIERS[2], name: "能被复用", test: "你的写法被别人拿去用" }],
  architecture: [{ at: MILESTONE_TIERS[0], name: "分得开", test: "模块之间说得清边界" }, { at: MILESTONE_TIERS[1], name: "扛得住变", test: "撑过三次需求变化" }, { at: MILESTONE_TIERS[2], name: "好接手", test: "别人能接着改" }],
  performance: [{ at: MILESTONE_TIERS[0], name: "测得出", test: "能量出慢在哪" }, { at: MILESTONE_TIERS[1], name: "改得动", test: "把慢的地方改快一倍" }, { at: MILESTONE_TIERS[2], name: "不牺牲", test: "快了但没换来一堆坑" }],
  systemcraft: [{ at: MILESTONE_TIERS[0], name: "能自转", test: "东西自己在跑" }, { at: MILESTONE_TIERS[1], name: "能自愈", test: "出错能自己恢复" }, { at: MILESTONE_TIERS[2], name: "能长大", test: "加功能不用推倒" }],
  dataplumb: [{ at: MILESTONE_TIERS[0], name: "接得上", test: "把数据从一处搬到另一处" }, { at: MILESTONE_TIERS[1], name: "洗得净", test: "脏数据不进结论" }, { at: MILESTONE_TIERS[2], name: "看得见", test: "有一张随时能看的盘" }],
  probing: [{ at: MILESTONE_TIERS[0], name: "追一层", test: "问出上一句背后的原因" }, { at: MILESTONE_TIERS[1], name: "追到事实", test: "从观点追到具体那一次" }, { at: MILESTONE_TIERS[2], name: "追不伤人", test: "追到底对方还愿意说" }],
  profiling: [{ at: MILESTONE_TIERS[0], name: "画得出人", test: "说清对方在意什么" }, { at: MILESTONE_TIERS[1], name: "说得中", test: "对方说你怎么知道" }, { at: MILESTONE_TIERS[2], name: "预判得到", test: "预判对方的选择并对账" }],
  synthesis: [{ at: MILESTONE_TIERS[0], name: "并得起来", test: "把散的材料并成一条结论" }, { at: MILESTONE_TIERS[1], name: "说得出反例", test: "同时列出不支持的证据" }, { at: MILESTONE_TIERS[2], name: "能收敛", test: "多方材料收成一句可行动的话" }],
  cashflow: [{ at: MILESTONE_TIERS[0], name: "排得出", test: "画出未来三个月的现金曲线" }, { at: MILESTONE_TIERS[1], name: "留得住", test: "提前一个月发现缺口" }, { at: MILESTONE_TIERS[2], name: "腾得开", test: "在缺口前腾出空间" }],
  uniteconomics: [{ at: MILESTONE_TIERS[0], name: "算得出单", test: "一单赚多少说得清" }, { at: MILESTONE_TIERS[1], name: "拆得开成本", test: "知道哪块成本能动" }, { at: MILESTONE_TIERS[2], name: "能设计", test: "改结构而不是改价格" }],
  channel: [{ at: MILESTONE_TIERS[0], name: "找得到路", test: "列出三条能触达客户的路" }, { at: MILESTONE_TIERS[1], name: "试得出", test: "试过并有数据" }, { at: MILESTONE_TIERS[2], name: "押得中", test: "把资源压在有效那条上" }],
  mentoring: [{ at: MILESTONE_TIERS[0], name: "说得清期望", test: "对方知道什么算做好" }, { at: MILESTONE_TIERS[1], name: "给得起空间", test: "不替对方做决定" }, { at: MILESTONE_TIERS[2], name: "带得出人", test: "对方能独立完成" }],
  mediating: [{ at: MILESTONE_TIERS[0], name: "坐得下来", test: "把两边拉到一张桌" }, { at: MILESTONE_TIERS[1], name: "说得中双方", test: "两边都觉得你懂他" }, { at: MILESTONE_TIERS[2], name: "谈得出方案", test: "冲突落成一个具体安排" }],
  metacog: [{ at: MILESTONE_TIERS[0], name: "看得见情绪", test: "能说出当下情绪如何影响判断" }, { at: MILESTONE_TIERS[1], name: "拆得开", test: "分出事实与解释" }, { at: MILESTONE_TIERS[2], name: "换得了视角", test: "用别人的立场重看一遍" }],
  focuscraft: [{ at: MILESTONE_TIERS[0], name: "坐得住", test: "一次专注 50 分钟" }, { at: MILESTONE_TIERS[1], name: "回得来", test: "被打断后能接上" }, { at: MILESTONE_TIERS[2], name: "留得出深水", test: "每周有整块不被打扰的时间" }],
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
    ["问出真相", { asking: 90, observing: 75 }, "别人愿意对你说他没对别人说过的话"],
  ]),
  ...lineOf("delivery", [
    ["独狼工坊", { coding: 30, prototyping: 30 }, "无搭档时「半座桥」的惩罚减半"],
    ["一人交付", { automation: 45, testing: 40 }, "收敛率按交付物计，不按项目数计"],
    ["自动流水线", { automation: 60, debugging: 55 }, "重复工作转成脚本，节省的时间进「自己的时间」"],
    ["无人值守", { automation: 75, testing: 65 }, "东西在你不看的时候也在跑"],
    ["一个人成军", { automation: 90, testing: 75 }, "一个人的产出看起来像一个小团队"],
  ]),
  ...lineOf("opening", [
    ["破冰", { coldopen: 30 }, "新面孔类怪物经验 ×1.5"],
    ["陌生局", { coldopen: 45, trustbuilding: 40 }, "进新场子额外记一条情境，加速特质举证"],
    ["引荐人", { trustbuilding: 60, keepingup: 45 }, "别人开始替你介绍人"],
    ["自来客", { trustbuilding: 75, introducing: 60 }, "有人主动找上门"],
    ["门被敲开", { coldopen: 90, trustbuilding: 75 }, "你想认识的人，基本都能认识到"],
  ]),
  ...lineOf("calibration", [
    ["铁口", { forecasting: 30 }, "押注时显示你在该领域的历史命中率"],
    ["赔率盘", { forecasting: 45, analysis: 40 }, "把握度自动按你的历史偏移校正"],
    ["预案", { forecasting: 60, retro: 50 }, "押注时同时写下「如果错了就做什么」"],
    ["先手", { forecasting: 75, observing: 60 }, "在事情发生前就摆好对账条件"],
    ["说了算", { forecasting: 90, analysis: 70 }, "你的判断被当成基准线，包括被你自己"],
  ]),
  ...lineOf("persuasion", [
    ["讲得清", { explaining: 30 }, "同一件事能用三句话说完"],
    ["带得动", { persuading: 45, presenting: 40 }, "提议被采纳率进入「说话有人听」的加成"],
    ["定调", { persuading: 60, negotiating: 50 }, "在别人还没定调时先给出框架"],
    ["背书", { persuading: 75, trustbuilding: 60 }, "你说的话本身成为理由"],
    ["一句定调", { persuading: 90, presenting: 75 }, "你开口之后，讨论的框架就变了"],
  ]),
  ...lineOf("business", [
    ["会算账", { finance: 30 }, "底牌快照自动提醒，跑道变化进事迹"],
    ["定得出价", { pricing: 45, finance: 40 }, "价格不再靠猜，有可复算的依据"],
    ["谈得成", { negotiating: 60, partnering: 50 }, "谈判类记录自动生成一条参照类"],
    ["拿得到钱", { pricing: 75, negotiating: 65 }, "从「有人用」走到「有人付钱」"],
    ["自己养活自己", { pricing: 90, finance: 75 }, "收入覆盖成本，且知道为什么"],
  ]),
  ...lineOf("organizing", [
    ["交得出去", { delegating: 30 }, "把一件事完整地交给别人，而不是分一半"],
    ["带得动人", { delegating: 45, feedback: 40 }, "给反馈之后对方真的改了"],
    ["立得住规矩", { processdesign: 60, delegating: 55 }, "流程写下来之后不用你盯"],
    ["不在也转", { processdesign: 75, hiring: 55 }, "你休假一周，东西照样在走"],
    ["组织自转", { processdesign: 90, hiring: 70 }, "你离开一个月，东西照样长"],
  ]),
  ...lineOf("body", [
    ["有日课", { training: 30 }, "训练类怪物经验 ×1.5"],
    ["抗得住", { training: 45, recovery: 40 }, "高压期的状态波动幅度变小"],
    ["恢复快", { sleepcraft: 60, recovery: 55 }, "挫折后回到基线的天数缩短"],
    ["常年在线", { training: 75, sleepcraft: 65 }, "身体不再是任何计划的变量"],
    ["身体不再是变量", { training: 90, sleepcraft: 75 }, "任何计划都不用再为身体留余量"],
  ]),
  ...lineOf("learning", [
    ["现学现卖", { learning: 30 }, "先做后补的学习方式获得加成"],
    ["拆得开", { research: 45, analysis: 40 }, "把一个大问题拆成能各自验证的小问题"],
    ["做实验", { experiment: 60, analysis: 55 }, "设计出能区分两种解释的观察"],
    ["自建方法", { experiment: 75, explaining: 60 }, "总结出别人也能照着做的做法"],
    ["自成一派", { experiment: 90, explaining: 75 }, "你的做法被别人当方法学"],
  ]),
  ...lineOf("writing", [
    ["写得完", { writing: 30 }, "连续四周每周产出一篇"],
    ["有人读", { writing: 45, headline: 40 }, "单篇触达 100 人"],
    ["有人转", { writing: 60, headline: 55 }, "写作类曝光进入「敢给人看」的加成"],
    ["有人付费", { writing: 75, pricing: 50 }, "因文字产生第一笔收入"],
    ["有人等你写", { writing: 90, headline: 75 }, "你不写的时候有人问你什么时候写"],
  ]),

  ...lineOf("scouting", [
    ["摸底", { recon: 30 }, "列得出三家真实竞品在卖什么"],
    ["拼图", { recon: 45, research: 40 }, "从零散信息里拼出对手的处境"],
    ["看穿打法", { recon: 60, analysis: 50 }, "说清对手靠什么活着"],
    ["预判动作", { recon: 75, forecasting: 55 }, "在对手动作之前押注，并且对账"],
    ["先知道", { recon: 90, forecasting: 70 }, "对手的动作你比大多数人早知道一步"],
  ]),
  ...lineOf("compounding", [
    ["记得住人", { keepingup: 30 }, "记得对方上次说过什么"],
    ["有来往", { keepingup: 45, trustbuilding: 40 }, "不只在有事时才联系"],
    ["被想起", { trustbuilding: 60, keepingup: 55 }, "别人遇到相关的事会想到你"],
    ["被推荐", { trustbuilding: 75, introducing: 60 }, "有人替你把你介绍出去"],
    ["人找上门", { trustbuilding: 90, keepingup: 75 }, "机会通过老关系自己找过来"],
  ]),
  ...lineOf("craft", [
    ["做得像", { prototyping: 30 }, "原型能骗过真实用户测出反应"],
    ["做得省", { prototyping: 45, productdesign: 40 }, "用最少的东西验掉最大的未知"],
    ["做得稳", { testing: 60, debugging: 50 }, "测试真的挡下过一次事故"],
    ["做得久", { productdesign: 75, testing: 65 }, "东西撑过第三次需求变化"],
    ["做的东西留得住", { productdesign: 90, testing: 75 }, "东西过了三年还有人在用"],
  ]),
  ...lineOf("grit", [
    ["撑得住", { takingheat: 30 }, "被批评后不当场反驳"],
    ["缓得过来", { recovery: 45, takingheat: 40 }, "挫折后能说出自己现在状态不好"],
    ["不怕难看", { takingheat: 60, feedback: 50 }, "主动去找对自己不利的评价"],
    ["越挫越准", { recovery: 75, retro: 65 }, "每次挫折都换回一条能用的判断"],
    ["摔不散", { recovery: 90, retro: 75 }, "再难看的一次也能拆出能用的东西"],
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
  capstone(
    "独行作坊",
    "独行作坊",
    ["craft4", "delivery3"],
    { testing: 70, automation: 65 },
    "做得稳的东西自己也能一个人交付"
  ),
  capstone(
    "门客",
    "门客",
    ["compounding4", "persuasion3"],
    { keepingup: 70, persuading: 65 },
    "老关系里说得上话"
  ),
  capstone(
    "斥候",
    "斥候",
    ["scouting4", "interview3"],
    { recon: 70, asking: 65 },
    "情报既来自公开信息也来自人"
  ),
  capstone(
    "守夜人",
    "守夜人",
    ["grit4", "organizing3"],
    { recovery: 70, processdesign: 65 },
    "扛得住的人才立得住规矩"
  ),
  capstone(
    "说书匠",
    "说书匠",
    ["writing4", "persuasion3"],
    { writing: 70, persuading: 65 },
    "写的和讲的是同一套东西"
  ),
  capstone(
    "账房",
    "账房",
    ["business4", "calibration3"],
    { finance: 70, forecasting: 65 },
    "钱的判断也进对账"
  ),
  capstone(
    "试炼场",
    "试炼场",
    ["learning4", "craft3"],
    { experiment: 70, prototyping: 65 },
    "做实验和做东西是同一件事"
  ),
  capstone(
    "老兵",
    "老兵",
    ["body4", "grit3"],
    { training: 70, takingheat: 65 },
    "身体和心力互相兜底"
  ),
  capstone(
    "引路人",
    "引路人",
    ["opening4", "compounding3"],
    { coldopen: 70, keepingup: 65 },
    "新认识的人会留下来"
  ),
  capstone(
    "庖丁",
    "庖丁",
    ["craft4", "learning3"],
    { productdesign: 70, experiment: 65 },
    "做之前先知道要验什么"
  ),
  capstone(
    "掌柜",
    "掌柜",
    ["business4", "organizing3"],
    { pricing: 70, delegating: 65 },
    "赚钱的事有人接得住"
  ),
  capstone(
    "测风人",
    "测风人",
    ["calibration4", "scouting3"],
    { forecasting: 70, recon: 65 },
    "押注之前先看清对手"
  ),
  capstone(
    "传薪",
    "传薪",
    ["learning4", "writing3"],
    { explaining: 70, writing: 65 },
    "方法写下来别人能照做"
  ),
  capstone(
    "坐堂",
    "坐堂",
    ["interview4", "business3"],
    { asking: 70, pricing: 65 },
    "访谈能直接谈成一笔"
  ),
  capstone(
    "修桥人",
    "修桥人",
    ["organizing4", "compounding3"],
    { delegating: 70, trustbuilding: 65 },
    "把人和事都接起来"
  ),
  capstone(
    "铁砧心",
    "铁砧心",
    ["grit4", "body3"],
    { takingheat: 70, training: 65 },
    "挨得住也练得动"
  ),
  capstone(
    "走线人",
    "走线人",
    ["scouting4", "opening3"],
    { recon: 70, coldopen: 65 },
    "情报和人脉同时往前推"
  ),
  capstone(
    "定盘星",
    "定盘星",
    ["calibration4", "persuasion3"],
    { forecasting: 70, persuading: 65 },
    "算得准而且说得动"
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

export type SkillStageNode = {
  /**
   * 稳定 id。用户自己收下的拆解带 id ——
   * 有了它，以后改名、增删同级的小技能，已经点亮的证据不会挪位。
   * 代码里内置的拆解不带 id，按下标定位。
   */
  id?: string;
  name: string;
  test: string;
};

export type SkillStage = {
  tier: number;
  /** 入门 / 基础 / 精通 / 专家 */
  name: string;
  /** 过了这一级算什么。 */
  standard: string;
  /** 这一级下面必须点齐的小技能。 */
  nodes: SkillStageNode[];
};

/**
 * 阶段拆解：技能 → 入门/基础/精通/专家，每一级挂几个小技能。
 *
 * 这才叫"拆成子技能"——把小技能点齐才算过了这一级，
 * 而不是给同一件事分三档。
 *
 * 已拆开的先放这里；没拆的技能仍然退回到三档 milestones，
 * 界面会标出来"这项还没拆"。逐项拆是慢工，一次拆不完六十三项。
 */
export const SKILL_STAGES: Record<string, SkillStage[]> = {
  coding: [
    { tier: 1, name: "入门", standard: "能把想法变成能跑的东西", nodes: [{ name: "跑通环境", test: "从零把开发环境搭起来并跑通一个 hello world" }, { name: "读懂报错", test: "看到报错能定位到是哪一行、哪个概念" }, { name: "改别人的代码", test: "在一份不是自己写的代码里改对一个地方" }] },
    { tier: 2, name: "基础", standard: "能独立做出一个有人用的小东西", nodes: [{ name: "拆成函数", test: "把一坨代码拆成各自职责清楚的函数" }, { name: "接一个外部服务", test: "接通一个 API 并处理它的失败情况" }, { name: "存得住数据", test: "设计一张表并让数据正确读写" }, { name: "发出去", test: "把东西部署到别人能访问的地方" }] },
    { tier: 3, name: "精通", standard: "代码能被别人接手", nodes: [{ name: "命名讲得清", test: "别人不问你就知道这个函数在干嘛" }, { name: "边界想清楚", test: "空值、超时、并发各写了怎么办" }, { name: "有测试兜底", test: "关键路径出错时测试先叫" }] },
    { tier: 4, name: "专家", standard: "撑得住变化", nodes: [{ name: "扛过三次改需求", test: "同一份代码经历三次需求变化没有推倒重来" }, { name: "能拆能合", test: "把一个模块拆开或合并而不牵动其它地方" }, { name: "留得下文档", test: "半年后自己回来还看得懂为什么这么写" }] },
  ],
  aiorchestration: [
    { tier: 1, name: "入门", standard: "能让 AI 完成一件具体的事", nodes: [{ name: "说得清任务", test: "一次把要什么、不要什么写清楚" }, { name: "给得出例子", test: "用一两个例子把标准定下来" }] },
    { tier: 2, name: "基础", standard: "能把一件大事拆给 AI 分步做", nodes: [{ name: "拆步骤", test: "把一个大任务拆成能各自验收的小步" }, { name: "接得上下文", test: "让上一步的产出成为下一步的输入" }, { name: "会验收", test: "能指出它哪一步偷懒了" }] },
    { tier: 3, name: "精通", standard: "能搭成不用你盯的流水", nodes: [{ name: "写死规则", test: "把判断标准写进代码而不是每次提醒它" }, { name: "兜底失败", test: "它答错时有人或代码接住" }, { name: "留证据", test: "每次产出能追到是哪一步出的" }] },
    { tier: 4, name: "专家", standard: "能让别人也用得起来", nodes: [{ name: "别人照着能跑", test: "另一个人拿你的流程也能出结果" }, { name: "成本算得清", test: "知道一次跑下来花多少钱、多少时间" }] },
  ],
  analysis: [
    { tier: 1, name: "入门", standard: "能把一堆数字变成一张图", nodes: [{ name: "洗得动数据", test: "把脏数据处理成能用的表" }, { name: "画得出图", test: "用一张图把一件事说清楚" }] },
    { tier: 2, name: "基础", standard: "能回答一个有人问的问题", nodes: [{ name: "先定问题", test: "动手前写下要回答什么" }, { name: "选得对口径", test: "说得清分子分母各是什么" }, { name: "看得出异常", test: "发现一个和预期不符的地方并追下去" }] },
    { tier: 3, name: "精通", standard: "能撑住一个决策", nodes: [{ name: "分得清相关与因果", test: "说得出为什么不能只看相关" }, { name: "找得到混淆", test: "指出一个可能同时影响两边的因素" }, { name: "给得出置信", test: "说得清这个结论在什么条件下不成立" }] },
    { tier: 4, name: "专家", standard: "能设计出验证方式", nodes: [{ name: "设计对照", test: "设计一个能区分两种解释的观察" }, { name: "跑得起来", test: "在真实环境里做完并得出结论" }, { name: "结论被采纳", test: "有人因为这份分析改了做法" }] },
  ],
  asking: [
    { tier: 1, name: "入门", standard: "敢在场面上开口问", nodes: [{ name: "问出第一句", test: "在会上问出一个别人没问的问题" }, { name: "不怕沉默", test: "问完等对方想，不急着自己补话" }] },
    { tier: 2, name: "基础", standard: "问到具体的事实", nodes: [{ name: "换成具体", test: "把「怎么样」换成「上次是什么时候」" }, { name: "追一层", test: "对一个回答再追问一次为什么" }, { name: "不给答案", test: "不在问题里塞进自己想要的答案" }] },
    { tier: 3, name: "精通", standard: "问出对方原本不打算说的", nodes: [{ name: "先给再要", test: "先给出对方在意的东西再提问" }, { name: "问代价", test: "问对方为此放弃过什么" }, { name: "敢问难堪的", test: "把不好问的那句真的问出口" }] },
    { tier: 4, name: "专家", standard: "问题本身成为工具", nodes: [{ name: "设计问题组", test: "一组问题能区分两种可能" }, { name: "教得会别人问", test: "别人用你的问法也问出了东西" }] },
  ],
  writing: [
    { tier: 1, name: "入门", standard: "能把一件事写完", nodes: [{ name: "写得完", test: "连续四周每周写完一篇" }, { name: "说清一件事", test: "一篇只讲一件事，讲完" }] },
    { tier: 2, name: "基础", standard: "有人愿意读完", nodes: [{ name: "开头抓住", test: "前三句让人愿意往下读" }, { name: "有结构", test: "写之前列得出骨架" }, { name: "删得掉", test: "删掉自己喜欢但没用的那段" }] },
    { tier: 3, name: "精通", standard: "读者会照着做", nodes: [{ name: "给得出步骤", test: "有人照你写的做成了一件事" }, { name: "举得出例子", test: "抽象的话后面跟着一个具体例子" }, { name: "留得下句子", test: "有人引用你的原句" }] },
    { tier: 4, name: "专家", standard: "写作本身带来东西", nodes: [{ name: "有人等更", test: "有人问你什么时候写下一篇" }, { name: "换来机会", test: "因为写作带来一次合作或收入" }] },
  ],
  negotiating: [
    { tier: 1, name: "入门", standard: "敢谈", nodes: [{ name: "先开口", test: "主动提出一个价格或条件" }, { name: "问清底细", test: "谈之前问清对方在意什么" }] },
    { tier: 2, name: "基础", standard: "守得住底线", nodes: [{ name: "写下底线", test: "谈之前写下走开的条件" }, { name: "敢沉默", test: "对方不出声时不先降价" }, { name: "敢走开", test: "至少一次因为不合适而走开" }] },
    { tier: 3, name: "精通", standard: "把饼做大", nodes: [{ name: "找第三选项", test: "提出一个双方都更好的方案" }, { name: "换而不让", test: "每次让步都换回一样东西" }] },
    { tier: 4, name: "专家", standard: "谈完还是朋友", nodes: [{ name: "留后路", test: "谈崩之后关系还在" }, { name: "对方也满意", test: "对方事后主动再来找你" }] },
  ],
  forecasting: [
    { tier: 1, name: "入门", standard: "敢押", nodes: [{ name: "写下预测", test: "写一条带日期、能判真假的预测" }, { name: "写把握度", test: "同时写下几成把握" }] },
    { tier: 2, name: "基础", standard: "会对账", nodes: [{ name: "到期就结", test: "到期当天结算，不拖" }, { name: "认落空", test: "落空时写下哪里想错了" }, { name: "攒够十条", test: "累计对账十条以上" }] },
    { tier: 3, name: "精通", standard: "押得准", nodes: [{ name: "看基准率", test: "押之前先看同类事情的历史比例" }, { name: "分开领域", test: "知道自己在哪类事上准、哪类不准" }, { name: "校准收窄", test: "把握度和实际命中率的差在缩小" }] },
    { tier: 4, name: "专家", standard: "先手", nodes: [{ name: "事前定条件", test: "事情发生前就摆好对账标准" }, { name: "写预案", test: "同时写下「如果错了就做什么」" }] },
  ],
  listening: [
    { tier: 1, name: "入门", standard: "能听完", nodes: [{ name: "不打断", test: "一次对话完整听完对方三段话" }, { name: "复述得出", test: "能把对方的意思复述一遍" }] },
    { tier: 2, name: "基础", standard: "听得出没说的", nodes: [{ name: "听出回避", test: "指出对方绕开的那部分" }, { name: "听出情绪", test: "说得出对方此刻在意什么" }] },
    { tier: 3, name: "精通", standard: "听完会改", nodes: [{ name: "改过方案", test: "因为听到的东西改掉自己的做法" }, { name: "记下反例", test: "把不利于自己的那句记下来" }] },
    { tier: 4, name: "专家", standard: "让人愿意说", nodes: [{ name: "对方说更多", test: "对方主动说出原本不打算说的" }, { name: "被找来说", test: "有人专门来找你说事" }] },
  ],
  retro: [
    { tier: 1, name: "入门", standard: "能回头看", nodes: [{ name: "每周写一条", test: "连续四周写下学到了什么" }, { name: "写具体", test: "写的是具体那一次，不是感想" }] },
    { tier: 2, name: "基础", standard: "找得到真原因", nodes: [{ name: "追到根", test: "找到的不是「不够努力」这种表面原因" }, { name: "分开事实与解释", test: "把发生了什么和你怎么解释分开写" }] },
    { tier: 3, name: "精通", standard: "复盘之后真的变了", nodes: [{ name: "改一条做法", test: "因为复盘改掉一个具体做法" }, { name: "不再重复", test: "同类错误没有再犯第三次" }] },
    { tier: 4, name: "专家", standard: "复盘变成系统", nodes: [{ name: "定判断规则", test: "从复盘里立下一条可复用的规则" }, { name: "规则被推翻过", test: "后来有一条规则被自己推翻并替换" }] },
  ],
  coldopen: [
    { tier: 1, name: "入门", standard: "发得出去", nodes: [{ name: "发出第一条", test: "给一个陌生人发出第一条消息" }, { name: "写清来意", test: "一句话说清你是谁、要什么" }] },
    { tier: 2, name: "基础", standard: "有人回", nodes: [{ name: "先给价值", test: "开口前先给出对方用得上的东西" }, { name: "回复率过三成", test: "十条里有三条以上得到回复" }] },
    { tier: 3, name: "精通", standard: "约得到人", nodes: [{ name: "约成一次", test: "从冷开口约到一次真实对话" }, { name: "准备好问题", test: "见面前写好三个具体问题" }] },
    { tier: 4, name: "专家", standard: "不再需要冷开口", nodes: [{ name: "有人引荐", test: "别人主动替你介绍" }, { name: "有人找来", test: "有人主动找上门" }] },
  ],
  pricing: [
    { tier: 1, name: "入门", standard: "敢报价", nodes: [{ name: "给出一个价", test: "对一件东西说出价格" }, { name: "说得出依据", test: "价格背后有一条能说清的理由" }] },
    { tier: 2, name: "基础", standard: "算得清成本", nodes: [{ name: "拆得开成本", test: "说得出一单的成本由哪几块构成" }, { name: "算得出毛利", test: "一单赚多少说得清" }] },
    { tier: 3, name: "精通", standard: "按价值定价", nodes: [{ name: "问出价值", test: "问清对方省了多少或多赚了多少" }, { name: "涨过一次", test: "涨价并观察了反应" }] },
    { tier: 4, name: "专家", standard: "价格成为设计", nodes: [{ name: "改结构不改价", test: "通过改产品结构而不是降价来成交" }, { name: "有人照价买", test: "有人不还价直接买" }] },
  ],
  trustbuilding: [
    { tier: 1, name: "入门", standard: "小事上兑现", nodes: [{ name: "说到做到一次", test: "答应的小事按时做到" }, { name: "不夸大", test: "介绍自己时不加水分" }] },
    { tier: 2, name: "基础", standard: "先给出去", nodes: [{ name: "主动帮一次", test: "在没有回报预期时帮上一个人" }, { name: "介绍两个人", test: "把两个该认识的人介绍到一起" }] },
    { tier: 3, name: "精通", standard: "被托付", nodes: [{ name: "有人交事给你", test: "有人把重要的事交给你办" }, { name: "坏消息先说", test: "出问题时你先开口" }] },
    { tier: 4, name: "专家", standard: "被推荐", nodes: [{ name: "有人替你背书", test: "有人在你不在场时推荐你" }, { name: "旧关系还活着", test: "两年以上的关系仍在往来" }] },
  ],
};

export function stagesOf(key: string): SkillStage[] | null {
  return SKILL_STAGES[key] ?? null;
}
