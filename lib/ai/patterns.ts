import { generateRealityJson } from "./reality";

// ---------------------------------------------------------------------------
// 认知镜：跨想法模式识别，找出 3-5 个具体的认知盲区规律
// ---------------------------------------------------------------------------

export type CognitivePattern = {
  pattern_type:
    | "validation_bias"
    | "prediction_calibration"
    | "domain_concentration"
    | "reasoning_tendency"
    | "execution_speed"
    | "evidence_avoidance";
  title: string;
  evidence: string[];
  question: string;
};

const COGNITIVE_PATTERNS_SYSTEM = `你服务于 IdeaOS 的认知镜工具，目标是帮助创业者发现自己跨想法的系统性认知规律。

用户数据：IdeaOS 已经积累了用户的想法、验证记录、决策、预测、信念追踪、重构会话数据。

你的任务：找出 3–5 个具体的认知规律，每个必须有实际数字支撑。

pattern_type 分类（必须精确使用以下 6 种之一）：
- validation_bias：验证选择性（比如只在 has_pain=yes 时才记录；armchair kills 高）
- prediction_calibration：预测系统偏差（命中率异常高或低）
- domain_concentration：领域/想法集中（所有想法在同一个领域或阶段）
- reasoning_tendency：思维定势（重构中反复出现同一类视角）
- execution_speed：行动拖延（想法长期停在某阶段）
- evidence_avoidance：回避特定问题（比如 will_pay 始终是 unsure，从不问付钱意愿）

铁律：
- evidence 字段每条必须引用输入数据中的真实数字（例："7 个想法中有 5 个被 Kill 前从未接触过真实用户"）
- title 是一句话描述规律，是观察不是评价
- question 必须直击要害，让人坐立不安（不是软性引导）
- 如果某项数据不足以得出规律，不要强行输出——宁缺毋滥
- 禁止评价性语言（"不错""有潜力""做得很好"）

只输出 JSON 数组：
[{"pattern_type":"...","title":"...","evidence":["...","..."],"question":"..."}]
不要输出 JSON 以外的任何文字。`;

function parseCognitivePatterns(raw: unknown): CognitivePattern[] {
  if (!Array.isArray(raw)) throw new Error("expected array");
  const validTypes = new Set([
    "validation_bias", "prediction_calibration", "domain_concentration",
    "reasoning_tendency", "execution_speed", "evidence_avoidance",
  ]);
  return raw.map((item: unknown, i: number) => {
    if (typeof item !== "object" || item === null) throw new Error(`patterns[${i}] not object`);
    const p = item as Record<string, unknown>;
    const pattern_type = typeof p.pattern_type === "string" ? p.pattern_type : "";
    if (!validTypes.has(pattern_type)) throw new Error(`patterns[${i}].pattern_type invalid`);
    const title =
      typeof p.title === "string" && p.title.trim()
        ? p.title.trim()
        : (() => { throw new Error(`patterns[${i}].title missing`); })();
    if (!Array.isArray(p.evidence) || p.evidence.length < 1)
      throw new Error(`patterns[${i}].evidence missing`);
    const evidence = (p.evidence as unknown[]).map((e, j) => {
      if (typeof e !== "string" || !e.trim())
        throw new Error(`patterns[${i}].evidence[${j}] invalid`);
      return e.trim();
    });
    const question =
      typeof p.question === "string" && p.question.trim()
        ? p.question.trim()
        : (() => { throw new Error(`patterns[${i}].question missing`); })();
    return {
      pattern_type: pattern_type as CognitivePattern["pattern_type"],
      title,
      evidence,
      question,
    };
  });
}

import type { PatternsInput } from "@/app/(app)/patterns/queries";

export async function generateCognitivePatterns(
  data: PatternsInput
): Promise<CognitivePattern[]> {
  const lines: string[] = [
    "=== 想法数据 ===",
    `总计：${data.ideas.total} 个`,
    `状态分布：${Object.entries(data.ideas.by_status).map(([k, v]) => `${k}=${v}`).join("、")}`,
    data.ideas.avg_days_in_validation !== null
      ? `验证中平均天数：${data.ideas.avg_days_in_validation} 天`
      : "暂无处于验证中的想法",
    `无验证直接 Kill 的想法（空想 Kill）：${data.ideas.armchair_kills} 个`,
    "",
    "=== 验证记录 ===",
    `总计：${data.validations.total} 条`,
    `有真实痛苦（has_pain）：yes=${data.validations.has_pain_yes}、no=${data.validations.has_pain_no}、unsure=${data.validations.has_pain_unsure}`,
    `愿意付钱（will_pay）：yes=${data.validations.will_pay_yes}、no=${data.validations.will_pay_no}、unsure=${data.validations.will_pay_unsure}`,
    "",
    "=== 决策记录 ===",
    `总计：${data.decisions.total} 条`,
    `决策分布：${Object.entries(data.decisions.by_verdict).map(([k, v]) => `${k}=${v}`).join("、")}`,
  ];

  if (data.decisions.kill_learned_sample.length > 0) {
    lines.push(
      `Kill 时「学到了什么」摘要（最近 ${data.decisions.kill_learned_sample.length} 条）：`
    );
    for (const s of data.decisions.kill_learned_sample) {
      lines.push(`  - ${s}`);
    }
  }

  lines.push(
    "",
    "=== Kill 想法的死因 ===",
    `共 Kill ${data.kills.total} 个 | 空想 Kill（未接触真人）=${data.kills.armchair_kills} | 死因含"没人真的痛"=${data.kills.no_pain_kills} | 死因含"没人愿付钱"=${data.kills.no_pay_kills}`,
    "",
    "=== 预测记录 ===",
    `总计：${data.predictions.total} 条 | 命中=${data.predictions.hit} | 未中=${data.predictions.miss} | 待定=${data.predictions.pending}`,
    "",
    "=== 贝叶斯信念 ===",
    `总计：${data.beliefs.total} 条`,
    data.beliefs.avg_prior !== null
      ? `平均先验：${(data.beliefs.avg_prior * 100).toFixed(0)}%`
      : "暂无先验数据",
    data.beliefs.avg_current_posterior !== null
      ? `平均当前后验：${(data.beliefs.avg_current_posterior * 100).toFixed(0)}%`
      : "",
    `低置信度（< 30%）数量：${data.beliefs.low_confidence_count}`,
    "",
    "=== 认知重构 ===",
    `会话总数：${data.reframing.sessions_total}`,
    data.reframing.top_marked_frames.length > 0
      ? `高频标记视角：${data.reframing.top_marked_frames.map((f) => `${f.frame_type}(${f.count}次)`).join("、")}`
      : "暂无标记视角数据"
  );

  return generateRealityJson(
    COGNITIVE_PATTERNS_SYSTEM,
    lines.join("\n"),
    parseCognitivePatterns
  );
}

