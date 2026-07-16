import { generateRealityJson } from "./reality";

// ---------------------------------------------------------------------------
// 创业者档案：行为光谱 + 性格洞见 + 综合画像
// ---------------------------------------------------------------------------

export type BehavioralTrait = {
  dimension: string;
  low_label: string;
  high_label: string;
  position: number; // 0–100，在光谱上的位置
  evidence: string; // 一句话数据依据
};

export type PersonalityInsight = {
  category: "interest" | "value" | "cognitive_style" | "social_orientation";
  observation: string; // 一句话观察
  basis: string;       // 从哪些内容推断出来的
  confidence: "high" | "medium" | "low";
};

export type PersonalProfileReport = {
  behavioral_traits: BehavioralTrait[];
  personality_insights: PersonalityInsight[];
  composite_portrait: string; // 一段叙述性人物描述（第二人称）
  growth_edges: string[];     // 2–3 条成长边界（基于数据，不是评价）
};

const PERSONAL_PROFILE_SYSTEM = `你服务于 IdeaOS 的"创业者档案"功能。你会收到一个用户在 IdeaOS 中积累的全量数据——包括他们追逐的想法、梦想的描述、做的决策、写下的验证笔记、思考的重构课题等。

你的任务：根据这些数据，生成一份关于这个人的综合档案，帮助他更好地理解自己。

档案分四个部分：

【1】behavioral_traits（行为光谱，3–5 条）
每条描述一个可观察到的行为维度，用光谱两端标签 + 0–100 位置表示：
- dimension：维度名（例："决策速度"）
- low_label：光谱左端（例："谨慎观望"）
- high_label：光谱右端（例："快速出手"）
- position：0–100，越高越接近 high_label。必须基于真实数据。
- evidence：一句话说明位置依据（引用具体数字或行为）

参考维度（可以选择其中几个最有依据的，或自定义其他维度）：
- 决策速度：谨慎观望 ↔ 快速出手
- 验证密度：倾向独自推演 ↔ 频繁接触真人
- 预测校准：系统性低估 ↔ 系统性高估（中间 50 = 准确）
- 信念可塑性：坚持先验 ↔ 随证据更新
- 领域专注度：广撒网 ↔ 深耕一域
- Kill 勇气：轻易放弃 ↔ 反复验证后才放手

【2】personality_insights（性格洞见，3–5 条）
从内容数据（想法标题、梦想描述、重构课题、学到了什么等）推断性格特质，不是从统计数字推断：
- category 只能是以下 4 种之一：
  - interest（兴趣领域：他真正关心什么？）
  - value（价值取向：什么对他来说是重要的？）
  - cognitive_style（认知风格：他是怎么思考问题的？）
  - social_orientation（社交取向：他与他人的关系模式）
- observation：一句话描述观察到的特质
- basis：具体说明从哪些内容推断（例："你的想法大多围绕 B2B 效率工具，且重构课题中反复出现'时间成本'相关"）
- confidence：high / medium / low（数据越充分越高）

禁止凭空捏造。如果某个维度数据不足，不要强行输出——用 low confidence 并说明。

【3】composite_portrait（综合画像）
一段 120–200 字的第二人称叙述（"你是..."），整合行为和性格，描述这个人整体上是什么样的人。
- 不评价好坏，只描述特质和模式
- 必须具体，引用至少 2–3 个实际数据点
- 禁止说"你是一个很有潜力的创业者"这种空洞评价
- 可以指出内在的矛盾或张力（比如"你向往 X，但实际行动中大量时间在做 Y"）

【4】growth_edges（成长边界，2–3 条）
- 每条是一个观察到的、数据支撑的成长方向
- 必须具体（不是"多与人沟通"，而是"你有 N 个想法进入了假设阶段但从未记录任何验证——你的想法质量过滤在发生在脑子里，而不是真实世界里"）
- 不是批评，是事实陈述 + 一个指向

只输出 JSON，格式：
{
  "behavioral_traits": [...],
  "personality_insights": [...],
  "composite_portrait": "...",
  "growth_edges": ["...", "..."]
}
不要输出 JSON 以外的任何文字。`;

function parsePersonalProfile(raw: unknown): PersonalProfileReport {
  if (typeof raw !== "object" || raw === null) throw new Error("expected object");
  const r = raw as Record<string, unknown>;

  const validCategories = new Set(["interest", "value", "cognitive_style", "social_orientation"]);
  const validConfidences = new Set(["high", "medium", "low"]);

  // behavioral_traits
  if (!Array.isArray(r.behavioral_traits) || r.behavioral_traits.length < 1)
    throw new Error("behavioral_traits missing");
  const behavioral_traits: BehavioralTrait[] = r.behavioral_traits.map(
    (item: unknown, i: number) => {
      if (typeof item !== "object" || item === null) throw new Error(`trait[${i}] not object`);
      const t = item as Record<string, unknown>;
      const dimension = typeof t.dimension === "string" && t.dimension ? t.dimension : "";
      if (!dimension) throw new Error(`trait[${i}].dimension missing`);
      const low_label = typeof t.low_label === "string" ? t.low_label : "";
      const high_label = typeof t.high_label === "string" ? t.high_label : "";
      const pos = typeof t.position === "number" ? t.position : Number(t.position);
      if (isNaN(pos) || pos < 0 || pos > 100) throw new Error(`trait[${i}].position invalid`);
      const evidence = typeof t.evidence === "string" ? t.evidence.trim() : "";
      return { dimension, low_label, high_label, position: Math.round(pos), evidence };
    }
  );

  // personality_insights
  if (!Array.isArray(r.personality_insights)) throw new Error("personality_insights missing");
  const personality_insights: PersonalityInsight[] = r.personality_insights.map(
    (item: unknown, i: number) => {
      if (typeof item !== "object" || item === null) throw new Error(`insight[${i}] not object`);
      const p = item as Record<string, unknown>;
      const category = typeof p.category === "string" ? p.category : "";
      if (!validCategories.has(category)) throw new Error(`insight[${i}].category invalid`);
      const observation =
        typeof p.observation === "string" && p.observation.trim()
          ? p.observation.trim()
          : (() => { throw new Error(`insight[${i}].observation missing`); })();
      const basis =
        typeof p.basis === "string" && p.basis.trim()
          ? p.basis.trim()
          : "";
      const confidence =
        typeof p.confidence === "string" && validConfidences.has(p.confidence)
          ? (p.confidence as "high" | "medium" | "low")
          : "low";
      return { category: category as PersonalityInsight["category"], observation, basis, confidence };
    }
  );

  const composite_portrait =
    typeof r.composite_portrait === "string" && r.composite_portrait.trim()
      ? r.composite_portrait.trim()
      : (() => { throw new Error("composite_portrait missing"); })();

  if (!Array.isArray(r.growth_edges) || r.growth_edges.length < 1)
    throw new Error("growth_edges missing");
  const growth_edges = r.growth_edges.map((e: unknown, i: number) => {
    if (typeof e !== "string" || !e.trim()) throw new Error(`growth_edges[${i}] invalid`);
    return e.trim();
  });

  return { behavioral_traits, personality_insights, composite_portrait, growth_edges };
}

