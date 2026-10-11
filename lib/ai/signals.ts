import { type ExternalSignal, type RealityCheckResult, type TavilyResult } from "@/app/(app)/ideas/types";
import { FIRST_INQUIRY_QUESTION } from "./core";
import { executeAiJson } from "@/lib/ai-gateway";
import { MODEL, generateContent } from "./shared";

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

  const response = await generateContent({
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

  const response = await generateContent({
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

// ---------------------------------------------------------------------------
// 多国抓取：把一个关键词翻成中/英/日，分别喂给各语言的源
// ---------------------------------------------------------------------------

/** 关键词的多语言译法（用于跨市场抓取）。 */
export type QueryTranslations = { en: string; zh: string; ja: string };

const TRANSLATE_SYSTEM_PROMPT = `你是一个术语翻译器，服务于一个跨市场的创业信号抓取系统。
把用户给的一个"搜索关键词/主题"翻成英语、中文、日语三种，用于在各语言的社区里检索同一主题。

铁律：
- 译成各语言里人们真实会用来搜索的说法（地道术语），不是逐字直译。
- 只译这一个词组本身，不要扩写、不要加引号、不要解释。
- 若原文已是某语言，该语言字段就用原文的地道说法。

只输出 JSON：{"en":"...","zh":"...","ja":"..."}
不要输出 JSON 以外的任何文字。`;

/**
 * 把关键词翻成中/英/日。失败（缺 key / 解析失败）时降级：三种语言都退回原词，
 * 调用方仍能抓取，只是不跨语言。
 */
export async function translateQuery(query: string): Promise<QueryTranslations> {
  const q = query.trim();
  const fallback: QueryTranslations = { en: q, zh: q, ja: q };
  if (!q) return fallback;

  try {
    const response = await generateContent({
      model: MODEL,
      contents: `关键词：${q}`,
      config: {
        systemInstruction: TRANSLATE_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 256,
      },
    });
    const text = (response.text ?? "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const parsed = JSON.parse(
      start >= 0 && end >= 0 ? text.slice(start, end + 1) : text
    ) as Partial<QueryTranslations>;
    return {
      en: typeof parsed.en === "string" && parsed.en.trim() ? parsed.en.trim() : q,
      zh: typeof parsed.zh === "string" && parsed.zh.trim() ? parsed.zh.trim() : q,
      ja: typeof parsed.ja === "string" && parsed.ja.trim() ? parsed.ja.trim() : q,
    };
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// 外部批量信号：AI 对抗分析
// ---------------------------------------------------------------------------

const BATCH_ANALYSIS_SYSTEM_PROMPT = `你是一个冷静、对抗性的创业信号分析者。
以下是从互联网各社区实时抓到的真实讨论片段，关键词由你的调用方提供。

任务（按顺序回答，简洁）：
1. 识别 2-3 个高频痛点模式（如果数量不够，就说"信号量太少，不可过度解读"）。
2. 挑出其中最值得注意的一个，说出为什么这个问题还没有好的解法（从内容里找线索，不要编造）。
3. 最后一句冷水：这些帖子是真实结构性痛点，还是少数人的抱怨？给出你的判断。

铁律：不安慰、不夸奖、不给创业建议；3-6 句，直接，中文输出。`;

/**
 * 对一批刚抓到的外部信号做对抗性分析：识别痛点模式、判断信号强度。
 * 失败时静默返回空字符串，不阻断收件箱展示。
 */
export async function analyzeExternalBatch(
  query: string,
  items: { title: string | null; raw_text: string; source: string }[]
): Promise<string> {
  if (items.length === 0) return "";
  const snippets = items
    .slice(0, 15)
    .map(
      (it, i) =>
        `[${i + 1}][${it.source}] ${it.title ?? ""}\n${it.raw_text.slice(0, 300)}`
    )
    .join("\n\n");
  try {
    const response = await generateContent({
      model: MODEL,
      contents: `关键词：${query}\n共 ${items.length} 条片段：\n\n${snippets}`,
      config: {
        systemInstruction: BATCH_ANALYSIS_SYSTEM_PROMPT,
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 500,
      },
    });
    return (response.text ?? "").trim();
  } catch {
    return "";
  }
}

/** 从模型输出里抽出问题数组，对 JSON 外的杂质做容错。 */
export function parseQuestions(text: string): string[] {
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


// ---------------------------------------------------------------------------
// 外部信号（/signals）：每日精选 + 单条深读。
// 目的：让用户对世界多一点认识、跟上新工具。讲清楚来龙去脉，不迎合、不打分、不给投资建议。
// ---------------------------------------------------------------------------

/** 出现这些词就算迎合或越界（原则 2；不给投资建议），整条作废重来。 */
const SIGNAL_BANNED = [
  "值得关注",
  "很有潜力",
  "不错的",
  "机会很大",
  "建议买",
  "建议卖",
  "买入",
  "卖出",
  "加仓",
  "减仓",
  "抄底",
  // 空话：说了等于没说
  "有启发",
  "有参考价值",
  "更全面地理解",
];

function assertNoBanned(texts: string[]): void {
  const all = texts.join("\n");
  const hit = SIGNAL_BANNED.find((w) => all.includes(w));
  if (hit) throw new Error(`出现了不该出现的话：${hit}`);
}

function requireString(v: Record<string, unknown>, key: string): string {
  const s = typeof v[key] === "string" ? (v[key] as string).trim() : "";
  if (!s) throw new Error(`缺少 ${key}`);
  return s;
}

const SIGNAL_SHARED_RULES = `铁律：
- 只用给你的材料往下推。材料里没有的数字、日期、公司名一律不写；推测要写成"可能"。
- 不夸、不打气、不说"值得关注""很有潜力"。
- 不给任何投资、买卖、理财建议。
- 不打分、不排名、不给百分比。
- 不替他假设他没写过的处境（有没有房贷、有没有投资、住在哪）。他写了什么就只用什么。
- 说"跟你"的那一句必须具体：点出他工作里会碰到的一件事、或他能动手做的一件事。不许写"有助于你理解""可能对你有帮助"这种话。
- 利率、汇率、政策这类宏观的事，要往下推到他所在的行业会怎样（比如消费、广告预算、招聘），推得到就不要说"关系不大"。
- 中文，短句，第二人称"你"，像一个懂行的老同事在旁边说话。`;

function aboutUser(context: string, ideas: string[], dreams: string[]): string {
  const list = (items: string[]) => (items.length ? items.map((t) => `- ${t}`).join("\n") : "（没有）");
  return [
    `他自己写的背景：${context.trim() || "（没写）"}`,
    `他手上的想法：\n${list(ideas)}`,
    `他的梦想：\n${list(dreams)}`,
  ].join("\n");
}

export type SignalReader = {
  /** 用户在 /signals 上自己写的几句背景。 */
  context: string;
  ideas: string[];
  dreams: string[];
};

// ── 单条深读 ───────────────────────────────────────────────────────────────

export type NewsAnalysisInput = SignalReader & {
  title: string;
  summary: string;
  /** 文章正文的粗提取；拿不到时为空。 */
  body: string;
  source: string;
};

export type NewsAnalysis = {
  /** 来龙去脉：这件事为什么会发生，之前是什么情况。 */
  background: string;
  /** 这件事经过哪几步会影响到谁。 */
  chain: string;
  /** 对他意味着什么；无关就直说。 */
  forYou: string;
  /** 能找哪一类人聊、问哪一句。 */
  who: string;
  question: string;
};

const NEWS_ANALYSIS_PROMPT = `你帮一个人读新闻。他读新闻是为了对这个世界多一点认识，顺便看清方向。
他的情况见材料最后的"他自己写的背景"。

给你一条新闻（标题、简介，可能有正文）和他的情况。输出五段：
1. background：来龙去脉。这件事为什么会发生、之前是什么状况、有什么争议或另一种看法。3 到 5 句，让一个不懂这个领域的人也能看懂。
2. chain：这件事接下来会经过哪几步，落到哪一类人或公司身上。写成"A → B → C"，2 到 4 步。
3. forYou：对他意味着什么。从他写的背景（工作、处境、打算）或他手上的想法与梦想里找连接点，点名说是哪一个。真的无关就直说"跟你关系不大"，再说一句它跟谁关系大。
4. who：能找哪一类真人聊来把这件事看得更清楚，具体到身份。
5. question：见面时可以直接问的一句话，要具体到对方能答出一件事，不要问"您怎么看"这种大问题。

${SIGNAL_SHARED_RULES}

只输出 JSON：{"background":"…","chain":"…","forYou":"…","who":"…","question":"…"}`;

/** 校验单条深读：五段齐全、没有迎合与投资建议。不合格就抛，gateway 会重试一次。 */
export function parseNewsAnalysis(value: unknown): NewsAnalysis {
  if (!value || typeof value !== "object") throw new Error("输出不是对象");
  const v = value as Record<string, unknown>;
  const result: NewsAnalysis = {
    background: requireString(v, "background"),
    chain: requireString(v, "chain"),
    forYou: requireString(v, "forYou"),
    who: requireString(v, "who"),
    question: requireString(v, "question"),
  };
  assertNoBanned(Object.values(result));
  return result;
}

export async function analyzeNewsItem(input: NewsAnalysisInput): Promise<NewsAnalysis> {
  const contents = [
    `新闻标题：${input.title}`,
    `新闻简介：${input.summary || "（没有）"}`,
    `正文节选：${input.body || "（拿不到正文，只能根据标题和简介推）"}`,
    `来源：${input.source}`,
    "",
    aboutUser(input.context, input.ideas, input.dreams),
  ].join("\n");

  return executeAiJson(
    { operation: "news_analysis", module: "unknown", outputMode: "json", timeoutMs: 45_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1
          ? "\n\n上一次输出没通过校验（缺字段，或出现了迎合、投资建议类的话）。严格按 JSON 字段重写。"
          : ""),
      config: {
        systemInstruction: NEWS_ANALYSIS_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 2000,
      },
    }),
    parseNewsAnalysis
  );
}

// ── 每日精选 ───────────────────────────────────────────────────────────────

export type BriefCandidate = { title: string; text: string; source: string };

export type BriefPick = {
  /** 候选列表里的序号。 */
  index: number;
  /** 一句话：发生了什么 / 这是什么工具。 */
  headline: string;
  /** 新闻：为什么重要、来龙去脉；工具：能拿来做什么。 */
  background: string;
  /** 跟他有什么关系 / 他可以拿它试什么。 */
  forYou: string;
};

const BRIEF_SIZE = 5;

const BRIEF_PROMPTS: Record<"news" | "tools", string> = {
  news: `你每天早上帮一个人从几十条新闻里挑出 ${BRIEF_SIZE} 条最值得读的。
他读新闻是为了对这个世界多一点认识。他的情况见材料开头的"他自己写的背景"。

挑的标准（按这个顺序考虑）：
- 会改变很多人处境的事：利率、汇率、政策、规制、大公司的大动作、产业结构的变化。
- 能看出"钱往哪里流、谁遇到了新麻烦、什么变便宜了"的事。
- 跟他写的背景、他手上的想法有关的事。
不挑：单纯的事件、犯罪、八卦、同一件事的重复报道（同一件事只留一条）。

每条写：
- headline：一句话说发生了什么。
- background：为什么重要、来龙去脉，2 到 3 句。
- forYou：跟他有什么关系，一句话；关系不大就说它会影响谁。`,
  tools: `你每天帮一个人从几十个 GitHub 新仓库里挑出 ${BRIEF_SIZE} 个最值得看的工具，让他跟上时代。
他的情况见材料开头的"他自己写的背景"。

挑的标准：
- 能直接拿来用、能解决一类真实问题的工具，优先于纯研究代码、作业、清单类仓库。
- 代表一个新趋势的（比如 AI agent 的新用法），哪怕他暂时用不上。
- 跟他写的背景（工作、在学的东西）有关的优先。

每条写：
- headline：一句话说这是什么。
- background：它能拿来做什么、为什么现在有很多人关注它，2 到 3 句。
- forYou：他可以拿它试的一件具体的事，一句话。`,
};

export function parseBrief(value: unknown, candidateCount: number): BriefPick[] {
  if (!value || typeof value !== "object") throw new Error("输出不是对象");
  const picks = (value as { picks?: unknown }).picks;
  if (!Array.isArray(picks) || picks.length === 0) throw new Error("缺少 picks");
  const seen = new Set<number>();
  const result: BriefPick[] = [];
  for (const raw of picks) {
    if (!raw || typeof raw !== "object") continue;
    const v = raw as Record<string, unknown>;
    const index = typeof v.index === "number" ? v.index : Number(v.index);
    if (!Number.isInteger(index) || index < 0 || index >= candidateCount || seen.has(index)) continue;
    seen.add(index);
    result.push({
      index,
      headline: requireString(v, "headline"),
      background: requireString(v, "background"),
      forYou: requireString(v, "forYou"),
    });
  }
  if (result.length === 0) throw new Error("没有一条能对上候选序号");
  assertNoBanned(result.flatMap((p) => [p.headline, p.background, p.forYou]));
  return result.slice(0, BRIEF_SIZE);
}

export async function generateSignalBrief(
  kind: "news" | "tools",
  candidates: BriefCandidate[],
  reader: SignalReader
): Promise<BriefPick[]> {
  if (candidates.length === 0) return [];
  const numbered = candidates
    .map((c, i) => `[${i}] ${c.title}（${c.source}）\n${c.text.slice(0, 160)}`)
    .join("\n");
  const contents = `${aboutUser(reader.context, reader.ideas, reader.dreams)}\n\n候选：\n${numbered}`;
  const systemInstruction = `${BRIEF_PROMPTS[kind]}

${SIGNAL_SHARED_RULES}

只输出 JSON：{"picks":[{"index":序号,"headline":"…","background":"…","forYou":"…"}]}`;

  return executeAiJson(
    { operation: `signal_brief_${kind}`, module: "unknown", outputMode: "json", timeoutMs: 50_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1
          ? "\n\n上一次输出没通过校验（序号对不上、缺字段，或出现了迎合、投资建议类的话）。严格按 JSON 字段重写。"
          : ""),
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 3000,
      },
    }),
    (value) => parseBrief(value, candidates.length)
  );
}
