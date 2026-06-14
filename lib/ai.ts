import { GoogleGenAI } from "@google/genai";
import {
  DEATH_PATTERNS,
  type AiRole,
  type ChatTurn,
  type DeathMode,
  type DirectionDraft,
  type ExternalSignal,
  type RealityCheckResult,
  type TavilyResult,
} from "@/app/ideas/types";

/**
 * 所有 AI 调用的统一封装（宪法：AI 调用统一封装在 lib/ai.ts）。
 * 模型名读环境变量 AI_MODEL，便于切换。仅在服务端使用。
 */

const MODEL = process.env.AI_MODEL ?? "gemini-2.5-flash";

// 惰性初始化：缺 key 时不影响"保存观察"，只在真正调用 AI 时才报错（会被上层捕获降级）。
let _genai: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!_genai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY in .env.local.");
    _genai = new GoogleGenAI({ apiKey });
  }
  return _genai;
}

/** 捕捉阶段固定的第一问——对抗"错误共识效应"。永远是这一句。 */
export const FIRST_INQUIRY_QUESTION = "他们现在怎么处理这个问题？";

const INQUIRER_SYSTEM_PROMPT = `你是一个冷静、克制的追问者，服务于一个对抗认知偏误的决策系统。

用户刚刚记录了一条"观察"（不一定是完整的创业想法）。你的唯一任务是：提出恰好 3 个问题，把这条模糊的"观察"逼成一个可以被证伪的"假设"。

铁律：
- 第 1 个问题必须原样是："${FIRST_INQUIRY_QUESTION}"（用于对抗错误共识效应——先逼用户面对当事人现状）。
- 第 2、3 个问题要具体、扎根于这条观察本身，指向"谁在痛/痛到什么程度/为什么是现在"这类把观察变假设的方向。
- 禁止给任何建议或解决方案。
- 禁止任何夸奖、鼓励、评价（不许说"好机会""有潜力""不错"这类话）。
- 不要寒暄，不要解释你在做什么。

只输出一个 JSON 对象，形如：{"questions": ["${FIRST_INQUIRY_QUESTION}", "第二问", "第三问"]}。
不要输出 JSON 以外的任何文字。`;

/**
 * 对一条观察提出 3 个把"观察"逼成"假设"的追问。
 * 第一个问题恒为 FIRST_INQUIRY_QUESTION（即使模型偏离也会被强制纠正）。
 */
export async function runInquiry(observationText: string): Promise<string[]> {
  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: `观察：${observationText}`,
    config: {
      systemInstruction: INQUIRER_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      // 关闭思考链：本任务无需推理，否则 thinking 会吃光 maxOutputTokens 导致 JSON 被截断（只剩 1 问）。
      // 关掉也更快，契合"30 秒捕捉"原则。
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: 1024,
    },
  });

  const text = (response.text ?? "").trim();
  const questions = parseQuestions(text);

  // 强制第一问，保证验收：第一个永远是"现在怎么处理"。
  if (questions[0] !== FIRST_INQUIRY_QUESTION) {
    questions.unshift(FIRST_INQUIRY_QUESTION);
  }
  return questions.slice(0, 3);
}

// ---------------------------------------------------------------------------
// 第 4 阶段：AI 多角色对抗性质疑
// ---------------------------------------------------------------------------

/** 4 个角色各自的视角（独立 system prompt）。 */
const ROLE_PROMPTS: Record<AiRole, string> = {
  investor: `你是一个挑剔、见过无数失败项目的早期投资人。你怀疑一切。
你最关心：市场到底有多大、为什么聪明的对手至今没做、这门生意凭什么长成大公司、增长从哪来、单位经济模型成不成立。`,
  customer: `你正是这个想法的目标客户本人，你很忙、很省、对新东西很警惕。
你只关心三件事：我为什么要用它、我为什么要为它付钱、我为什么要现在就换（而不是继续用我现在的办法）。`,
  operator: `你是一个冷酷的运营负责人，只看落地与成本。
你最关心：怎么交付、单次交付成本多少、出错了谁兜底、规模化后哪里会崩、客服和退款怎么办。`,
  competitor: `你是这个想法最大竞品的老板，你不想让它活下来。
你最关心：你凭什么打赢我、我为什么不直接复制你、等我注意到你时你还剩什么护城河。`,
};

