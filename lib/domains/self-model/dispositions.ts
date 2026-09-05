// 气质：INTP 那一类的标签。
//
// 这一族之前完全不在库里，而它确实是特性 —— 只是它和拨杆、组合有一个
// 根本区别：**它没有分母**。
//
//   拨杆   收敛率 4/9  → 算出来的
//   气质   我喜欢先想清楚再动手 → 你说的
//
// 所以规矩不是"不许有"，是**分开放、并且标明出处**：
//
//   1. 气质进 self_declarations，一律标「声明 · 未验证」，不进任何计算，
//      不影响属性、不参与品级、不喂给怪物清单。
//   2. 每条气质都自带一个「怎么验」——把它翻译成一句可证伪的条件命题。
//      你愿意验的时候一键建成假设，从此它走和别的特性一样的路。
//   3. 假设升到工作假设以上，这条气质才从「声明」变成「有证据」。
//
// 这样 MBTI 式的自我描述有了位置，但它不能偷偷变成"事实"。
// 说到底这整个模块存在的理由就是这条线：说的和做的要分开记。

export type DispositionAxis =
  | "energy"
  | "attention"
  | "decision"
  | "structure"
  | "novelty"
  | "conflict"
  | "distance"
  | "uncertainty"
  | "selfview"
  | "time";

export const AXIS_NAMES: Record<DispositionAxis, string> = {
  energy: "精力从哪来",
  attention: "注意力怎么走",
  decision: "怎么做决定",
  structure: "对秩序的需要",
  novelty: "对新旧的偏好",
  conflict: "面对摩擦时",
  distance: "和人的距离",
  uncertainty: "面对不确定",
  selfview: "怎么看自己",
  time: "活在哪个时间",
};

export type DispositionDef = {
  key: string;
  axis: DispositionAxis;
  name: string;
  /** 你会怎么形容自己。 */
  claim: string;
  /**
   * 怎么验：翻成一句可证伪的条件命题。
   * 没有这一句的气质不该进库 —— 那就只是一个形容词。
   */
  test: string;
};

