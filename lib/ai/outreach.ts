import { generateRealityJson } from "./reality";
import { generateContent } from "./shared";

// ---------------------------------------------------------------------------
// 触达策略：合并假设/客户代理/知识卡片，生成可操作的 Go-to-Market 计划
// ---------------------------------------------------------------------------

export type OutreachStrategy = {
  right_person: {
    profile: string;
    signals: string[];
  };
  right_place: {
    channel: string;
    specific: string;
  }[];
  right_time: {
    trigger: string;
    notes: string;
  };
  right_message: {
    draft: string;
    hook_explanation: string;
  };
};

export type OutreachInput = {
  use_case: "idea_validation" | "job_search";
  hypothesis_or_goal: string;
  target_description: string;
  knowledge_context: string;
  ai_critique_summary?: string;
};

const OUTREACH_SYSTEM = `你是一个冷静、务实的触达策略顾问，服务于一个反认知偏误的决策系统。

你的任务：根据用户提供的假设/目标、目标对象描述、积累的知识，生成一个可以直接执行的触达策略。

绝对禁止：
- 泛泛而论（"去 LinkedIn 找人"这种废话不允许）
- 评价性语言（"很有潜力""不错的想法"）
- 推销腔（draft 消息不是广告）
- 超过 3 个渠道建议（宁可少而精）

right_person.signals 必须是可以在公开信息中识别的具体标志（发布了某类内容、在某类岗位、经历了某个事件……）。

right_message.draft 规则：
- 第一视角、第一人称
- 开场描述对方可能正在经历的痛苦/困境，不夸奖，不说"我在做一个XXX"
- 结尾提出最低承诺的下一步（"方便 15 分钟聊一下吗？"而不是"希望合作"）
- 100–180 字，日语/中文均可根据场景

只输出 JSON（不要 markdown 代码块）：
{
  "right_person": {
    "profile": "一段话描述理想联系人，含角色/行业/公司规模/痛苦程度",
    "signals": ["识别信号1","识别信号2","识别信号3"]
  },
  "right_place": [
    {"channel": "渠道名称","specific": "具体到哪个群组/话题/场合/搜索条件"},
    {"channel": "渠道名称","specific": "..."}
  ],
  "right_time": {
    "trigger": "最佳接触时机的触发条件（具体事件或行为信号）",
    "notes": "补充说明，包括应避免的时机"
  },
  "right_message": {
    "draft": "可直接使用的第一封消息，100-180字",
    "hook_explanation": "为什么这个开场有效（解释逻辑，不是评价）"
  }
}`;

function parseOutreachStrategy(raw: unknown): OutreachStrategy {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("outreach strategy must be an object");
  }
  const r = raw as Record<string, unknown>;

  const rp = r.right_person as Record<string, unknown> | undefined;
  const rl = r.right_place as unknown[] | undefined;
  const rt = r.right_time as Record<string, unknown> | undefined;
  const rm = r.right_message as Record<string, unknown> | undefined;

  if (!rp || !rl || !rt || !rm) {
    throw new Error("outreach strategy missing required sections");
  }

  return {
    right_person: {
      profile: String(rp.profile ?? ""),
      signals: Array.isArray(rp.signals) ? rp.signals.map(String) : [],
    },
    right_place: (Array.isArray(rl) ? rl : []).map((p) => {
      const place = p as Record<string, unknown>;
      return { channel: String(place.channel ?? ""), specific: String(place.specific ?? "") };
    }),
    right_time: {
      trigger: String(rt.trigger ?? ""),
      notes: String(rt.notes ?? ""),
    },
    right_message: {
      draft: String(rm.draft ?? ""),
      hook_explanation: String(rm.hook_explanation ?? ""),
    },
  };
}

export async function generateOutreachStrategy(
  input: OutreachInput
): Promise<OutreachStrategy> {
  const lines = [
    `使用场景：${input.use_case === "idea_validation" ? "创业想法验证（找第一批目标客户）" : "求职自我推销（找目标公司的对的人）"}`,
    ``,
    `假设/目标：${input.hypothesis_or_goal}`,
    ``,
    `目标对象描述：${input.target_description}`,
  ];

  if (input.knowledge_context) {
    lines.push(``, `积累的背景知识：`, input.knowledge_context);
  }

  if (input.ai_critique_summary) {
    lines.push(
      ``,
      `AI 质疑摘要（对方可能会提的反对意见，可用于预判并在消息中预先解除）：`,
      input.ai_critique_summary
    );
  }

  return generateRealityJson(OUTREACH_SYSTEM, lines.join("\n"), parseOutreachStrategy);
}