/** 所有角色共享的对抗性约束（宪法第 2 条）。 */
const ROLE_COMMON = `共同铁律：
- 你是对抗性的。你的目标是找出这个想法会死的理由，不是让对方好受。
- 禁止任何夸奖、鼓励、肯定（绝不说“有潜力/不错/好想法/很有意思”这类话）。
- 每一轮只追问，绝不给任何建议、方案或改进方向。
- 每轮提 1 到 3 个最尖锐、最具体的问题，必须扎根于对方的假设和上一轮回答，不要泛泛而问。
- 不要寒暄、不要复述对方的话、不要解释你在做什么。直接开问。`;

const ROLE_OPENING_TRIGGER = "请基于我上面的假设，开始你的质疑。";

/**
 * 以某个角色对一个想法的假设进行对抗性追问（多轮）。
 * @param hypothesisContext 已渲染成文字的假设上下文
 * @param turns 既往对话（不含本次模型回复）；为空表示开场
 * @returns 模型这一轮的追问文本
 */
export async function challenge(
  role: AiRole,
  hypothesisContext: string,
  turns: ChatTurn[]
): Promise<string> {
  const contents = turns.map((t) => ({
    role: t.role === "assistant" ? "model" : "user",
    parts: [{ text: t.content }],
  }));

  // Gemini 要求最后一轮是 user；开场或上一轮是模型时，补一个触发语。
  if (contents.length === 0 || contents[contents.length - 1].role === "model") {
    contents.push({ role: "user", parts: [{ text: ROLE_OPENING_TRIGGER }] });
  }

  const system = `${ROLE_PROMPTS[role]}

${ROLE_COMMON}

这是对方目前的假设（可能还不完整）：
${hypothesisContext}`;

  const response = await getClient().models.generateContent({
    model: MODEL,
    contents,
    config: {
      systemInstruction: system,
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: 800,
    },
  });

  return (response.text ?? "").trim() || "（未能生成质疑，请重试）";
}

// ---------------------------------------------------------------------------
// 观察聚类：把反复出现的观察归组，对抗"看不见自己重复模式"的盲区
// ---------------------------------------------------------------------------

export type ObservationCluster = {
  theme: string;
  count: number;
  ids: string[];
};

const CLUSTER_SYSTEM_PROMPT = `你是一个冷静的模式识别者，服务于一个对抗认知偏误的决策系统。
给你一批编号的"观察"。把反复出现、指向同一个底层主题的观察归到一组。

铁律：
- 只归纳，不评价、不夸奖、不给建议（绝不说"好机会/有潜力/值得做"这类话）。
- 只输出"反复出现"的主题——一个组至少包含 2 条观察；孤立的观察不要成组。
- 主题名要短、具体、中性（不超过 12 字），描述这些观察共同指向的现象。
- 没有任何反复主题时，clusters 返回空数组。

只输出 JSON：{"clusters":[{"theme":"...","members":[编号,编号]}]}。
不要输出 JSON 以外的任何文字。`;

/**
 * 把一批观察按反复主题聚类。用编号在 prompt 里指代，再映射回 id（比让模型回传 uuid 稳）。
 * 只返回成员数 >= 2 的组。
 */