export const DISPOSITIONS: DispositionDef[] = [
  // 精力
  { key: "solo", axis: "energy", name: "独处充电", claim: "一个人待着会回血，人多会累",
    test: "连续高强度社交的第二天，产出比平时低" },
  { key: "crowd", axis: "energy", name: "人群充电", claim: "和人聊完反而更有劲",
    test: "有社交的那几天，当天晚上的产出比独处日高" },
  { key: "nightowl", axis: "energy", name: "夜里才醒", claim: "晚上脑子才转得动",
    test: "高质量产出集中在 21 点以后" },
  { key: "burst", axis: "energy", name: "阵发型", claim: "要么不动，一动就停不下来",
    test: "产出集中在少数几天，其余接近零" },

  // 注意力
  { key: "deepfocus", axis: "attention", name: "怕被打断", claim: "被打断一次要很久才回得来",
    test: "有会议的那天，深度产出显著低于无会日" },
  { key: "scatter", axis: "attention", name: "同时开好几件", claim: "只做一件事反而闷",
    test: "并行 3 件以上时的完成率不低于只做 1 件时" },
  { key: "rabbithole", axis: "attention", name: "容易钻进去", claim: "查着查着就忘了本来要干嘛",
    test: "查资料的时长里，有多少最后没用上" },

  // 决定
  { key: "thinkfirst", axis: "decision", name: "先想清楚再动", claim: "没想明白之前不想动手",
    test: "从想到到第一次动作的间隔，中位数超过一周" },
  { key: "actfirst", axis: "decision", name: "先动手再说", claim: "想不明白就先做一版",
    test: "从想到到第一次动作的间隔，中位数在三天以内" },
  { key: "principled", axis: "decision", name: "要先懂原理", claim: "不知道为什么就用不下去",
    test: "学一样东西时，先补理论的比例过半" },
  { key: "optionkeeper", axis: "decision", name: "留着选项", claim: "不到最后不想定死",
    test: "决策的 Go/Kill 平均拖了多久才落下" },
  { key: "reversible", axis: "decision", name: "改主意不难", claim: "有新证据就改，不觉得丢脸",
    test: "被反驳之后实际改变决定的比例" },

  // 秩序
  { key: "planner", axis: "structure", name: "要有计划", claim: "没排好我心里不踏实",
    test: "计划与实际的偏差，以及没有计划那几天的产出" },
  { key: "improviser", axis: "structure", name: "临场决定", claim: "计划反而绑手绑脚",
    test: "有计划日与无计划日的完成率差多少" },
  { key: "tidymind", axis: "structure", name: "要收干净", claim: "东西没做完会一直挂在心里",
    test: "并行未完成项超过 3 个时，新开项目的频率是否下降" },

  // 新旧
  { key: "novelty", axis: "novelty", name: "喜欢新东西", claim: "重复第三遍就没劲了",
    test: "同一类事做到第几次时投入明显下降" },
  { key: "depth", axis: "novelty", name: "喜欢往深里挖", claim: "同一个东西能钻很久",
    test: "单主题连续投入的最长跨度" },
  { key: "collector", axis: "novelty", name: "先囤起来", claim: "看到好东西先存下来再说",
    test: "存下的东西里，多久之内真的用上过" },

  // 摩擦
  { key: "avoidconflict", axis: "conflict", name: "先避开", claim: "能不吵就不吵",
    test: "出现分歧后，多久才把它摆到桌面上" },
  { key: "directconflict", axis: "conflict", name: "当面说清", claim: "有话直说，不憋着",
    test: "分歧当天就说开的比例" },
  { key: "selfblame", axis: "conflict", name: "先怪自己", claim: "出问题第一反应是我哪里没做好",
    test: "复盘里归因到自己与归因到外部的比例" },
  { key: "prove", axis: "conflict", name: "被质疑就加码", claim: "越有人不看好越想做成",
    test: "被反驳之后的一周，该项目的投入是升还是降" },

  // ---------------- 第二批 ----------------
  { key: "morninghead", axis: "energy", name: "早上清醒", claim: "上午两小时抵下午一天",
    test: "高质量产出集中在 12 点以前" },
  { key: "steadypace", axis: "energy", name: "细水长流", claim: "每天一点比爆发更适合我",
    test: "产出的日间分布方差小" },
  { key: "recharge_make", axis: "energy", name: "做出来才回血", claim: "只要做成一点点就有劲",
    test: "有交付物的那天，第二天产出更高" },
  { key: "drainmeeting", axis: "energy", name: "会议吸血", claim: "开完会就废了",
    test: "会议时长与当天产出负相关" },
  { key: "hyperfocus", axis: "attention", name: "一头扎进去", claim: "进入状态后忘记时间",
    test: "单次连续工作时长的上四分位" },
  { key: "needsilence", axis: "attention", name: "要安静", claim: "有杂音就没法想事",
    test: "在嘈杂环境的产出与安静时的差" },
  { key: "visualfirst", axis: "attention", name: "先画出来", claim: "写不清楚就先画",
    test: "开始一件事时先出图的比例" },
  { key: "listmaker", axis: "attention", name: "先列清单", claim: "不列出来心里没底",
    test: "有清单日与无清单日的完成率" },
  { key: "evidencefirst", axis: "decision", name: "先要证据", claim: "没数据我不敢下判断",
    test: "决策前是否有可引用的数据" },
  { key: "gutcall", axis: "decision", name: "凭直觉", claim: "想太多反而错",
    test: "无数据决策的事后命中率" },
  { key: "worstcase", axis: "decision", name: "先想最坏", claim: "先算亏得起多少",
    test: "决策记录里是否写了下行" },
  { key: "consensus", axis: "decision", name: "要有人同意", claim: "没人认同我不敢推",
    test: "推进前征询他人的比例" },
  { key: "contrarian", axis: "decision", name: "偏要反着来", claim: "大家都说好我就警惕",
    test: "与多数意见相反的决策比例及其结果" },
  { key: "perfectgate", axis: "decision", name: "不到好不出手", claim: "没做到心里那条线就不发",
    test: "从可用到发布之间拖了多久" },
  { key: "ruleskeeper", axis: "structure", name: "守规矩", claim: "定了的就照做",
    test: "自己定的规则被遵守的比例" },
  { key: "ruleshater", axis: "structure", name: "讨厌流程", claim: "流程一多我就绕开",
    test: "流程步骤增加后完成率的变化" },
  { key: "cleanslate", axis: "structure", name: "喜欢从零开始", claim: "接手别人的不如自己重写",
    test: "重写与改造的选择比例" },
  { key: "archivist", axis: "structure", name: "什么都留档", claim: "记下来才安心",
    test: "记录条数与实际回看次数" },
  { key: "shinychase", axis: "novelty", name: "见新就想试", claim: "看到新工具就想上手",
    test: "新开项目与工具试用的频率" },
  { key: "classicfirst", axis: "novelty", name: "先看老东西", claim: "新东西先等等看",
    test: "采用一样东西距它出现多久" },
  { key: "finisher", axis: "novelty", name: "喜欢收尾", claim: "把烂摊子收干净很爽",
    test: "接手未完成项并完成的次数" },
  { key: "teachurge", axis: "novelty", name: "学完想讲", claim: "学会了就想讲给人听",
    test: "学完后产出讲解材料的比例" },
  { key: "apologyfirst", axis: "conflict", name: "先道歉", claim: "先把气氛压下来再说",
    test: "冲突中率先让步的比例" },
  { key: "holdline", axis: "conflict", name: "守得住线", claim: "该坚持的不让",
    test: "被施压后改变决定的比例" },
  { key: "silenttreat", axis: "conflict", name: "冷处理", claim: "不想说就先不说",
    test: "分歧后到再次沟通的间隔" },
  { key: "humorout", axis: "conflict", name: "用玩笑化解", claim: "开个玩笑就过去了",
    test: "冲突记录里是否真的落成安排" },
  { key: "gritteeth", axis: "conflict", name: "硬扛", claim: "自己咽下去",
    test: "卡住到求助的天数" },
  { key: "askwhy", axis: "conflict", name: "非要问清楚", claim: "不弄明白为什么不罢休",
    test: "分歧后是否追到根因" },

  // 和人的距离
  { key: "fewdeep", axis: "distance", name: "少而深", claim: "宁可三个很近的，不要三十个点头之交",
    test: "半年内主动联系的人不超过五个，但其中至少三次是深聊" },
  { key: "wideshallow", axis: "distance", name: "广而浅", claim: "认识很多人，但谁都不算特别近",
    test: "半年内联系过二十人以上，没有一次超过两小时的对话" },
  { key: "slowwarm", axis: "distance", name: "热得慢", claim: "要很久才把人放进来，放进来就很久",
    test: "现在最近的几个人，认识都超过三年" },
  { key: "boundary", axis: "distance", name: "边界清楚", claim: "工作是工作，私交是私交，不太混",
    test: "同事里没有人知道你周末在做什么" },
  { key: "hostmode", axis: "distance", name: "接待型", claim: "在场就会自动照顾气氛，事后累",
    test: "多人场合结束后需要独处恢复，而当时你在张罗" },

  // 面对不确定
  { key: "needclear", axis: "uncertainty", name: "要先看清", claim: "没弄明白之前不想动手",
    test: "开始一件事之前，平均花在准备上的时间超过实际动手" },
  { key: "jumpin", axis: "uncertainty", name: "先跳再说", claim: "想不清就先做，边做边想",
    test: "过去三件事里至少两件是没方案就开工的" },
  { key: "riskfirst", axis: "uncertainty", name: "风险先行", claim: "写方案时风险那段总是最长的",
    test: "写过的方案里，风险部分的字数超过机会部分" },
  { key: "betsmall", axis: "uncertainty", name: "小注多押", claim: "不敢一把梭，喜欢多下几注",
    test: "同时推进的事超过三件，单件投入都不大" },
  { key: "waitclear", axis: "uncertainty", name: "等一等再说", claim: "不确定的时候倾向于什么都不做",
    test: "至少一次因为「再看看」而错过了窗口，事后确认过" },

  // 怎么看自己
  { key: "underclaim", axis: "selfview", name: "不敢认", claim: "做成了也觉得是运气或别人的功劳",
    test: "写复盘时，成功的原因里很少出现自己的动作" },
  { key: "provemode", axis: "selfview", name: "证明模式", claim: "总在向某个人证明什么，哪怕他不在场",
    test: "说得出那个人是谁，而且不止一次为他调整过做法" },
  { key: "selfcritic", axis: "selfview", name: "自己最狠", claim: "别人还没说，自己先挑完了",
    test: "被批评时的第一反应是「我早就想到了」" },
  { key: "latebloom", axis: "selfview", name: "慢热型自评", claim: "当下觉得不行，隔一段回看觉得还行",
    test: "半年前的东西，现在评价比当时高" },
  { key: "needseen", axis: "selfview", name: "需要被看见", claim: "没人知道的努力会难以为继",
    test: "没有反馈的项目，平均活不过三周" },

  // 活在哪个时间
  { key: "futureheavy", axis: "time", name: "住在未来", claim: "大部分注意力在还没发生的事上",
    test: "记录里关于计划的比关于已发生的多" },
  { key: "pastloop", axis: "time", name: "回放型", claim: "会反复回想已经过去的场面",
    test: "同一件旧事在记录里出现过三次以上" },
  { key: "nowonly", axis: "time", name: "只在当下", claim: "过去的忘得快，未来的想不动",
    test: "写不出三个月后的具体计划，也想不起上个月做过什么" },
  { key: "longgame", axis: "time", name: "看得很远", claim: "愿意为两年后的事现在就付代价",
    test: "现在做的事里，至少一件在一年内不会有回报" },
];