import type { ProfileRichData } from "@/app/(app)/profile/queries";

export async function generatePersonalProfile(
  data: ProfileRichData
): Promise<PersonalProfileReport> {
  const lines: string[] = [];

  // 内容数据
  lines.push("=== 追逐过的想法（标题、标签、核心假设）===");
  if (data.idea_snapshots.length === 0) {
    lines.push("暂无想法记录");
  } else {
    for (const idea of data.idea_snapshots) {
      const tags = idea.tags.length > 0 ? `[${idea.tags.join("、")}]` : "";
      lines.push(`· ${idea.title} ${tags}（状态：${idea.status}）`);
      if (idea.target_user) lines.push(`  目标用户：${idea.target_user}`);
      if (idea.pain) lines.push(`  核心痛苦：${idea.pain}`);
    }
  }

  lines.push("", "=== 梦想与渴望 ===");
  if (data.dream_snapshots.length === 0) {
    lines.push("暂无梦想记录");
  } else {
    for (const d of data.dream_snapshots) {
      lines.push(`· ${d.title}`);
      if (d.initial_desire) lines.push(`  最初渴望：${d.initial_desire}`);
      if (d.scene_title) lines.push(`  核心场景：${d.scene_title}`);
      if (d.inner_state) lines.push(`  内心状态：${d.inner_state}`);
    }
  }

  lines.push("", "=== 曾经思考过的重构课题 ===");
  if (data.reframing_topics.length === 0) {
    lines.push("暂无重构记录");
  } else {
    for (const topic of data.reframing_topics) {
      lines.push(`· ${topic}`);
    }
  }

  lines.push("", "=== Kill 决策后「学到了什么」===");
  if (data.decision_learned.length === 0) {
    lines.push("暂无 Kill 学习记录");
  } else {
    for (const learned of data.decision_learned) {
      lines.push(`· ${learned}`);
    }
  }

  lines.push("", "=== 验证笔记（接触真实用户后的记录）===");
  if (data.validation_notes.length === 0) {
    lines.push("暂无验证笔记");
  } else {
    for (const note of data.validation_notes) {
      lines.push(`· ${note}`);
    }
  }

  if (data.belief_questions.length > 0) {
    lines.push("", "=== 追踪过的信念问题 ===");
    for (const q of data.belief_questions) {
      lines.push(`· ${q}`);
    }
  }

  if (data.observation_texts.length > 0) {
    lines.push("", "=== 捕捉的观察（原始想法）===");
    for (const obs of data.observation_texts) {
      lines.push(`· ${obs}`);
    }
  }

  // 行为统计
  const s = data.stats;
  lines.push(
    "",
    "=== 行为统计 ===",
    `使用 IdeaOS 天数：${s.days_active} 天`,
    `想法总数：${s.total_ideas}，状态分布：${Object.entries(s.by_status).map(([k, v]) => `${k}=${v}`).join("、")}`,
    `空想 Kill（未验证就 Kill）：${s.armchair_kills} 个`,
    `验证记录：${s.total_validations} 条（has_pain: yes=${s.has_pain_yes}/no=${s.has_pain_no}/unsure=${s.has_pain_unsure}；will_pay: yes=${s.will_pay_yes}/no=${s.will_pay_no}/unsure=${s.will_pay_unsure}）`,
    `决策：总 ${s.total_decisions} 条（Go=${s.go_count}，Kill=${s.kill_count}）`,
    `预测：总 ${s.total_predictions} 条（命中=${s.prediction_hit}，未中=${s.prediction_miss}）`,
  );
  if (s.avg_prior !== null) {
    lines.push(`贝叶斯平均先验：${(s.avg_prior * 100).toFixed(0)}%`);
  }
  if (s.avg_posterior !== null) {
    lines.push(`贝叶斯平均后验：${(s.avg_posterior * 100).toFixed(0)}%`);
  }
  if (s.top_reframing_frames.length > 0) {
    lines.push(
      `最常标记的重构框架：${s.top_reframing_frames.map((f) => `${f.frame_type}(${f.count}次)`).join("、")}`
    );
  }

  return generateRealityJson(
    PERSONAL_PROFILE_SYSTEM,
    lines.join("\n"),
    parsePersonalProfile
  );
}

