/** 想法库的共享常量与类型（非 "use server" 模块，可自由导出对象/类型）。 */

/** 想法状态：只有 5 个（宪法第 6 条，绝不加第 6 个）。 */
export const IDEA_STATUSES = [
  "观察",
  "假设",
  "验证中",
  "MVP候选",
  "归档",
] as const;

export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export type Idea = {
  id: string;
  title: string | null;
  status: IdeaStatus;
  tags: string[];
  created_at: string;
  last_activity_at: string;
};

export const OBSERVATION_PROMOTED_TAG = "__ideaos_promoted__";
const OBSERVATION_SOURCE_TAG_PREFIX = "__ideaos_observation__:";

export function observationSourceTag(observationId: string): string {
  return `${OBSERVATION_SOURCE_TAG_PREFIX}${observationId}`;
}

export function isObservationPromoted(tags: string[]): boolean {
  return tags.includes(OBSERVATION_PROMOTED_TAG);
}

export function visibleTags(tags: string[]): string[] {
  return tags.filter(
    (tag) =>
      tag !== OBSERVATION_PROMOTED_TAG &&
      !tag.startsWith(OBSERVATION_SOURCE_TAG_PREFIX)
  );
}

/**
 * 假设句式的填空字段（引导式可证伪假设）。
 * 句式：「[目标用户] 有 [具体痛点]，现在用 [替代方案] 解决，
 *        但 [为何不够好]，如果有 [你的方案]，愿意付 [金额/时间]。」
 */
export const HYPOTHESIS_FIELDS = [
  { key: "target_user", label: "目标用户", placeholder: "谁？越具体越好（不是“所有人”）" },
  { key: "pain", label: "具体痛点", placeholder: "他们真实遇到的问题" },
  { key: "alternative", label: "替代方案", placeholder: "现在他们用什么来解决" },
  { key: "why_insufficient", label: "为何不够好", placeholder: "现有方案差在哪" },
  { key: "solution", label: "你的方案", placeholder: "你打算怎么做" },
  { key: "willingness_to_pay", label: "愿意付（金额/时间）", placeholder: "多少钱 / 多少时间" },
] as const;

export type HypothesisField = (typeof HYPOTHESIS_FIELDS)[number]["key"];

export type Hypothesis = Partial<Record<HypothesisField, string>> & {
  /** 最关键假设：错了想法就死的那一条（宪法第 4 阶段，单条，非任务清单）。 */
  riskiest_assumption?: string;
  /** 创始人-市场匹配：你凭什么是解决这个的人（不公平优势/渠道/专长）。 */
  unfair_advantage?: string;
  /** 分发：前 10 个真实用户具体怎么找到它（没分发是头号死法）。 */
  distribution?: string;
  /** 最小实验：本周能做完、用来证伪最关键假设的那个动作。 */
  smallest_test?: string;
};

/** 创业最常见的死法（蒸馏自公认 top failure reasons，用于预演死亡 pre-mortem）。 */
export const DEATH_PATTERNS = [
  "没人真的需要",
  "触达不到用户（没有分发）",
  "没人愿意付钱",
  "不该由你来做",
  "没有护城河，容易被复制",
  "时机不对",
  "单位经济算不过来",
] as const;

/** 预演死亡里的一种死法 + 为何暴露 + 一个尖锐追问。 */
export type DeathMode = { pattern: string; why: string; question: string };

// ── 外部雷达（Phase D）：联网检索 + 对抗合成，全部附来源、不做 feed ──

/** Tavily 检索的一条原始结果。 */
export type TavilyResult = { title: string; url: string; content: string };

/** 外部信号：一句真实动态 + 为什么值得注意 + 来源（可存为观察）。 */
export type ExternalSignal = { text: string; why: string; url: string };

/** 方向现实检验的对抗性简报 + 来源链接。 */
export type RealityCheckResult = {
  text: string;
  sources: { title: string; url: string }[];
};

/** 外部来源的观察打这个标签，便于区分"自己的感受"与"世界的信息"。 */
export const EXTERNAL_TAG = "外部";

/**
 * 捕捉标签里代表"真痛 / 愿付费"信号的子集——用于发现阶段的痛点雷达。
 * （与 capture-client 的 TAGS 文案保持一致。）
 */
export const PAIN_TAGS = [
  "客户抱怨",
  "付费软件缺陷",
  "高风险痛点",
  "增收机会",
] as const;

/** AI 把一个反复主题"逼成"的候选方向草稿（先证伪，不评价）。 */
export type DirectionDraft = {
  /** 预填进 ideas.hypothesis 的句式字段 */
  hypothesis: Partial<Record<HypothesisField, string>>;
  /** 最关键假设：错了这个方向就死 */
  riskiest_assumption: string;
  /** 本周 1 小时内怎么初判生死 */
  week_check: string;
};