export async function clusterObservations(
  items: { id: string; text: string }[]
): Promise<ObservationCluster[]> {
  if (items.length < 2) return [];

  const numbered = items.map((it, i) => `[${i}] ${it.text}`).join("\n");

  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: numbered,
    config: {
      systemInstruction: CLUSTER_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: 1024,
    },
  });

  const text = (response.text ?? "").trim();
  let parsed: { clusters?: unknown };
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    parsed = JSON.parse(
      start >= 0 && end >= 0 ? text.slice(start, end + 1) : text
    );
  } catch {
    return [];
  }

  const clusters = Array.isArray(parsed.clusters) ? parsed.clusters : [];
  const out: ObservationCluster[] = [];
  for (const c of clusters as { theme?: unknown; members?: unknown }[]) {
    if (typeof c.theme !== "string") continue;
    const members = Array.isArray(c.members) ? c.members : [];
    const ids = Array.from(
      new Set(
        members
          .filter(
            (m): m is number =>
              typeof m === "number" && m >= 0 && m < items.length
          )
          .map((m) => items[m].id)
      )
    );
    if (ids.length >= 2) {
      out.push({ theme: c.theme.trim(), count: ids.length, ids });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 主题 → 方向假设：把一个反复主题"逼成"可证伪的候选方向（发现阶段的桥）
// ---------------------------------------------------------------------------

const DIRECTION_SYSTEM_PROMPT = `你是一个冷静、对抗性的创业判断者，服务于一个对抗认知偏误的决策系统。
用户反复观察到某个主题。你的任务不是夸它、不是说它是好生意，而是把它"逼成"一个可以被快速证伪的候选方向。

铁律：
- 绝不评价好坏、绝不鼓励（不许说"好机会/有潜力/值得做/很有意思"）。
- 把方向写成可证伪的假设句式（目标用户要具体，不能是"所有人"）。
- 只给一条最关键假设：错了这个方向就死的那一条。
- 给一个本周 1 小时内就能做、能初步证伪的真实动作（要具体到去找谁、问什么）。
- 全部基于用户给的观察，不要凭空编造数字或事实。

只输出 JSON：
{"hypothesis":{"target_user":"","pain":"","alternative":"","why_insufficient":"","solution":"","willingness_to_pay":""},"riskiest_assumption":"","week_check":""}
不要输出 JSON 以外的任何文字。`;

/** 把一个反复主题（含若干样例观察）逼成一个候选方向草稿。 */
export async function themeToDirection(
  theme: string,
  sampleTexts: string[]
): Promise<DirectionDraft> {
  const samples = sampleTexts
    .filter((t) => t.trim())
    .map((t) => `- ${t.trim()}`)
    .join("\n");

  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: `反复主题：${theme}\n相关观察：\n${samples}`,
    config: {
      systemInstruction: DIRECTION_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: 1024,
    },
  });

  const text = (response.text ?? "").trim();
  const empty: DirectionDraft = {
    hypothesis: {},
    riskiest_assumption: "",
    week_check: "",
  };
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const parsed = JSON.parse(
      start >= 0 && end >= 0 ? text.slice(start, end + 1) : text
    ) as Partial<DirectionDraft>;
    const h = (parsed.hypothesis ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    return {
      hypothesis: {
        target_user: str(h.target_user),
        pain: str(h.pain),
        alternative: str(h.alternative),
        why_insufficient: str(h.why_insufficient),
        solution: str(h.solution),
        willingness_to_pay: str(h.willingness_to_pay),
      },
      riskiest_assumption: str(parsed.riskiest_assumption),
      week_check: str(parsed.week_check),
    };
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// 最小实验：把最关键假设逼成"本周能做完"的可证伪动作
// ---------------------------------------------------------------------------

const EXPERIMENT_SYSTEM_PROMPT = `你是一个冷静、对抗性的创业判断者，服务于一个对抗认知偏误的决策系统。
基于用户的假设（尤其是最关键假设），给出**一个**最小实验——本周内就能做完、用来证伪最关键假设的具体动作。

铁律：
- 只给一个动作，不要清单（清单让人逃避最难的那个）。
- 必须具体：去找谁、做什么、用什么判断成立或不成立。
- 是"接触真实世界"的动作（约人、发问卷、挂一个落地页、手动跑一遍），不是"再想想/再调研"。
- 绝不评价好坏、不安慰、不夸奖。
- 只输出这一个动作本身，2-3 句话，不要前后缀。`;

/** 基于假设上下文，草拟一个本周可做、能证伪最关键假设的最小实验。 */
export async function draftExperiment(hypothesisContext: string): Promise<string> {
  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: hypothesisContext,
    config: {
      systemInstruction: EXPERIMENT_SYSTEM_PROMPT,
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: 400,
    },
  });
  return (response.text ?? "").trim() || "（未能草拟，请重试）";
}

// ---------------------------------------------------------------------------
// 预演死亡（pre-mortem）：拿方向去撞最常见死法，反乐观偏误
// ---------------------------------------------------------------------------

const PREMORTEM_SYSTEM_PROMPT = `你是一个冷静、对抗性的创业判断者。现在做"预演死亡"：假设这个方向已经失败了，从下面这份"最常见死法"清单里，挑出这个方向**最可能**死于的 2 到 3 种。

最常见死法（只能从这里选 pattern，原样使用）：
${DEATH_PATTERNS.map((d) => `- ${d}`).join("\n")}

铁律：
- 只选最相关的 2-3 种，不要全列。
- 每种给出：why=为什么这个方向特别暴露在这条上（扎根于用户的假设，不空泛）；question=一个能逼用户面对它的尖锐追问。
- 绝不安慰、不夸奖、不给解决方案。

只输出 JSON：{"modes":[{"pattern":"（清单原文）","why":"","question":""}]}
不要输出 JSON 以外的任何文字。`;

