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

/**
 * 层：技能树的纵轴。
 *
 * 分组（信息/表达/制作…）是**横轴**，说的是这门手艺属于哪一类；
 * 层是纵轴，说的是它有多深。只有横轴的时候整张表看着全是平的基础能力。
 *
 * 一条规矩：层越高，前置越必须跨领域。
 * 高级能力不是「更难的技能」，是**在压力下把好几条低层技能同时用出来** ——
 * 所以内核层的前置必然横跨信息与关系、制作与经营。
 */
export const SKILL_LAYERS = [
  "component",
  "circuit",
  "module",
  "core",
  "signature",
] as const;
export type SkillLayer = (typeof SKILL_LAYERS)[number];

export const SKILL_LAYER_NAMES: Record<SkillLayer, string> = {
  component: "元件",
  circuit: "回路",
  module: "模组",
  core: "内核",
  signature: "印记",
};

export const SKILL_LAYER_GLOSS: Record<SkillLayer, string> = {
  component: "基本功。小到一周内能做到，底下必须密，不然一上来就是大技能，无从下手",
  circuit: "基础技能。单独一条线上的手艺",
  module: "复合技能。几条基础压在一起才成立",
  core: "专精。前置必然跨领域，这是「高级」的定义",
  signature: "印记。一个人留在世界上的签名，这辈子点亮两三个就够",
};