export const DISPOSITION_TOTAL = DISPOSITIONS.length;

export function findDisposition(key: string): DispositionDef | undefined {
  return DISPOSITIONS.find((item) => item.key === key);
}

export function byAxis(): { axis: DispositionAxis; name: string; items: DispositionDef[] }[] {
  return (Object.keys(AXIS_NAMES) as DispositionAxis[]).map((axis) => ({
    axis,
    name: AXIS_NAMES[axis],
    items: DISPOSITIONS.filter((item) => item.axis === axis),
  }));
}

/**
 * 一条气质的状态。
 * 声明了但没验，和已经有证据撑着，是完全不同的两回事 —— 界面上必须分开。
 */
export type DispositionState = "unclaimed" | "declared" | "supported";

export function stateOf(input: {
  claimed: boolean;
  linkedHypothesisTier: string | null;
}): DispositionState {
  if (!input.claimed) return "unclaimed";
  if (
    input.linkedHypothesisTier === "working" ||
    input.linkedHypothesisTier === "load_bearing"
  ) {
    return "supported";
  }
  return "declared";
}

export type TypeDef = {
  key: string;
  name: string;
  gloss: string;
  /** 由哪些气质组合而成。 */
  requires: string[];
  /** 至少命中几条才算。 */
  min: number;
};