/** 拿假设去撞最常见死法，返回最相关的 2-3 种。 */
export async function preMortem(hypothesisContext: string): Promise<DeathMode[]> {
  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: hypothesisContext,
    config: {
      systemInstruction: PREMORTEM_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: 1024,
    },
  });

  const text = (response.text ?? "").trim();
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const parsed = JSON.parse(
      start >= 0 && end >= 0 ? text.slice(start, end + 1) : text
    ) as { modes?: unknown };
    if (!Array.isArray(parsed.modes)) return [];
    return parsed.modes
      .map((m) => m as Record<string, unknown>)
      .filter((m) => typeof m.pattern === "string")
      .map((m) => ({
        pattern: String(m.pattern).trim(),
        why: typeof m.why === "string" ? m.why.trim() : "",
        question: typeof m.question === "string" ? m.question.trim() : "",
      }))
      .slice(0, 3);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// 外部雷达（Phase D）：把 Tavily 检索结果嚼成对抗管线的原料（不做 feed、不排名）
// ---------------------------------------------------------------------------

const DIGEST_SYSTEM_PROMPT = `你是一个冷静的外部信息提炼者，服务于一个对抗认知偏误的决策系统。
给你一个主题和一批联网检索到的资料（带编号）。提炼出与主题相关的"近期真实动态"。

铁律：
- 只陈述事实，不评价、不排名、不推荐（绝不说"好机会/值得做/赛道很火"）。
- 每条：一句客观事实 + 一句"为什么对判断这个主题值得注意" + 标注来源编号。
- 只保留资料里真有依据的，不要编造；编不出就少给几条。
- 最多 6 条。

只输出 JSON：{"items":[{"text":"事实","why":"为什么值得注意","source":编号}]}
不要输出 JSON 以外的任何文字。`;

/** 把检索结果嚼成若干"外部信号"（事实+为什么+来源 url），中性、不排名。 */
export async function digestExternal(
  topic: string,
  sources: TavilyResult[]
): Promise<ExternalSignal[]> {
  if (sources.length === 0) return [];
  const numbered = sources
    .map((s, i) => `[${i}] ${s.title}\n${s.content}`)
    .join("\n\n");

  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: `主题：${topic}\n\n检索资料：\n${numbered}`,
    config: {
      systemInstruction: DIGEST_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: 1500,
    },
  });

  const text = (response.text ?? "").trim();
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const parsed = JSON.parse(
      start >= 0 && end >= 0 ? text.slice(start, end + 1) : text
    ) as { items?: unknown };
    if (!Array.isArray(parsed.items)) return [];
    return parsed.items
      .map((m) => m as Record<string, unknown>)
      .filter((m) => typeof m.text === "string" && (m.text as string).trim())
      .map((m) => {
        const idx =
          typeof m.source === "number" && m.source >= 0 && m.source < sources.length
            ? m.source
            : 0;
        return {
          text: String(m.text).trim(),
          why: typeof m.why === "string" ? m.why.trim() : "",
          url: sources[idx]?.url ?? "",
        };
      })
      .slice(0, 6);
  } catch {
    return [];
  }
}

const REALITY_SYSTEM_PROMPT = `你是一个冷静、对抗性的创业判断者。基于联网检索到的真实资料，对用户的方向做"现实检验"。

回答这几件事（有依据才说，没查到就直说没查到）：谁已经在做 / 之前类似的尝试为何死了 / 该领域产业或政策最近的真实变化 / 对这个方向最大的外部威胁。

铁律：不安慰、不夸奖、不给解决方案、不排名；只把现实摆到用户面前。简洁，3-5 句。`;

/** 拿联网资料对一个方向做对抗性现实检验，附来源链接。 */
export async function realityCheck(
  hypothesisContext: string,
  sources: TavilyResult[]
): Promise<RealityCheckResult> {
  const numbered = sources
    .map((s, i) => `[${i}] ${s.title}\n${s.content}`)
    .join("\n\n");

  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: `方向假设：\n${hypothesisContext}\n\n联网资料：\n${numbered}`,
    config: {
      systemInstruction: REALITY_SYSTEM_PROMPT,
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: 700,
    },
  });

  const text = (response.text ?? "").trim() || "（未能生成现实检验，请重试）";
  // 去重来源后透传作为引用
  const seen = new Set<string>();
  const cites: { title: string; url: string }[] = [];
  for (const s of sources) {
    if (s.url && !seen.has(s.url)) {
      seen.add(s.url);
      cites.push({ title: s.title || s.url, url: s.url });
    }
  }
  return { text, sources: cites };
}

/** 从模型输出里抽出问题数组，对 JSON 外的杂质做容错。 */
function parseQuestions(text: string): string[] {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const json = start >= 0 && end >= 0 ? text.slice(start, end + 1) : text;
    const parsed = JSON.parse(json) as { questions?: unknown };
    if (Array.isArray(parsed.questions)) {
      return parsed.questions
        .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
        .map((q) => q.trim());
    }
  } catch {
    // 解析失败时退回固定第一问，至少不崩。
  }
  return [FIRST_INQUIRY_QUESTION];
}