export type SkillDef = {
  key: string;
  name: string;
  /** 在纵轴的哪一层。 */
  layer: SkillLayer;
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
  { key: "analysis", name: "分析", gloss: "把数字变成能下判断的东西", group: "info", main: "INT", layer: "module", requires: ["research", "spreadsheet", "arithmetic"] },
  { key: "research", name: "调研", gloss: "找得到一手资料，并判断可不可信", group: "info", main: "INT", layer: "module", requires: ["search", "skim", "trace"] },
  { key: "finstmt", name: "读表", gloss: "从报表看出一家公司靠什么活着", group: "info", main: "RES", layer: "module", requires: ["analysis", "arithmetic"] },
  { key: "recon", name: "侦察", gloss: "搞清楚对手在卖什么、怎么活", group: "info", main: "WIS", layer: "module", requires: ["research", "observing"] },
  { key: "asking", name: "质询", gloss: "问出别人没问的那个问题", group: "info", main: "WIS", layer: "circuit", requires: ["askbasic", "listening"] },
  { key: "listening", name: "倾听", gloss: "听完，包括对方没说出口的", group: "info", main: "WIS", layer: "component" },
  { key: "observing", name: "观察", gloss: "现场看得见细节，事后说得出来", group: "info", main: "WIS", layer: "component" },
  { key: "experiment", name: "验证", gloss: "设计一个能判真假的观察", group: "info", main: "INT", layer: "circuit", requires: ["record", "arithmetic"] },

  { key: "writing", name: "写作", gloss: "把想法变成别人能读的文字", group: "express", main: "CHA", layer: "circuit", requires: ["summarize", "formatting"] },
  { key: "presenting", name: "演讲", gloss: "站着把一件事讲完", group: "express", main: "CHA", layer: "module", requires: ["explaining", "structure"] },
  { key: "negotiating", name: "谈判", gloss: "在有利益冲突时谈出条件", group: "express", main: "RES", layer: "module", requires: ["listening", "probing", "arithmetic"] },
  { key: "persuading", name: "说服", gloss: "让对方改变决定", group: "express", main: "CHA", layer: "module", requires: ["profiling", "explaining"] },
  { key: "coldopen", name: "破冰", gloss: "对不认识的人开第一句口", group: "express", main: "LCK", layer: "circuit", requires: ["askbasic"] },
  { key: "jpbiz", name: "商务日语", gloss: "用日语把正经事谈完", group: "express", main: "CHA", layer: "circuit" },
  { key: "explaining", name: "讲解", gloss: "把复杂的事说到别人听懂", group: "express", main: "CHA", layer: "circuit", requires: ["summarize", "paraphrase"] },
  { key: "headline", name: "拟题", gloss: "一句话让人愿意点进来", group: "express", main: "CHA", layer: "circuit", requires: ["summarize"] },

  { key: "coding", name: "编码", gloss: "自己动手把东西做出来", group: "make", main: "DEX", layer: "circuit", requires: ["toolcraft"] },
  { key: "productdesign", name: "取舍", gloss: "决定做什么、不做什么", group: "make", main: "DEX", layer: "module", requires: ["prototyping", "profiling"] },
  { key: "prototyping", name: "原型", gloss: "快速做个能试的东西", group: "make", main: "DEX", layer: "module", requires: ["coding", "toolcraft"] },
  { key: "aiorchestration", name: "编排", gloss: "指挥 AI 分步完成一件事并验收", group: "make", main: "DEX", layer: "module", requires: ["explaining", "testing"] },
  { key: "automation", name: "自动化", gloss: "把重复的事交给机器", group: "make", main: "DEX", layer: "module", requires: ["coding", "toolcraft"] },
  { key: "debugging", name: "调试", gloss: "定位并修掉出错的地方", group: "make", main: "DEX", layer: "circuit", requires: ["coding"] },
  { key: "testing", name: "测试", gloss: "提前拦下会出事的地方", group: "make", main: "WIL", layer: "circuit", requires: ["coding"] },

  { key: "pricing", name: "定价", gloss: "给东西定出一个站得住的价", group: "run", main: "RES", layer: "module", requires: ["finance", "negotiating"] },
  { key: "finance", name: "财务", gloss: "算得清钱从哪来、到哪去", group: "run", main: "RES", layer: "circuit", requires: ["arithmetic", "spreadsheet"] },
  { key: "hiring", name: "招募", gloss: "找到并留住合适的人", group: "run", main: "CHA", layer: "module", requires: ["judgepeople", "asking"] },
  { key: "delegating", name: "授权", gloss: "把一件完整的事交出去", group: "run", main: "WIL", layer: "module", requires: ["explaining", "trustbuilding"] },
  { key: "processdesign", name: "流程", gloss: "把做法写成别人能照做的步骤", group: "run", main: "WIL", layer: "module", requires: ["explaining", "record"] },
  { key: "support", name: "客服", gloss: "接住客户的问题并改掉根因", group: "run", main: "CHA", layer: "circuit", requires: ["listening", "paraphrase"] },
  { key: "procurement", name: "采购", gloss: "买到该买的，条件还不错", group: "run", main: "RES", layer: "circuit", requires: ["arithmetic", "askbasic"] },
  { key: "partnering", name: "合作", gloss: "促成并维持一段合作", group: "run", main: "RES", layer: "module", requires: ["trustbuilding", "negotiating"] },

  { key: "retro", name: "复盘", gloss: "回头看，找到真正的原因", group: "self", main: "WIS", layer: "circuit", requires: ["record"] },
  { key: "forecasting", name: "预测", gloss: "事前押注，事后对账", group: "self", main: "INT", layer: "circuit", requires: ["record", "arithmetic"] },
  { key: "scheduling", name: "排期", gloss: "把时间排给该做的事", group: "self", main: "WIL", layer: "circuit", requires: ["record", "punctual"] },
  { key: "sleepcraft", name: "睡眠", gloss: "睡够、睡稳", group: "self", main: "CON", layer: "component" },
  { key: "training", name: "训练", gloss: "按计划练，而不是凭心情", group: "self", main: "STR", layer: "circuit", requires: ["punctual"] },
  { key: "recovery", name: "恢复", gloss: "察觉状态、停得下、回得来", group: "self", main: "CON", layer: "circuit", requires: ["record"] },
  { key: "learning", name: "学习", gloss: "从不会到能用", group: "self", main: "INT", layer: "circuit", requires: ["skim", "record"] },

  { key: "trustbuilding", name: "信用", gloss: "让别人愿意把事交给你", group: "relate", main: "CHA", layer: "module", requires: ["punctual", "statusreport"] },
  { key: "askinghelp", name: "求助", gloss: "卡住时开得了口", group: "relate", main: "RES", layer: "circuit", requires: ["statusreport"] },
  { key: "feedback", name: "反馈", gloss: "把问题说到对方听得进去", group: "relate", main: "CHA", layer: "circuit", requires: ["paraphrase", "explaining"] },
  { key: "takingheat", name: "受评", gloss: "被批评时还能听", group: "relate", main: "WIL", layer: "circuit", requires: ["listening", "paraphrase"] },
  { key: "conflict", name: "调解", gloss: "把冲突摆上桌并谈出安排", group: "relate", main: "CHA", layer: "module", requires: ["listening", "feedback"] },
  { key: "introducing", name: "自荐", gloss: "三十秒说清自己在做什么", group: "relate", main: "LCK", layer: "circuit", requires: ["summarize"] },
  { key: "keepingup", name: "维系", gloss: "关系不因为没事就断", group: "relate", main: "LCK", layer: "circuit", requires: ["remembernames", "record"] },

  // ---------------- 进阶：站在基础之上，有分叉 ----------------
  { key: "rhetoric", name: "修辞", gloss: "同一件事说得更有力", group: "express", main: "CHA", layer: "circuit", requires: ["writing"] },
  { key: "structure", name: "结构", gloss: "先有骨架再有文字", group: "express", main: "CHA", layer: "circuit", requires: ["summarize", "synthesis"] },
  { key: "narrative", name: "叙事", gloss: "把信息装进有起伏的故事里", group: "express", main: "CHA", layer: "module", requires: ["structure", "writing"] },
  { key: "teachingwrite", name: "教学", gloss: "写出别人能照着做的东西", group: "express", main: "CHA", layer: "module", requires: ["explaining", "structure"] },
  { key: "architecture", name: "架构", gloss: "决定东西怎么分块、边界在哪", group: "make", main: "DEX", layer: "module", requires: ["coding", "structure"] },
  { key: "performance", name: "调优", gloss: "找出慢在哪并改快", group: "make", main: "DEX", layer: "module", requires: ["debugging", "analysis"] },
  { key: "systemcraft", name: "体系设计", gloss: "搭一个不用你盯的系统", group: "make", main: "DEX", layer: "core", requires: ["architecture", "automation", "processdesign"] },
  { key: "dataplumb", name: "数据流", gloss: "把数据接通、洗净、看得见", group: "make", main: "INT", layer: "module", requires: ["spreadsheet", "coding"] },
  { key: "probing", name: "追问", gloss: "顺着回答往下追到事实", group: "info", main: "WIS", layer: "circuit", requires: ["askbasic", "listening"] },
  { key: "profiling", name: "侧写", gloss: "说清一个人在意什么、会怎么选", group: "info", main: "WIS", layer: "circuit", requires: ["observing", "listening"] },
  { key: "synthesis", name: "归纳", gloss: "把散的材料收成一句能行动的话", group: "info", main: "INT", layer: "circuit", requires: ["summarize", "record"] },
  { key: "cashflow", name: "现金流", gloss: "看得见未来几个月的现金曲线", group: "run", main: "RES", layer: "module", requires: ["finance", "forecasting"] },
  { key: "uniteconomics", name: "单位经济", gloss: "一单赚多少、成本在哪块", group: "run", main: "RES", layer: "module", requires: ["pricing", "finance"] },
  { key: "channel", name: "渠道", gloss: "找到并押中触达客户的路", group: "run", main: "RES", layer: "module", requires: ["recon", "partnering"] },
  { key: "mentoring", name: "带教", gloss: "把人带到能独立完成", group: "relate", main: "CHA", layer: "module", requires: ["feedback", "delegating"] },
  { key: "mediating", name: "斡旋", gloss: "在两方之间谈出一个安排", group: "relate", main: "CHA", layer: "module", requires: ["conflict", "listening"] },
  { key: "metacog", name: "自省", gloss: "看得见自己的情绪怎么影响判断", group: "self", main: "WIS", layer: "module", requires: ["retro", "recovery"] },
  { key: "focuscraft", name: "专注", gloss: "坐得住，被打断也回得来", group: "self", main: "WIL", layer: "circuit", requires: ["shield", "punctual"] },

  // —— 元件：基本功。底下必须密 ——
  { key: "record", name: "记录", gloss: "当天把发生的事写下来", group: "self", main: "INT", layer: "component" },
  { key: "search", name: "检索", gloss: "找得到那份东西", group: "info", main: "INT", layer: "component" },
  { key: "skim", name: "速读", gloss: "十分钟判断一份东西值不值得细读", group: "info", main: "INT", layer: "component" },
  { key: "summarize", name: "摘要", gloss: "把一页压成三句", group: "express", main: "INT", layer: "component" },
  { key: "askbasic", name: "提问", gloss: "当场把不懂的地方问出口", group: "info", main: "CHA", layer: "component" },
  { key: "paraphrase", name: "复述", gloss: "把对方的意思原样说回去", group: "relate", main: "WIS", layer: "component" },
  { key: "remembernames", name: "记名", gloss: "记住人，和他在意什么", group: "relate", main: "CHA", layer: "component" },
  { key: "toolcraft", name: "工具", gloss: "键盘、终端、常用软件不挡路", group: "make", main: "DEX", layer: "component" },
  { key: "arithmetic", name: "算术", gloss: "心算量级，单位不出错", group: "info", main: "INT", layer: "component" },
  { key: "spreadsheet", name: "制表", gloss: "把散的数据收进一张能看的表", group: "info", main: "DEX", layer: "component" },
  { key: "formatting", name: "排版", gloss: "让一份东西看起来能读", group: "express", main: "DEX", layer: "component" },
  { key: "punctual", name: "守时", gloss: "说几点就几点", group: "self", main: "WIL", layer: "component" },
  { key: "statusreport", name: "交代", gloss: "不用人问就说清进展", group: "relate", main: "CHA", layer: "component" },
  { key: "backup", name: "备份", gloss: "东西不会丢", group: "make", main: "RES", layer: "component" },
  { key: "shield", name: "屏障", gloss: "挡住推荐流对注意力的侵占", group: "self", main: "WIL", layer: "component" },
  { key: "trace", name: "溯源", gloss: "一句话追回它最初从哪来", group: "info", main: "WIS", layer: "component" },

  // —— 回路：AI 时代新长出来的基础 ——
  { key: "silence", name: "缄默", gloss: "决定什么不写下来、不上传、不进任何模型", group: "self", main: "WIL", layer: "circuit", requires: ["record"] },
  { key: "spotfake", name: "识伪", gloss: "认出幻觉、认出合成的图和话", group: "info", main: "WIS", layer: "circuit", requires: ["trace", "observing"] },

  // —— 模组：几条基础压在一起 ——
  { key: "interview", name: "采访", gloss: "把一个人问开，问到他原本不打算说的", group: "info", main: "CHA", layer: "module", requires: ["probing", "listening", "profiling", "coldopen"] },
  { key: "interrogate", name: "审讯", gloss: "交叉盘问 AI 的产出，逼出它没把握的那部分", group: "make", main: "INT", layer: "module", requires: ["spotfake", "probing", "testing"] },
  { key: "fleet", name: "编队", gloss: "同时指挥多个 agent 分工，让它们互相检查", group: "make", main: "INT", layer: "module", requires: ["aiorchestration", "processdesign"] },
  { key: "judgepeople", name: "识人", gloss: "说得出一个人靠什么做决定", group: "relate", main: "WIS", layer: "module", requires: ["profiling", "observing"] },
  { key: "refer", name: "引荐", gloss: "把该认识的两个人接上，事后两边都谢你", group: "relate", main: "CHA", layer: "module", requires: ["remembernames", "trustbuilding"] },
  { key: "redundancy", name: "冗余", gloss: "预设它会挂，并且挂了不出事", group: "make", main: "RES", layer: "module", requires: ["testing", "backup"] },
  { key: "ship", name: "发布", gloss: "把东西真的送到别人手上", group: "make", main: "WIL", layer: "module", requires: ["prototyping", "formatting"] },
  { key: "reverseeng", name: "逆向", gloss: "看着一个成品，倒推它是怎么做出来的", group: "make", main: "INT", layer: "module", requires: ["observing", "debugging", "structure"] },
  { key: "oncall", name: "排障", gloss: "出事第一个到，并且能把它按下去", group: "make", main: "CON", layer: "module", requires: ["debugging", "redundancy"] },

  // —— 内核：前置跨领域，这才叫高级 ——
  { key: "duediligence", name: "尽职调查", gloss: "把一家公司、一个人查到底", group: "info", main: "WIS", layer: "core", requires: ["research", "interview", "finstmt", "recon"] },
  { key: "acceptance", name: "验收", gloss: "判断一份产出到底行不行，并说得出为什么", group: "info", main: "INT", layer: "core", requires: ["interrogate", "testing", "experiment"] },
  { key: "framing", name: "定题", gloss: "决定该回答哪个问题", group: "info", main: "WIS", layer: "core", requires: ["synthesis", "asking", "productdesign"] },
  { key: "decompose", name: "拆解", gloss: "把一坨模糊的大事拆成能各自验收的小块", group: "make", main: "INT", layer: "core", requires: ["architecture", "scheduling", "processdesign"] },
  { key: "orgdesign", name: "组织设计", gloss: "决定谁负责什么、谁向谁交代", group: "run", main: "CHA", layer: "core", requires: ["delegating", "hiring", "processdesign"] },
  { key: "managingup", name: "向上管理", gloss: "让上面的人做出更好的决定", group: "express", main: "CHA", layer: "core", requires: ["persuading", "profiling", "statusreport"] },
  { key: "revenue", name: "营收设计", gloss: "设计钱怎么进来，而不只是定一个价", group: "run", main: "RES", layer: "core", requires: ["uniteconomics", "channel", "pricing"] },
  { key: "crisis", name: "危机处理", gloss: "事情烧起来的时候把它按住", group: "run", main: "CON", layer: "core", requires: ["oncall", "conflict", "statusreport"] },
  { key: "integration", name: "集成", gloss: "用现成零件拼出真能用的东西", group: "make", main: "DEX", layer: "core", requires: ["ship", "fleet", "architecture", "reverseeng"] },
  { key: "transcode", name: "转译", gloss: "在两个不互通的世界之间搬运意思，两边都不觉得被简化", group: "express", main: "WIS", layer: "core", requires: ["explaining", "narrative", "profiling"] },
  { key: "clone", name: "分身", gloss: "把自己的做法固化成机器能跑的东西", group: "make", main: "INT", layer: "core", requires: ["processdesign", "automation", "fleet"] },
  { key: "offline", name: "断网", gloss: "工具全挂那天，照样把事做完", group: "self", main: "CON", layer: "core", requires: ["arithmetic", "record", "learning"] },
  { key: "humanproof", name: "人证", gloss: "证明这件事确实是人做的", group: "info", main: "WIS", layer: "core", requires: ["trace", "spotfake", "record"] },
  { key: "compounding", name: "复利写作", gloss: "写的东西越积越值钱，而不是越写越累", group: "express", main: "WIL", layer: "core", requires: ["narrative", "teachingwrite", "keepingup"] },
  { key: "curation", name: "记忆管理", gloss: "决定组织记住什么、忘掉什么、什么时候拿出来", group: "info", main: "INT", layer: "core", requires: ["synthesis", "trace", "processdesign"] },

  // —— 印记：一个职业一件，全树最深 ——
  { key: "judgement", name: "独立判断", gloss: "没人给答案的时候自己判，并且敢押", group: "info", main: "WIS", layer: "signature", requires: ["acceptance", "forecasting", "metacog"] },
  { key: "requestion", name: "换题", gloss: "换掉问题本身，让整个结论翻过来", group: "info", main: "WIS", layer: "signature", requires: ["framing", "duediligence"] },
  { key: "handover", name: "交接", gloss: "别人接过你的拆解就能直接开工", group: "make", main: "CHA", layer: "signature", requires: ["decompose", "teachingwrite"] },
  { key: "settingtone", name: "定调", gloss: "定下这件事该怎么说，两边都点头", group: "express", main: "CHA", layer: "signature", requires: ["transcode", "managingup"] },
  { key: "selfrunning", name: "自转", gloss: "东西在你不看的时候还在跑，并且有人在用", group: "make", main: "RES", layer: "signature", requires: ["integration", "redundancy"] },
  { key: "ownership", name: "担责", gloss: "拍板，出事不归因给条件", group: "run", main: "WIL", layer: "signature", requires: ["crisis", "judgement"] },
  { key: "dealmaking", name: "做局", gloss: "把几方凑成一件谁都单独做不成的事", group: "relate", main: "CHA", layer: "signature", requires: ["refer", "mediating", "partnering"] },
  { key: "unattended", name: "无人值守", gloss: "半夜出事的次数在下降", group: "make", main: "CON", layer: "signature", requires: ["oncall", "systemcraft", "redundancy"] },
  { key: "gravity", name: "引力", gloss: "有人来找你，而不是你去找人", group: "express", main: "LCK", layer: "signature", requires: ["compounding", "trustbuilding"] },
  { key: "custody", name: "托管", gloss: "把一整块工作交给编队，你只看结果", group: "make", main: "INT", layer: "signature", requires: ["clone", "acceptance"] },
  { key: "retention", name: "留存", gloss: "人走了，组织还记得", group: "info", main: "RES", layer: "signature", requires: ["curation", "humanproof"] },
];