/**
 * 类型 = 若干条气质的组合。
 *
 * MBTI 的 INTP 不是一个标签，是四根轴各取一端的组合 ——
 * 所以"再多一点这种特性"的正确做法不是加更多单条气质，
 * 是让已认领的气质**组合出名字**。
 *
 * 和别处一样：类型仍然全部来自声明，不进任何计算。
 * 它是给你一个说得出口的短名字，不是一个结论。
 */
export const TYPE_DEFS: TypeDef[] = [
  { key: "towerscholar", name: "塔中书生", gloss: "一个人待着，先懂原理，喜欢往深里挖",
    requires: ["solo", "principled", "depth", "thinkfirst"], min: 3 },
  { key: "firestarter", name: "点火人", gloss: "先动手，见新就试，同时开好几件",
    requires: ["actfirst", "shinychase", "scatter", "novelty"], min: 3 },
  { key: "gatekeeper", name: "守门人", gloss: "有计划、要收干净、不轻易冒进",
    requires: ["planner", "tidymind", "worstcase", "ruleskeeper"], min: 3 },
  { key: "nightsmith", name: "夜工", gloss: "夜里清醒，一头扎进去，怕被打断",
    requires: ["nightowl", "hyperfocus", "deepfocus", "needsilence"], min: 3 },
  { key: "diplomat", name: "调停者", gloss: "先看人，避冲突，要有人同意",
    requires: ["avoidconflict", "consensus", "apologyfirst", "crowd"], min: 3 },
  { key: "blade", name: "直刃", gloss: "当面说清，守得住线，非要问清楚",
    requires: ["directconflict", "holdline", "askwhy", "reversible"], min: 3 },
  { key: "collectorsage", name: "藏书人", gloss: "先囤起来，什么都留档，先看老东西",
    requires: ["collector", "archivist", "classicfirst", "principled"], min: 3 },
  { key: "sprinter", name: "阵发型选手", gloss: "阵发投入，做出来才回血，讨厌流程",
    requires: ["burst", "recharge_make", "ruleshater", "gutcall"], min: 3 },
  { key: "quartermind", name: "算账的", gloss: "先要证据，先想最坏，凭数据说话",
    requires: ["evidencefirst", "worstcase", "thinkfirst", "listmaker"], min: 3 },
  { key: "hermitmaker", name: "地窖匠", gloss: "独处、往深里挖、不到好不出手",
    requires: ["solo", "depth", "perfectgate", "hyperfocus"], min: 3 },
  { key: "teacher", name: "好为人师", gloss: "学完想讲，先画出来，讲得清",
    requires: ["teachurge", "visualfirst", "principled", "crowd"], min: 3 },
  { key: "restarter", name: "重开党", gloss: "喜欢从零开始，见新就试，讨厌流程",
    requires: ["cleanslate", "shinychase", "ruleshater", "novelty"], min: 3 },
];

export type TypeMatch = { def: TypeDef; matched: string[]; complete: boolean };

/** 认领的气质能组合出哪些类型。命中越多排越前。 */
export function matchTypes(claimedKeys: string[]): TypeMatch[] {
  const claimed = new Set(claimedKeys);
  return TYPE_DEFS.map((def) => {
    const matched = def.requires.filter((key) => claimed.has(key));
    return { def, matched, complete: matched.length >= def.min };
  })
    .filter((item) => item.matched.length > 0)
    .sort((a, b) => b.matched.length - a.matched.length);
}
