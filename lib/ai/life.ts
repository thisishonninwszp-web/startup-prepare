import { generateRealityJson } from "./reality";

// ---------------------------------------------------------------------------
// 生活罗盘：梦想 vs 行动对齐审视
// ---------------------------------------------------------------------------

export type AlignmentObservation = {
  observation_type:
    | "dream_action_gap"
    | "action_concentration"
    | "stale_domain"
    | "missing_validation";
  description: string;
  question: string;
};

const ALIGNMENT_SYSTEM = `你服务于 IdeaOS 的生活罗盘工具，目标是帮助用户看清自己的梦想（想要什么）和行动（实际在做什么）之间的落差。

你的任务：找出 2–3 条尖锐的观察，每条必须引用输入数据中的实际数字或具体领域名称。

observation_type 分类（必须精确使用以下 4 种之一）：
- dream_action_gap：梦想里提到的领域，在想法库里几乎没有对应行动
- action_concentration：行动过度集中在某一个领域，其他领域被忽视
- stale_domain：某个有想法的领域已经超过 14 天没有任何新活动
- missing_validation：某个领域有假设阶段的想法，但从未记录过真实用户接触

铁律：
- description 必须引用真实数字或具体名称（例："「创业」领域有 5 个想法，但「健康」领域有 0 个想法，而你的梦想里明确提到了健康"）
- description 是观察不是评价，不说"你做得不够好"
- question 必须直击行动/动机矛盾，让人感到不舒服（不是软性引导，不是"你可以考虑…"）
- 输出 2–3 条，不多
- 禁止评价性语言（"不错""做得很好""有潜力"）
- 如果数据不足以发现真正的落差，宁可输出 1 条也不要凑数

只输出 JSON 数组：
[{"observation_type":"...","description":"...","question":"..."}]
不要输出 JSON 以外的任何文字。`;

function parseAlignmentObservations(raw: unknown): AlignmentObservation[] {
  if (!Array.isArray(raw)) throw new Error("expected array");
  const validTypes = new Set([
    "dream_action_gap", "action_concentration", "stale_domain", "missing_validation",
  ]);
  return raw.map((item: unknown, i: number) => {
    if (typeof item !== "object" || item === null) throw new Error(`obs[${i}] not object`);
    const p = item as Record<string, unknown>;
    const observation_type = typeof p.observation_type === "string" ? p.observation_type : "";
    if (!validTypes.has(observation_type)) throw new Error(`obs[${i}].observation_type invalid`);
    const description =
      typeof p.description === "string" && p.description.trim()
        ? p.description.trim()
        : (() => { throw new Error(`obs[${i}].description missing`); })();
    const question =
      typeof p.question === "string" && p.question.trim()
        ? p.question.trim()
        : (() => { throw new Error(`obs[${i}].question missing`); })();
    return {
      observation_type: observation_type as AlignmentObservation["observation_type"],
      description,
      question,
    };
  });
}

import type { LifeCompassData } from "@/app/(app)/life/queries";

export async function analyzeLifeAlignment(
  data: LifeCompassData
): Promise<AlignmentObservation[]> {
  const lines: string[] = [
    "=== 梦想锚点 ===",
  ];

  if (data.dreams.length === 0) {
    lines.push("暂无活跃梦想");
  } else {
    for (const d of data.dreams) {
      lines.push(`· ${d.title}${d.scene_title ? `（核心场景：${d.scene_title}）` : ""}`);
      if (d.inner_state) lines.push(`  内心状态：${d.inner_state}`);
    }
  }

  lines.push("", "=== 生活领域（按想法标签分组）===");
  if (data.domains.length === 0) {
    lines.push("暂无带标签的想法");
  } else {
    for (const domain of data.domains) {
      const statusStr = Object.entries(domain.by_status)
        .map(([s, c]) => `${s}=${c}`)
        .join("、");
      const staleNote = domain.is_stale ? "【停滞超14天】" : "";
      lines.push(
        `· 「${domain.tag}」：${domain.idea_count} 个想法（${statusStr}）${staleNote}`
      );
    }
  }

  lines.push("", "=== 近 30 天活动 ===",
    `新建想法：${data.activity.new_ideas} 个`,
    `完成验证：${data.activity.new_validations} 条`,
    `做出决策：${data.activity.new_decisions} 个`,
    data.activity.most_active_domain
      ? `最活跃领域：「${data.activity.most_active_domain}」`
      : "暂无活跃领域"
  );

  return generateRealityJson(
    ALIGNMENT_SYSTEM,
    lines.join("\n"),
    parseAlignmentObservations
  );
}

