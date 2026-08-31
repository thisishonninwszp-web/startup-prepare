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
  | "conflict";

export const AXIS_NAMES: Record<DispositionAxis, string> = {
  energy: "精力从哪来",
  attention: "注意力怎么走",
  decision: "怎么做决定",
  structure: "对秩序的需要",
  novelty: "对新旧的偏好",
  conflict: "面对摩擦时",
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