/** 假设句式 6 个空是否全部填满——空任一则不能进入“验证中”。 */
export function isHypothesisComplete(h: Hypothesis | null | undefined): boolean {
  if (!h) return false;
  return HYPOTHESIS_FIELDS.every((f) => (h[f.key] ?? "").trim().length > 0);
}

/** AI 多角色质疑：4 个对抗性角色（与 DB 的 ai_role 枚举一致）。 */
export const AI_ROLES = [
  { key: "investor", label: "挑剔投资人" },
  { key: "customer", label: "快速顾客质疑（无证据模拟）" },
  { key: "operator", label: "冷酷运营者" },
  { key: "competitor", label: "竞品老板" },
] as const;

export type AiRole = (typeof AI_ROLES)[number]["key"];

/** 一轮对话（存入 ai_sessions.messages）。 */
export type ChatTurn = { role: "user" | "assistant"; content: string };

/**
 * 验证证据只记两个二元信号（宪法第 4 条，绝不做多级分类）。
 * 值：yes/no/unsure。
 */
export const SIGNAL_VALUES = [
  { key: "yes", label: "是" },
  { key: "no", label: "否" },
  { key: "unsure", label: "不确定" },
] as const;

export type SignalValue = (typeof SIGNAL_VALUES)[number]["key"];

export type Validation = {
  id: string;
  has_pain: SignalValue;
  will_pay: SignalValue;
  note: string | null;
  contacted_at: string;
};

/**
 * 预测与对账（校准回路）：写下带日期的可证伪预测，到期用现实对账。
 * 对抗事后偏见 / 过度自信。结论二元：命中 / 没命中（不打分）。
 */
export const PREDICTION_OUTCOMES = [
  { key: "hit", label: "命中" },
  { key: "miss", label: "没命中" },
] as const;

export type PredictionOutcome = "pending" | "hit" | "miss";

export type Prediction = {
  id: string;
  text: string;
  due_at: string;
  made_at: string;
  outcome: PredictionOutcome;
  resolved_at: string | null;
  note: string | null;
};

/** 预测是否到了该对账的时候（未结且已过期）。 */
export function isPredictionDue(p: Prediction): boolean {
  return p.outcome === "pending" && new Date(p.due_at).getTime() <= Date.now();
}

/**
 * 退出条件预承诺：进入"验证中"之前写下"出现什么情况就杀掉"，
 * Go/Kill 时逐条对照，对抗事后合理化。标记二元：触发了 / 没触发（不打分）。
 */
export const EXIT_CRITERION_STATES = ["unreviewed", "yes", "no"] as const;
export type ExitCriterionState = (typeof EXIT_CRITERION_STATES)[number];

export type ExitCriterion = {
  id: string;
  criterion: string;
  triggered: ExitCriterionState;
  reviewed_at: string | null;
  created_at: string;
};

/** 强制出口机制的天数阈值（宪法第 5 条）。 */
export const AI_LOCK_DAYS = 3;

/** 距某时间至今过了几天（向下取整，最小 0）。 */
export function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

/**
 * 距离"验证中"被锁定还剩几天（基于 last_activity_at）。
 * 返回值：>0 = 还剩 N 天；<=0 = 已（达到）锁定。
 */
export function daysUntilLock(lastActivityAt: string): number {
  return AI_LOCK_DAYS - daysSince(lastActivityAt);
}

/**
 * 强制出口机制：处于"验证中"且超过 3 天没有新活动（新 validation 会刷新
 * last_activity_at）的想法，锁定 AI 质疑——必须先去做一次真实接触。
 */
export function isAiLocked(
  status: IdeaStatus,
  lastActivityAt: string
): boolean {
  if (status !== "验证中") return false;
  const elapsed = Date.now() - new Date(lastActivityAt).getTime();
  return elapsed > AI_LOCK_DAYS * 24 * 60 * 60 * 1000;
}

export const AI_LOCK_MESSAGE =
  "你已经分析这个想法 3 天了。在记录一次真实对话之前，AI 质疑功能暂停。";

/** Go / Pivot / Kill / Hold 决策（与 DB 的 decision_verdict 枚举一致）。 */
export const VERDICTS = [
  { key: "Go", label: "Go", hint: "进入 MVP 候选" },
  { key: "Pivot", label: "Pivot", hint: "保留，去改写假设" },
  { key: "Kill", label: "Kill", hint: "归档，并记录学到了什么" },
  { key: "Hold", label: "Hold", hint: "保持现状" },
] as const;

export type Verdict = (typeof VERDICTS)[number]["key"];

/**
 * Kill 时的 Learning Log（宪法第 7 条：用“学到了什么”框定，绝不用“失败/放弃”）。
 * 前三项打包进 decisions.reason，learned 单独存 decisions.learned。
 */
export type LearningLog = {
  /** 原始判断：当初为何觉得有机会 */
  original_judgment: string;
  /** 验证动作：问了谁、做了什么 */
  validation_action: string;
  /** 真实结果：有痛吗、愿付费吗 */
  real_result: string;
  /** 学到什么：以后如何判断类似机会 */
  learned: string;
};