// ---------------------------------------------------------------------------
// 触达画布：AI 挑战单个维度（找漏洞，不替用户写答案）
// ---------------------------------------------------------------------------

const DIM_NAMES: Record<string, string> = {
  person: "「对的人」",
  place: "「对的地方」",
  time: "「对的时机」",
  message: "「对的信息」",
};

const CHALLENGE_SYSTEM = `你是一个冷静、挑剔的思考伙伴，服务于一个反认知偏误的决策系统。

用户正在规划一次触达/营销行动，已经写下了某个维度的思考。
你的任务：**只找漏洞，不替用户填答案**。

规则：
- 最多指出 3 个问题，每条以"这里——"开头，直接描述具体漏洞
- 问题必须具体（"你说的'相关人员'太模糊，不知道是谁"），不能泛泛（"你应该更具体"）
- 绝不评价（"不错但是…""写得很好，不过…"）
- 绝不替用户写答案，只问题
- 如果用户写的内容已经足够具体可操作，直接说"这个维度没有明显漏洞"，不要强行挑剔
- 输出纯文字，不用 JSON，不用 markdown`;

export async function challengeOutreachDimension(input: {
  dim: "person" | "place" | "time" | "message";
  use_case: string;
  scenario: string;
  user_notes: string;
}): Promise<string> {
  const USE_CASE_LABELS: Record<string, string> = {
    startup: "验证创业想法",
    job: "求职自我推销",
    product: "推销产品/服务",
    self: "推销自己/个人品牌",
    persuasion: "说服他人",
    other: "其他",
  };

  const userPrompt = [
    `场景类型：${USE_CASE_LABELS[input.use_case] ?? input.use_case}`,
    `目标描述：${input.scenario || "（未填写）"}`,
    ``,
    `用户对 ${DIM_NAMES[input.dim] ?? input.dim} 维度写的内容：`,
    input.user_notes || "（还没写）",
  ].join("\n");

  const response = await generateContent({
    config: { systemInstruction: CHALLENGE_SYSTEM },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
  });
  return response.text ?? "";
}

// ---------------------------------------------------------------------------
// 触达画布：AI 润色/生成草稿（复用 OUTREACH_SYSTEM 的 draft 规则）
// ---------------------------------------------------------------------------

const POLISH_SYSTEM = `你是一个冷静、务实的消息撰写顾问，服务于一个反认知偏误的决策系统。

用户已经思考了四个触达维度（对的人/地方/时机/信息），现在需要你帮助撰写或润色第一封消息草稿。

规则：
- 第一人称
- 开头描述对方可能正在经历的痛苦/困境，不说"我在做XXX"，不夸奖对方
- 结尾提出最低承诺的下一步（"方便 15 分钟聊一下吗？"而不是"希望合作"）
- 100–180 字
- 禁止评价性语言（"很有潜力""不错的想法"）
- 如果用户已有草稿，润色而不是推翻；如果没有草稿，根据维度笔记生成一版
- 只输出消息正文，不要解释、不要标题`;

export async function polishOutreachDraft(input: {
  scenario: string;
  person_notes: string;
  place_notes: string;
  time_notes: string;
  user_draft?: string;
}): Promise<string> {
  const lines = [
    `目标描述：${input.scenario || "（未填写）"}`,
    ``,
    `对的人：${input.person_notes || "（未填写）"}`,
    `对的地方：${input.place_notes || "（未填写）"}`,
    `对的时机：${input.time_notes || "（未填写）"}`,
  ];

  if (input.user_draft) {
    lines.push(``, `用户已有草稿（请润色）：`, input.user_draft);
  } else {
    lines.push(``, `（用户还没有草稿，请根据以上维度笔记生成一版）`);
  }

  const response = await generateContent({
    config: { systemInstruction: POLISH_SYSTEM },
    contents: [{ role: "user", parts: [{ text: lines.join("\n") }] }],
  });
  return response.text ?? "";
}