/** 每项技能的里程碑。数据大，单独放一张表，SKILL_DEFS 在构造时挂上去。 */
const MILESTONES: Record<string, SkillMilestone[]> = {
  reverseeng: [{ at: MILESTONE_TIERS[0], name: "拆得开", test: "把一个现成的东西拆开，说出它由哪几块组成" }, { at: MILESTONE_TIERS[1], name: "说得出为什么", test: "说清它为什么这么做，而不只是它做了什么" }, { at: MILESTONE_TIERS[2], name: "复刻得出", test: "照着倒推出的做法自己做出一个能用的" }],
  record: [{ at: MILESTONE_TIERS[0], name: "写下来", test: "连续七天每天写下一条发生了什么" }, { at: MILESTONE_TIERS[1], name: "写具体", test: "写的是那一次，不是感想" }, { at: MILESTONE_TIERS[2], name: "翻得到", test: "两周前的事能从记录里翻出来" }],
  search: [{ at: MILESTONE_TIERS[0], name: "找得到", test: "十分钟内找到一份一手资料" }, { at: MILESTONE_TIERS[1], name: "换得动词", test: "第一次搜不到时换一组词再搜到" }, { at: MILESTONE_TIERS[2], name: "绕得开", test: "在一个封闭的库里也找到了替代来源" }],
  skim: [{ at: MILESTONE_TIERS[0], name: "读得快", test: "十分钟读完一份长文并说出它在讲什么" }, { at: MILESTONE_TIERS[1], name: "挑得出", test: "从五份里挑出唯一值得细读的那份" }, { at: MILESTONE_TIERS[2], name: "放得下", test: "读了两页就放弃过一份没价值的东西" }],
  summarize: [{ at: MILESTONE_TIERS[0], name: "压得下", test: "把一页内容压成三句" }, { at: MILESTONE_TIERS[1], name: "不丢关键", test: "别人只看你的摘要也没做错判断" }, { at: MILESTONE_TIERS[2], name: "换得了口径", test: "同一份东西能按不同人的关心点写两版摘要" }],
  askbasic: [{ at: MILESTONE_TIERS[0], name: "问出口", test: "一次会上把没听懂的地方当场问出来" }, { at: MILESTONE_TIERS[1], name: "不装懂", test: "在自己人面前承认过一次不懂" }, { at: MILESTONE_TIERS[2], name: "问到点", test: "问的那句让别人也跟着受益" }],
  paraphrase: [{ at: MILESTONE_TIERS[0], name: "说得回来", test: "把对方刚说的话复述一遍" }, { at: MILESTONE_TIERS[1], name: "对方点头", test: "对方确认你说的就是他的意思" }, { at: MILESTONE_TIERS[2], name: "说得更清", test: "复述之后对方说你讲得比他清楚" }],
  remembernames: [{ at: MILESTONE_TIERS[0], name: "记得住", test: "见过两次的人能叫出名字" }, { at: MILESTONE_TIERS[1], name: "记得住在意的", test: "说得出对方在意什么" }, { at: MILESTONE_TIERS[2], name: "接得上", test: "隔半年再见能接上上次的话头" }],
  toolcraft: [{ at: MILESTONE_TIERS[0], name: "会用", test: "不靠鼠标完成一次常见操作" }, { at: MILESTONE_TIERS[1], name: "会配", test: "把工具配置成顺手的样子" }, { at: MILESTONE_TIERS[2], name: "会换", test: "换一个新工具三天内上手" }],
  arithmetic: [{ at: MILESTONE_TIERS[0], name: "估得出", test: "口算出一个量级并说出依据" }, { at: MILESTONE_TIERS[1], name: "单位不错", test: "换算不出错，百万和亿分得清" }, { at: MILESTONE_TIERS[2], name: "看得出离谱", test: "一眼看出一个数字不可能对" }],
  spreadsheet: [{ at: MILESTONE_TIERS[0], name: "做得出", test: "把一堆散数据整理成一张表" }, { at: MILESTONE_TIERS[1], name: "算得动", test: "用公式而不是手填算出汇总" }, { at: MILESTONE_TIERS[2], name: "别人看得懂", test: "别人拿你的表能直接用" }],
  formatting: [{ at: MILESTONE_TIERS[0], name: "有层次", test: "标题、段落、重点分得开" }, { at: MILESTONE_TIERS[1], name: "扫一眼有数", test: "别人扫一眼知道哪里是重点" }, { at: MILESTONE_TIERS[2], name: "成模板", test: "别人拿你的格式去用" }],
  punctual: [{ at: MILESTONE_TIERS[0], name: "不迟到", test: "连续四周没有迟到" }, { at: MILESTONE_TIERS[1], name: "提前说", test: "赶不上时提前告知而不是事后解释" }, { at: MILESTONE_TIERS[2], name: "交期不飘", test: "答应的交付日期连续三次没跳票" }],
  statusreport: [{ at: MILESTONE_TIERS[0], name: "主动说", test: "不等人问就报一次进展" }, { at: MILESTONE_TIERS[1], name: "说得准", test: "说的进度和实际对得上" }, { at: MILESTONE_TIERS[2], name: "先说坏的", test: "坏消息由你先开口" }],
  backup: [{ at: MILESTONE_TIERS[0], name: "有备份", test: "重要的东西不止存在一处" }, { at: MILESTONE_TIERS[1], name: "恢复过", test: "真的从备份里恢复过一次" }, { at: MILESTONE_TIERS[2], name: "自动做", test: "备份不靠你记得" }],
  shield: [{ at: MILESTONE_TIERS[0], name: "关得掉", test: "关掉一个持续打断你的通知源" }, { at: MILESTONE_TIERS[1], name: "拿得回", test: "一天里有一段完全没被算法插队的时间" }, { at: MILESTONE_TIERS[2], name: "不反弹", test: "四周后没有偷偷装回来" }],
  trace: [{ at: MILESTONE_TIERS[0], name: "查得到", test: "把一条转述追回到原始出处" }, { at: MILESTONE_TIERS[1], name: "看得出断点", test: "指出一条信息在哪一环被改了意思" }, { at: MILESTONE_TIERS[2], name: "追得动匿名", test: "在没有署名的情况下也定位到来源" }],
  silence: [{ at: MILESTONE_TIERS[0], name: "分得开", test: "把该记的和不该记的分开存" }, { at: MILESTONE_TIERS[1], name: "忍得住", test: "一次明知能省事也没有把敏感内容贴进去" }, { at: MILESTONE_TIERS[2], name: "成规矩", test: "定下一条自己和同事都照做的边界" }],
  spotfake: [{ at: MILESTONE_TIERS[0], name: "起疑", test: "对一份看起来很像的东西起过疑并去查" }, { at: MILESTONE_TIERS[1], name: "查实过", test: "确认过一次内容是编的" }, { at: MILESTONE_TIERS[2], name: "说得出破绽", test: "能指出它是从哪一处露馅的" }],
  interview: [{ at: MILESTONE_TIERS[0], name: "约得到", test: "约到一次真实的一对一" }, { at: MILESTONE_TIERS[1], name: "问得开", test: "对方说出了原本不打算说的一句" }, { at: MILESTONE_TIERS[2], name: "成得了材料", test: "整理出的记录被别人拿去用" }],
  interrogate: [{ at: MILESTONE_TIERS[0], name: "会追问", test: "对一个答案追问到它改口" }, { at: MILESTONE_TIERS[1], name: "抓到过错", test: "抓到一次看着对其实错的产出" }, { at: MILESTONE_TIERS[2], name: "成套路", test: "定下一组每次都问的盘问问题" }],
  fleet: [{ at: MILESTONE_TIERS[0], name: "分得开", test: "把一件事拆给两个以上的角色分工" }, { at: MILESTONE_TIERS[1], name: "互相查", test: "让一个去挑另一个的错并真的挑出来" }, { at: MILESTONE_TIERS[2], name: "跑得完", test: "整条编队不用你插手跑完一次" }],
  judgepeople: [{ at: MILESTONE_TIERS[0], name: "说得出在意", test: "说出一个人最在意什么" }, { at: MILESTONE_TIERS[1], name: "押过一次", test: "事前预测他会怎么选并对上了" }, { at: MILESTONE_TIERS[2], name: "看得出不合适", test: "提前说出一个人和一件事不搭，后来应验" }],
  refer: [{ at: MILESTONE_TIERS[0], name: "接上过", test: "介绍两个人认识" }, { at: MILESTONE_TIERS[1], name: "接对过", test: "两边事后都说这次介绍有用" }, { at: MILESTONE_TIERS[2], name: "成习惯", test: "半年里促成三次以上" }],
  redundancy: [{ at: MILESTONE_TIERS[0], name: "想过会挂", test: "写下这个东西会怎么挂" }, { at: MILESTONE_TIERS[1], name: "挂了没事", test: "真挂过一次而没有造成损失" }, { at: MILESTONE_TIERS[2], name: "自己起来", test: "不用人干预它自己恢复" }],
  ship: [{ at: MILESTONE_TIERS[0], name: "发出去", test: "把东西交到第一个用户手上" }, { at: MILESTONE_TIERS[1], name: "有人用第二次", test: "有人主动用了第二次" }, { at: MILESTONE_TIERS[2], name: "能持续发", test: "连续三次按自己定的节奏发出" }],
  oncall: [{ at: MILESTONE_TIERS[0], name: "按下去过", test: "线上出事时你把它止住了" }, { at: MILESTONE_TIERS[1], name: "查得到根", test: "事后找到真正的原因不是表面现象" }, { at: MILESTONE_TIERS[2], name: "不再犯", test: "同类事故没有第三次" }],
  duediligence: [{ at: MILESTONE_TIERS[0], name: "查得全", test: "从公开资料拼出一家公司靠什么活" }, { at: MILESTONE_TIERS[1], name: "查出没写的", test: "通过采访问出资料里没有的东西" }, { at: MILESTONE_TIERS[2], name: "结论被用", test: "有人因为你的调查改了决定" }],
  acceptance: [{ at: MILESTONE_TIERS[0], name: "敢退回", test: "退回过一份看起来完成了的东西" }, { at: MILESTONE_TIERS[1], name: "说得出理由", test: "说清不合格在哪一条上" }, { at: MILESTONE_TIERS[2], name: "立得住标准", test: "你定的验收标准被别人拿去用" }],
  framing: [{ at: MILESTONE_TIERS[0], name: "列得出候选", test: "写下三个候选问题并说明取舍" }, { at: MILESTONE_TIERS[1], name: "换过一次", test: "换了问题之后结论完全不同" }, { at: MILESTONE_TIERS[2], name: "先定后做", test: "动手前问题已经写死，中途没漂移" }],
  decompose: [{ at: MILESTONE_TIERS[0], name: "拆得开", test: "把一件大事拆成能各自验收的小块" }, { at: MILESTONE_TIERS[1], name: "估得准", test: "拆完的工期和实际差得不离谱" }, { at: MILESTONE_TIERS[2], name: "别人能接", test: "别人拿你的拆解直接开工" }],
  orgdesign: [{ at: MILESTONE_TIERS[0], name: "画得出", test: "画清一块业务的职责边界" }, { at: MILESTONE_TIERS[1], name: "动过一次", test: "调整过一次分工并跟踪了效果" }, { at: MILESTONE_TIERS[2], name: "不靠你转", test: "你不在的时候它照样运转" }],
  managingup: [{ at: MILESTONE_TIERS[0], name: "被听进去", test: "一次建议被上面采纳" }, { at: MILESTONE_TIERS[1], name: "说得清为什么", test: "对方能复述出你的理由，不只是结论" }, { at: MILESTONE_TIERS[2], name: "被主动问", test: "上面开始主动问你的判断" }],
  revenue: [{ at: MILESTONE_TIERS[0], name: "算得通", test: "一条完整的赚钱路径算得平" }, { at: MILESTONE_TIERS[1], name: "改过结构", test: "通过改结构而不是降价成交" }, { at: MILESTONE_TIERS[2], name: "撑得起", test: "这条路径养活了一段真实的支出" }],
  crisis: [{ at: MILESTONE_TIERS[0], name: "先说", test: "出事第一时间自己开口" }, { at: MILESTONE_TIERS[1], name: "按住过", test: "一次真实的乱局被你收住" }, { at: MILESTONE_TIERS[2], name: "留下规矩", test: "事后立下一条防复发的做法" }],
  integration: [{ at: MILESTONE_TIERS[0], name: "拼得起来", test: "把三个现成服务拼成一件能用的东西" }, { at: MILESTONE_TIERS[1], name: "换得掉零件", test: "换掉其中一个而不推倒重来" }, { at: MILESTONE_TIERS[2], name: "有人天天用", test: "有人每天在用它" }],
  transcode: [{ at: MILESTONE_TIERS[0], name: "翻得过去", test: "把一件技术的事讲给不懂的人听懂" }, { at: MILESTONE_TIERS[1], name: "两边都认", test: "两边都说这就是他们的意思" }, { at: MILESTONE_TIERS[2], name: "被引用", test: "你的说法成了两边共用的说法" }],
  clone: [{ at: MILESTONE_TIERS[0], name: "写得下来", test: "把自己的判断标准写成规则" }, { at: MILESTONE_TIERS[1], name: "跑得动", test: "机器按你的标准跑出接近你的结果" }, { at: MILESTONE_TIERS[2], name: "别人也能用", test: "另一个人用你这套也出得来" }],
  offline: [{ at: MILESTONE_TIERS[0], name: "能手算", test: "不用工具估出一个可用的量级" }, { at: MILESTONE_TIERS[1], name: "有备份路径", test: "关键的事有一条不依赖某个工具的做法" }, { at: MILESTONE_TIERS[2], name: "真跑过", test: "真的在没有工具的一天里把事做完了" }],
  humanproof: [{ at: MILESTONE_TIERS[0], name: "留得下过程", test: "留下能证明过程的痕迹" }, { at: MILESTONE_TIERS[1], name: "经得起问", test: "被质疑时拿得出证据" }, { at: MILESTONE_TIERS[2], name: "成了惯例", test: "你团队里这件事成了默认做法" }],
  compounding: [{ at: MILESTONE_TIERS[0], name: "接得上", test: "新写的东西能接上旧的" }, { at: MILESTONE_TIERS[1], name: "旧的还在用", test: "半年前写的东西仍被读被引" }, { at: MILESTONE_TIERS[2], name: "带来东西", test: "写作带来过一次合作或收入" }],
  curation: [{ at: MILESTONE_TIERS[0], name: "收得住", test: "把散落的结论收进一处" }, { at: MILESTONE_TIERS[1], name: "拿得出", test: "有人在需要时找到了它" }, { at: MILESTONE_TIERS[2], name: "忘得掉", test: "主动废弃过一份已经过期的结论" }],
  judgement: [{ at: MILESTONE_TIERS[0], name: "敢判", test: "在信息不全时下过一次判断并写下把握度" }, { at: MILESTONE_TIERS[1], name: "对得上账", test: "这类判断累计对账十条以上" }, { at: MILESTONE_TIERS[2], name: "被依赖", test: "有人在拿不准时来问你怎么看" }],
  requestion: [{ at: MILESTONE_TIERS[0], name: "翻过一次", test: "换了问题之后结论完全不同" }, { at: MILESTONE_TIERS[1], name: "提前换", test: "在动手之前而不是做完之后换" }, { at: MILESTONE_TIERS[2], name: "别人跟着换", test: "别人接受了你换的那个问题" }],
  handover: [{ at: MILESTONE_TIERS[0], name: "交出去过", test: "把一整块事交给别人做成" }, { at: MILESTONE_TIERS[1], name: "不用回头问", test: "对方全程没回来问你" }, { at: MILESTONE_TIERS[2], name: "交给两个人", test: "两个不同的人都接得住" }],
  settingtone: [{ at: MILESTONE_TIERS[0], name: "定过一次", test: "一次对外的说法由你定" }, { at: MILESTONE_TIERS[1], name: "两边都用", test: "两边都照这个说法讲" }, { at: MILESTONE_TIERS[2], name: "经得起追问", test: "被追问时这个说法没塌" }],
  selfrunning: [{ at: MILESTONE_TIERS[0], name: "跑过一周", test: "一周没管它也没出事" }, { at: MILESTONE_TIERS[1], name: "有人在用", test: "有你以外的人在用" }, { at: MILESTONE_TIERS[2], name: "跑过一季", test: "三个月没有你介入" }],
  ownership: [{ at: MILESTONE_TIERS[0], name: "说过这个我定", test: "一件有风险的事由你拍板" }, { at: MILESTONE_TIERS[1], name: "认过账", test: "错了之后没有归因给条件" }, { at: MILESTONE_TIERS[2], name: "还被交事", test: "出事之后仍然被交付新的责任" }],
  dealmaking: [{ at: MILESTONE_TIERS[0], name: "凑成过", test: "促成一次多方合作" }, { at: MILESTONE_TIERS[1], name: "没有你也成立", test: "合作在你退出后继续" }, { at: MILESTONE_TIERS[2], name: "被找来做局", test: "有人主动请你来牵头" }],
  unattended: [{ at: MILESTONE_TIERS[0], name: "有告警", test: "出事之前系统先叫" }, { at: MILESTONE_TIERS[1], name: "次数在降", test: "同类事故的频率在下降" }, { at: MILESTONE_TIERS[2], name: "交得出去", test: "值班表上不只有你一个名字" }],
  gravity: [{ at: MILESTONE_TIERS[0], name: "有人找来", test: "有陌生人因为你写的东西找上门" }, { at: MILESTONE_TIERS[1], name: "不止一次", test: "半年内发生三次以上" }, { at: MILESTONE_TIERS[2], name: "带来机会", test: "其中一次变成了合作或工作" }],
  custody: [{ at: MILESTONE_TIERS[0], name: "托管过一次", test: "一整块工作由编队完成，你只验收" }, { at: MILESTONE_TIERS[1], name: "质量稳", test: "连续三次产出都过了你的验收线" }, { at: MILESTONE_TIERS[2], name: "省下时间", test: "省下的时间真的投到了别处" }],
  retention: [{ at: MILESTONE_TIERS[0], name: "留下过", test: "一份结论在你不在时被别人用上" }, { at: MILESTONE_TIERS[1], name: "接得住交接", test: "有人离开时知识没跟着走" }, { at: MILESTONE_TIERS[2], name: "被翻出来", test: "一年前的东西被人主动翻出来用" }],
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

// 专长树已经杀掉（见 048 迁移）。
// 它是第二套货币，而那套货币由等级发放，不由证据发放 ——
// 技能树在做同一件事，而且每一格都追得回一次真事。
// 同类需求走技能树的层：内核和印记本来就是"值得专门去攒"的那些。

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
  reverseeng: [
    { tier: 1, name: "入门", standard: "能说出它由哪几块组成", nodes: [{ name: "跑一遍", test: "先把这个东西自己完整用一遍、跑一遍" }, { name: "列零件", test: "拆出三块以上，说得出每块管什么" }, { name: "找入口", test: "指出它的起点：第一个被调用的地方、第一屏、第一句话" }] },
    { tier: 2, name: "基础", standard: "能说出它为什么这么做", nodes: [{ name: "顺着走一条", test: "追一条数据或一个用户从进到出走完整条路" }, { name: "分主次", test: "说得出哪几块是核心，哪几块是装饰" }, { name: "看出取舍", test: "指出它在哪里放弃了一样东西来换另一样" }] },
    { tier: 3, name: "精通", standard: "能复刻出其中一块", nodes: [{ name: "复刻一块", test: "照着倒推出的做法自己做出其中一块并跑通" }, { name: "说得出差在哪", test: "说清自己这块和原版的差别，以及为什么会差" }, { name: "猜中约束", test: "说出它为什么不能用更好的做法：成本、人手、还是历史包袱" }] },
    { tier: 4, name: "专家", standard: "能倒推出方法，而不只是结构", nodes: [{ name: "倒推顺序", test: "说出它大概是按什么顺序长成今天这样的" }, { name: "迁得出去", test: "把倒推出的做法用到另一件不相干的事上，并且成了" }, { name: "预判下一版", test: "事前写下它下一版会改哪里，到期对账" }] },
  ],
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
