import { type ExternalSignal, type RealityCheckResult, type TavilyResult } from "@/app/(app)/ideas/types";
import { FIRST_INQUIRY_QUESTION } from "./core";
import { executeAiJson, executeJev, type JevQuestion, type JevResult } from "@/lib/ai-gateway";
import { MODEL, generateContent } from "./shared";
import { INFERENCE_LENSES, TIER_VALUE, type InferenceBasis, type InferenceLens } from "@/lib/domains/signals/inference-shared";

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
  "资金配置",
  "理财",
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

/**
 * 新闻多半是日文，模型会跟着原文写日文。正文里假名超过一成就当作没用中文，作废重写。
 * （中文里偶尔夹一个片假名专有名词不算。）
 */
export function assertChinese(texts: string[]): void {
  const all = texts.join("");
  const letters = all.replace(/[\s\p{P}\p{S}0-9A-Za-z]/gu, "");
  if (letters.length === 0) return;
  const kana = (all.match(/[\u3040-\u30ff]/g) ?? []).length;
  if (kana / letters.length > 0.1) throw new Error("用了日文，没有用中文写");
}

/**
 * 跟 assertChinese 一样，但允许用片假名点名日本的服务和公司（"イオンネットスーパー"）：
 * 只数平假名 —— 用日文写句子才会有大量平假名，中文里夹几个片假名专名不会。
 */
export function assertChineseAllowingNames(texts: string[]): void {
  const all = texts.join("");
  const letters = all.replace(/[\s\p{P}\p{S}0-9A-Za-z\u30a0-\u30ff]/gu, "");
  if (letters.length === 0) return;
  const hiragana = (all.match(/[\u3040-\u309f]/g) ?? []).length;
  if (hiragana / letters.length > 0.1) throw new Error("用了日文，没有用中文写");
}

/**
 * 有没有用数字说可能性（"70% 的可能""概率为三成""百分之八十会"）。
 * 只拦跟"可能、概率、把握、机会"连在一起的数字 —— 利率 1.25%、增长 3% 这类事实里的百分比不拦。
 */
export function mentionsNumericLikelihood(text: string): boolean {
  const num = String.raw`(\d+(\.\d+)?\s*[%％]|百分之[\d一二三四五六七八九十百]+|[一二三四五六七八九十\d]+成)`;
  const word = "(可能|概率|几率|机率|把握|机会)";
  return (
    new RegExp(String.raw`${num}\s*的?\s*${word}`).test(text) ||
    new RegExp(String.raw`${word}(性)?\s*(为|是|约|大约|在|有)?\s*${num}`).test(text)
  );
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
- 不要为了联系而联系。大多数新闻本来就跟他手上的事无关。不要每条都扯到他的项目、技能或梦想，
  也不要用"作为未来的社长"这种套话。
- 说"跟你"的那一句必须具体：点出他工作里会碰到的一件事、或他能动手做的一件事。不许写"有助于你理解""可能对你有帮助"这种话。
- 利率、汇率、政策这类宏观的事，要往下推到他所在的行业会怎样（比如消费、广告预算、招聘），推得到就不要说"关系不大"。
- 一律用简体中文写，哪怕新闻原文是日文或英文。日文专有名词可以保留原文，但句子必须是中文。
- 短句，第二人称"你"，像一个懂行的老同事在旁边说话。`;

/**
 * AI 读新闻时知道的"他"。全部来自他做过的事，不来自他怎么说自己：
 * 最近记下的观察、/self 里有行为支撑的假设（工作假设及以上）、点亮的技能、手上的想法和梦想，
 * 再加上从 /self 自述里抽出的"处境事实"（经用户裁决：只抽事实不抽自我评价，每条带原文出处）。
 * 写法画像（self_portraits）不读。
 */
export type SignalReader = {
  /** 从自述里抽出的处境事实：工作、行业、在学、在做的事。 */
  facts: string[];
  /** 最近记下的观察（截短）。他会把什么记下来，就说明他在关心什么。 */
  observations: string[];
  /** /self 里工作假设、可承重两档的假设。 */
  hypotheses: string[];
  /** 技能树里已经点亮的技能名。 */
  skills: string[];
  ideas: string[];
  dreams: string[];
};

export const EMPTY_READER: SignalReader = { facts: [], observations: [], hypotheses: [], skills: [], ideas: [], dreams: [] };

function aboutUser(reader: SignalReader): string {
  const sections: [string, string[]][] = [
    ["他的处境（从他的自述里抽出的事实）", reader.facts],
    ["他最近记下的观察（说明他在关心什么）", reader.observations],
    ["关于他、已经有行为支撑的判断", reader.hypotheses],
    ["他已经练出来的技能", reader.skills],
    ["他手上的想法", reader.ideas],
    ["他的梦想", reader.dreams],
  ];
  const filled = sections.filter(([, items]) => items.length > 0);
  if (filled.length === 0) {
    return "关于他：（还没有任何记录。不要猜他的职业、客户或处境；说\"跟你\"时改成说这件事会影响哪一类人。）";
  }
  return [
    "关于他（都来自他做过、记过的事；只用这些，不要额外猜他的职业和处境）：",
    ...filled.map(([title, items]) => `${title}：\n${items.map((t) => `- ${t}`).join("\n")}`),
  ].join("\n");
}

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
他的情况见材料最后"关于他"的部分。

给你一条新闻（标题、简介，可能有正文）和他的情况。输出五段：
1. background：来龙去脉。这件事为什么会发生、之前是什么状况、有什么争议或另一种看法。3 到 5 句，让一个不懂这个领域的人也能看懂。
2. chain：这件事接下来会经过哪几步，落到哪一类人或公司身上。写成"A → B → C"，2 到 4 步。
3. forYou：对他意味着什么。从"关于他"里找连接点（他记过的观察、练的技能、手上的想法与梦想），点名说是哪一条。真的无关就直说"跟你关系不大"，再说一句它跟谁关系大。
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
  assertChinese(Object.values(result));
  return result;
}

export async function analyzeNewsItem(input: NewsAnalysisInput): Promise<NewsAnalysis> {
  const contents = [
    `新闻标题：${input.title}`,
    `新闻简介：${input.summary || "（没有）"}`,
    `正文节选：${input.body || "（拿不到正文，只能根据标题和简介推）"}`,
    `来源：${input.source}`,
    "",
    aboutUser(input),
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

export type BriefCandidate = {
  title: string;
  text: string;
  source: string;
  /** 来自中文媒体：报告里多写一句"日本这边有没有"。 */
  china?: boolean;
  /** 美国媒体（Hacker News、TechCrunch）。 */
  us?: boolean;
};

export type BriefPick = {
  /** 候选列表里的序号。 */
  index: number;
  /** 一句话：发生了什么 / 这是什么工具。 */
  headline: string;
  /** 新闻：为什么重要、来龙去脉；工具：能拿来做什么。 */
  background: string;
  /** 每条都有的一句，不涉及他：主要影响谁 / 可以找谁聊 / 可以拿它试什么。 */
  forYou: string;
  /** 这是哪件事的短标签（"日银加息"）。代码按它去重：同一件事的几篇报道、后续反应只留一条。 */
  event: string;
  /** 德鲁克的创新机会来源（"意外"另有一步专门找）。拿不准、都不算的不标。 */
  opportunity?: OpportunitySource;
  /** 先例：这条讲的是某个方向"有人试过的结果"时，一句话说它对想走这个方向的人说明了什么。 */
  precedent?: string;
  /** PESTLE 领域（政治、经济、社会、技术、法律、环境）。 */
  domain?: PestleDomain;
};

/** PESTLE：拿来查报告这一周有没有长期漏掉哪个领域（只当检查表，不当主干）。 */
export const PESTLE_DOMAINS = ["political", "economic", "social", "technological", "legal", "environmental"] as const;
export type PestleDomain = (typeof PESTLE_DOMAINS)[number];

/** 德鲁克《创新与企业家精神》的七个来源，去掉"意外"（另有一步专门找、并由裁判核实）。 */
export const OPPORTUNITY_SOURCES = ["incongruity", "process", "structure", "demographics", "perception", "knowledge"] as const;
export type OpportunitySource = (typeof OPPORTUNITY_SOURCES)[number];

/** "也值得一看"：只有一句中文标题，不写背景。 */
export type BriefMore = { index: number; event: string; headline: string };

/** 一份报告里最多几条点到他。多了就是硬扯。 */
const MAX_PERSONAL = 2;

const BRIEF_SIZE = 5;

export type BriefKind = "news" | "tools" | "voices" | "calendar" | "money";

const BRIEF_PROMPTS: Record<BriefKind, string> = {
  news: `你每天早上帮一个人从几十条新闻里挑出 ${BRIEF_SIZE} 条最值得读的。
他读新闻是为了对这个世界多一点认识。

挑的标准（按这个顺序考虑）：
- 会改变很多人处境的事：利率、汇率、政策、规制、大公司的大动作、产业结构的变化。
- 能看出"钱往哪里流、谁遇到了新麻烦、什么变便宜了"的事。
- 众筹达成目标的报道（Makuake、CAMPFIRE）是"有人真掏钱"的证据：挑能看出一类新需求的产品，
  不挑粉丝应援、演出、游戏制作、文化财修缮这类靠情分筹钱的。
不挑：单纯的事件、犯罪、八卦、体育比赛、娱乐明星、动漫游戏新作、天气。

候选里标了"（中国）"的来自中文媒体。中国已经跑通、日本还没有的做法，往往几年后会来日本 ——
这是读日文新闻看不到的东西。
- 来源写着"中国 App 榜新上榜"的条目最多挑 1 条（只挑看得出一种新用法、新生意的）。
- 只要有一条中国的条目讲的是一种做法、产品或消费上的变化（一家公司怎么做生意、一种新服务、人们开始怎么买东西），
  5 条里至少留 1 条中国的。政府发文、监管新规、股市、宏观数据都不算；一条合适的都没有就不留。
  （"日本这边有没有"会单独再问一次，这里不用写。）
同一件事只留一条：一个事件和它引发的后续反应（比如"央行加息"和"银行跟着调存款利率"）算同一件事，挑一条，后续放进 background 里讲。

每条写：
- headline：一句话说发生了什么。
- background：为什么重要、来龙去脉，3 到 4 句，让不懂这个领域的人也能看懂。
- forYou：这件事主要影响哪一类人或企业、怎么影响，一到两句。直接写"物流公司会……""地方银行要……"，不写"你"，也不写"如果你在 XX 行业"。`,
  tools: `你每天帮一个人挑出 ${BRIEF_SIZE} 条"什么变得可能了"，让他跟上时代。
候选有两种：GitHub 上的新仓库（来源写着 GitHub），和"什么变得可能了"的新闻（AI 降价、规制缓和、日本首次提供的服务）。

挑的标准：
- 仓库：能直接拿来用、能解决一类真实问题的，优先于纯研究代码、作业、清单类仓库；代表一个新趋势的也可以。
- 新闻：一件以前做不了、做不起、不让做的事，现在能做了（API 价格砍半、某个行业的规制放开、某种服务第一次在日本提供）。
  只是新品发布、营销活动的不挑。
- 两种都要有：只要候选里有合格的"新闻"，5 条里至少留 1 条。

每条写：
- headline：一句话说这是什么（仓库）或什么变得可能了（新闻）。
- background：它能拿来做什么、为什么是现在，3 到 4 句。
- forYou：仓库写可以拿它试的一件具体的事（一个周末能做完）；新闻写哪类人或生意现在多了一个选项，一句话。`,
  money: `你每天帮一个人从几十条消息里挑出最多 ${BRIEF_SIZE} 条"谁在掏钱"。
抱怨不花钱，掏钱才是真的：钱往哪里流，比谁在说什么更能看出真需求。
材料有四种：创业公司融资、众筹达成目标、政府补助金公募、事业承继和 M&A。

挑的标准：
- 能看出"谁、为了什么、掏了多少"的：投资人押注什么（融资）、普通人愿意为什么新东西付钱（众筹）、
  政府要花钱推动什么（补助金）、谁在买下别人的生意、为什么（事业承继、M&A）。
- 同一类钱（比如好几家 AI 公司融资）只留最能说明趋势的一条。
不挑：粉丝应援、演出、文化财修缮这类靠情分筹的钱；上市公司的常规财报；补助金的申请攻略广告。

每条写：
- headline：一句话说谁掏钱、为了什么。
- background：钱的来龙去脉，以及它说明了什么需求，3 到 4 句。
- forYou：这笔钱流向哪里，对哪类人或生意意味着什么，一到两句。不写"你"。`,
  voices: `你每天帮一个人从几十条材料里挑出最多 ${BRIEF_SIZE} 条"谁在头疼什么"。
材料来自一线干活的人自己写、自己转发的文章（はてブ热门、note #経営）、"招不到人、人手不足"的报道，
以及倒产的消息（倒产新闻、東京商工リサーチ / 帝国データバンク 的统计）。
他想知道一线的人具体卡在哪里 —— 别人的麻烦，往往就是生意的来源。

挑的标准：
- 有一个具体的人群卡在一个具体的地方（谁、卡在哪、试过什么、为什么没解决）。
- 招人难的报道要看出"招不到的是什么样的人、为什么招不到"。
- 倒产的消息要看出哪个行业、死于什么（人手不足、物价高、后继者不在、借款还不上）。
  单家公司倒闭的八卦不挑；挑能看出一类公司一起撑不住的（月度统计、某个行业连着倒）。
不挑：纯观点争吵、名人发言、和工作无关的生活趣闻、技术教程、新产品或新工具的发布（那是"新工具"那一节的事，不是一线的人在头疼的事）。

每条写：
- headline：一句话说谁在烦什么。
- background：具体卡在哪、已经有人怎么应对、为什么还没解决，3 到 4 句。
- forYou：可以去找谁聊、问什么，一到两句（具体到身份，比如"在中小物流公司做调度的人"）。不要往他的工作上扯。`,
  calendar: `你帮一个人整理"已经定了的未来"：从几十条法规意见征集和新闻里，找出写明了日期的、确定会发生的变化。
这类事几乎一定会发生，只是还没变成大新闻。每次生效之前，都有一批企业或个人要调整、愿意花钱解决。

规则（严格）：
- 只挑材料里明确写了日期或时间点（施行日、义务化开始、意见募集截止、制度开始）的条目。没写日期的一律不挑，不要自己推测日期。
- 同一项制度只留一条。
- 最多 ${BRIEF_SIZE} 条，真的没有就少挑。

每条写：
- headline：以日期开头，比如"2027年4月起：……"或"意见募集截止 2026年11月10日：……"。日期必须是材料里写的。
- background：要变的是什么、为什么要变、之前是什么样，2 到 3 句。
- forYou：会影响哪一类人或企业、他们到时候要做什么调整，一到两句。只写受影响的人，不写"你"。`,
};

const OVERVIEW_TOPIC: Record<BriefKind, string> = {
  news: "今天世界上发生了什么、整体在往哪个方向变",
  tools: "今天什么变得可能了：大家在做什么样的工具，哪些以前做不了的事现在能做了",
  voices: "今天一线的人普遍卡在哪里、这些麻烦有什么共同点",
  calendar: "接下来几个月有哪些已经定了的变化、哪些人要开始准备（一条都没有就直说这批消息里没有写明日期的变化）",
  money: "今天钱往哪里流：投资人、消费者、政府各在为什么掏钱",
};

export type BriefPractice = {
  /** 候选列表里的序号，必须是 picks 里的一条。 */
  index: number;
  /** 一个能在几个月后用事实检验的问题。 */
  question: string;
  /** 到时候看什么来判断对错。 */
  checkHow: string;
  /** 为什么它两个方向都有可能（各一个理由）—— 这道题值得判断的原因。早期数据没有。 */
  whyUncertain?: string;
  /** 多久能见分晓（判断表单默认选这一档）。以题目里写的时间点为准，见 practiceHorizon。 */
  horizon?: PracticeHorizon;
};

/** 练习题的期限档（和 practice-shared 的 HORIZONS 同名同天数；lib/ai 不依赖 domains）。 */
export type PracticeHorizon = "1m" | "3m" | "6m" | "1y" | "3y";
const PRACTICE_HORIZON_DAYS: [PracticeHorizon, number][] = [
  ["1m", 30],
  ["3m", 91],
  ["6m", 182],
  ["1y", 365],
  ["3y", 1095],
];

/** 今天的东京日期 YYYY-MM-DD。 */
function tokyoDate(): string {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
}

function monthEnd(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0));
}

/**
 * 题目里写的最晚的时间点（"到明年底""2027年3月""到年底""到1月底"）。认不出来返回 null。
 * today 是东京日期 YYYY-MM-DD。
 */
export function questionDeadline(question: string, today: string): Date | null {
  const [y, m] = today.split("-").map(Number);
  const found: Date[] = [];
  for (const x of Array.from(question.matchAll(/(20\d\d)\s*年\s*(\d{1,2})\s*月/g))) found.push(monthEnd(Number(x[1]), Number(x[2])));
  for (const x of Array.from(question.matchAll(/(20\d\d)\s*年(?!\s*\d{1,2}\s*月)/g))) found.push(monthEnd(Number(x[1]), 12));
  for (const x of Array.from(question.matchAll(/(明|后)年\s*(\d{1,2})\s*月/g))) found.push(monthEnd(y + (x[1] === "明" ? 1 : 2), Number(x[2])));
  for (const x of Array.from(question.matchAll(/(明|后)年(?!\s*\d{1,2}\s*月)/g))) found.push(monthEnd(y + (x[1] === "明" ? 1 : 2), 12));
  if (/(今年)?年[底末]/.test(question.replace(/(明|后)年[底末]/g, "")) && !/20\d\d\s*年[底末]/.test(question)) found.push(monthEnd(y, 12));
  // 相对的说法："未来一年内""半年后""三个月内"
  const base = new Date(`${today}T00:00:00Z`).getTime();
  const NUM: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 九: 9, 十: 10, 十二: 12 };
  const num = (x: string) => NUM[x] ?? Number(x);
  for (const x of Array.from(question.matchAll(/(十二|[一两二三四五六九十]|\d{1,2})\s*个?月(内|之内|以内|后|以后)/g))) {
    const n = num(x[1]);
    if (n > 0) found.push(new Date(base + n * 30.5 * 86_400_000));
  }
  for (const x of Array.from(question.matchAll(/(?<![明后今去])([一两二三五]|\d)\s*年(内|之内|以内|后|以后)/g))) {
    const n = num(x[1]);
    if (n > 0) found.push(new Date(base + n * 365 * 86_400_000));
  }
  if (/半年(内|之内|以内|后|以后)/.test(question)) found.push(new Date(base + 182 * 86_400_000));
  // 不带年份的"1月底""3月"：今年还没过就是今年，过了就是明年
  for (const x of Array.from(question.matchAll(/(?<![年\d个])(\d{1,2})\s*月/g))) {
    const mm = Number(x[1]);
    if (mm < 1 || mm > 12) continue;
    found.push(monthEnd(mm >= m ? y : y + 1, mm));
  }
  if (found.length === 0) return null;
  return new Date(Math.max(...found.map((d) => d.getTime())));
}

/**
 * 判断表单默认选哪一档：题目里写了时间点就按它来（"到明年底"就是一年后，不能配一个月后对账），
 * 没写就用 AI 给的档。
 */
export function practiceHorizon(question: string, aiHorizon: PracticeHorizon | undefined, today: string): PracticeHorizon {
  const deadline = questionDeadline(question, today);
  if (!deadline) return aiHorizon ?? "3m";
  const days = (deadline.getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000;
  // 只挑一档期限时不加余量（"三个月后"就是三个月那一档）；等消息的一周余量在"按题目里的日子"那个选项里加
  return PRACTICE_HORIZON_DAYS.find(([, d]) => d >= days - 3)?.[0] ?? "3y";
}

export type Brief = {
  /** 报告开头"今天的世界"：把几条串起来讲，3 到 5 句。 */
  overview: string;
  picks: BriefPick[];
  /** 精选之外、也值得一看的几条（不同的事），只有标题。 */
  more: BriefMore[];
  /** 只有新闻报告有：今天的练习题。 */
  practice: BriefPractice | null;
};

const practiceInstruction = (today: string) => `再出一道今天的练习题（practice）。他在练"读新闻、下判断、事后对账"。今天是 ${today}。
- 从你挑的 5 条里选一条"关键不确定"的事（index 用候选序号）：
  ①重要：结果会影响很多人或企业；②真的可能往两个方向走：有理由会，也有理由不会。
  不选已经定了的事（已经通过的法规、已经公布的日程、已经发生的结果）—— 那些只需要知道，不需要判断。
  也不选怎么判都无所谓的小事。后续要有公开消息能验证。
- whyUncertain：一句话说清它为什么两个方向都有可能，各给一个理由（"会，因为……；不会，因为……"）。
- horizon：多久能见分晓，只能是 "1m"（一个月）、"3m"（三个月）、"6m"（半年）之一。优先出三个月内就能见分晓的题；
  事情本身要一年以上才有结果的话，就问它半年内会出现的一个具体苗头（某个公告、某个数字、某家公司的动作），不要直接问一年后。
- question：一个几个月内能用事实检验的问题，问"会怎样"而不是"你怎么看"。要能回答成一句具体的话。
  题目里的时间点必须落在 horizon 以内，写成具体的月份（今天是 ${today}，horizon 是 3m 的话就问"到某年某月底"，不要写"到明年底"）。
  句式："到某个时间点，某个具体的对象会不会做某件事？"或"到某个时间点，某个数字会不会过某条线？"
  对象、事件、数字都从这条新闻里来，不要套用别的新闻。
  不要："你怎么看这件事？"
- checkHow：到时候去看什么来判断对错，一句话（看哪类新闻、哪个数字、哪家公司的公告）。
`;

/** 世界、一线、掏钱三节：每条标德鲁克的机会来源，以及是不是"有人试过的结果"。 */
const OPPORTUNITY_INSTRUCTION = `每条 picks 再写两个可选字段：
- opportunity：按德鲁克说的创新机会来源，这条属于哪一种，只能选一个：
  "incongruity"（不协调：现实和大家以为的不一样）/"process"（流程上的需要：某个环节卡住了）/
  "structure"（行业或市场的结构在变）/"demographics"（人口在变）/"perception"（人们的观念和认知在变）/
  "knowledge"（新知识、新技术）/"none"（都不算）。拿不准就写 "none"。"意外"另有一步专门找，这里不用标。
- precedent：如果这条讲的是某个方向"有人试过的结果"（撤退、停服、转型、失败，或者在别处做成了），
  用一句话写它对想走这个方向的人说明了什么（例："重资产自建仓的即时配送在日本撑不住，要靠和超市合作"）。不是就留空字符串。
`;

/** 除了"什么变得可能了"，每条都标一个 PESTLE 领域：一周下来看哪个领域一直没出现。 */
const DOMAIN_INSTRUCTION = `每条 picks 再写 domain：这条主要属于哪个领域，只能选一个：
"political"（政治、外交、安保）/"economic"（经济、金融、企业、产业）/"social"（社会、人口、生活方式、劳动）/
"technological"（技术）/"legal"（法律、规制、制度）/"environmental"（环境、能源、气候、灾害）。
`;

/** 总述的最后一句：今天的消息主要落在德鲁克的哪种机会来源上。 */
const OVERVIEW_LENS = `如果今天有两条以上真的落在同一种机会来源上（人口在变、行业结构在变、流程卡住了、观念在变、新知识、现实和大家以为的不一样），
overview 最后用一句点出来，并说是哪几件事（"倒产潮和外国司机招聘，都是人口在变"）。落不到一起就不写这一句。
不许写"这些事件共同说明了行业结构和流程正在快速变化""企业需要重新审视……"这种换一天也成立的话。`;

/** allowEmpty：日程那一份，当天真没有带日期的消息时允许一条都不挑（不许硬凑）。 */
const MORE_SIZE = 5;

const MORE_INSTRUCTION = `每条 picks 都写 event：这是哪件事的短标签，4 到 10 个字（比如"日银加息""台积电熊本"）。
同一件事的不同报道、它引发的后续反应，用同一个标签 —— 代码会按标签去重，标签不同的才算不同的事。
picks 按重要性从高到低排，可以多挑一两条备选（最多 ${BRIEF_SIZE + 2} 条），去重后只留前 ${BRIEF_SIZE} 条。

再写 more：精选之外、也值得一看的最多 ${MORE_SIZE} 条，必须是和 picks 不同的事。每条只写 index、title、event，
和 headline（一句中文，说清楚发生了什么）。不写背景。没有就给空数组。

picks 和 more 每条都写 title：照抄那条候选的原标题，原文语言、不翻译，抄前 20 个字就行。
代码拿它核对 index —— 候选有几十条，序号很容易数错一位，标题写的是这条、链接却点到隔壁那条。对不上的会被丢掉。
`;

/** 标签比较前去掉空格和标点；一个包含另一个也算同一件事（"日银加息" ⊂ "日银加息后银行跟进"）。 */
export function sameEvent(a: string, b: string): boolean {
  const norm = (t: string) => t.toLowerCase().replace(/[\s\p{P}]/gu, "");
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/** AI 照抄的原标题能不能对上这条候选：去掉空格标点、全半角统一后，抄的前 12 个字要出现在原标题里。 */
export function titleEchoMatches(echo: string, title: string): boolean {
  const norm = (t: string) => t.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
  const e = norm(echo).slice(0, 12);
  const t = norm(title);
  if (!e || !t) return false;
  // 原标题很短时，AI 可能连后面的"（媒体名）"一起抄了
  return (e.length >= Math.min(6, t.length) && t.includes(e)) || (t.length >= 4 && e.startsWith(t));
}

/**
 * 序号由 AI 给、标题由 AI 照抄，两者对不上时以标题为准（数错序号比抄错标题常见）。
 * 标题只对得上另一条候选就换成那一条；requireTitle 时，没抄标题或哪条都对不上就丢掉（返回 null），
 * 否则照旧信序号 —— 精选后面还会按正文重写，"也值得一看"没有这一步，只能在这里拦。
 */
function resolveCandidateIndex(rawIndex: unknown, rawTitle: unknown, titles: string[], requireTitle: boolean): number | null {
  const index = typeof rawIndex === "number" ? rawIndex : Number(rawIndex);
  const inRange = Number.isInteger(index) && index >= 0 && index < titles.length;
  const echo = typeof rawTitle === "string" ? rawTitle.trim() : "";
  if (echo) {
    if (inRange && titleEchoMatches(echo, titles[index])) return index;
    const hits = titles.flatMap((t, i) => (titleEchoMatches(echo, t) ? [i] : []));
    if (hits.length === 1) return hits[0];
  }
  return inRange && !requireTitle ? index : null;
}

export function parseBrief(value: unknown, candidateTitles: string[], allowEmpty = false): Brief {
  if (!value || typeof value !== "object") throw new Error("输出不是对象");
  const overview = dropFillerSentences(requireString(value as Record<string, unknown>, "overview"));
  const rawPicks = (value as { picks?: unknown }).picks;
  if (!Array.isArray(rawPicks)) throw new Error("缺少 picks");
  if (rawPicks.length === 0) {
    if (allowEmpty) return { overview, picks: [], more: [], practice: null };
    throw new Error("缺少 picks");
  }
  const seen = new Set<number>();
  const result: BriefPick[] = [];
  for (const raw of rawPicks) {
    if (!raw || typeof raw !== "object") continue;
    const v = raw as Record<string, unknown>;
    const index = resolveCandidateIndex(v.index, v.title, candidateTitles, false);
    if (index === null || seen.has(index)) continue;
    seen.add(index);
    const headline = requireString(v, "headline");
    const event = typeof v.event === "string" && v.event.trim() ? v.event.trim().slice(0, 30) : headline;
    // 同一件事（标签相同或互相包含）只留排在前面的那条
    if (result.some((r) => sameEvent(r.event, event))) continue;
    const opportunity = OPPORTUNITY_SOURCES.includes(v.opportunity as OpportunitySource)
      ? (v.opportunity as OpportunitySource)
      : undefined;
    const precedent = typeof v.precedent === "string" && v.precedent.trim() ? v.precedent.trim() : undefined;
    const domain = PESTLE_DOMAINS.includes(v.domain as PestleDomain) ? (v.domain as PestleDomain) : undefined;
    result.push({
      index,
      headline,
      background: requireString(v, "background"),
      forYou: requireString(v, "forYou"),
      event,
      ...(opportunity ? { opportunity } : {}),
      ...(precedent ? { precedent } : {}),
      ...(domain ? { domain } : {}),
    });
  }
  if (result.length === 0 && !allowEmpty) throw new Error("没有一条能对上候选序号");
  const picks = result.slice(0, BRIEF_SIZE);

  // 也值得一看：去重后多出来的精选备选排前面，再接 AI 给的 more；都要和精选、彼此不是同一件事
  const more: BriefMore[] = [];
  const takenIndex = new Set(picks.map((p) => p.index));
  const addMore = (index: number, event: string, headline: string) => {
    if (more.length >= MORE_SIZE || takenIndex.has(index) || !headline) return;
    if ([...picks.map((p) => p.event), ...more.map((m) => m.event)].some((e) => sameEvent(e, event))) return;
    takenIndex.add(index);
    more.push({ index, event, headline });
  };
  for (const r of result.slice(BRIEF_SIZE)) addMore(r.index, r.event, r.headline);
  const rawMore = (value as { more?: unknown }).more;
  for (const m of Array.isArray(rawMore) ? rawMore : []) {
    if (!m || typeof m !== "object") continue;
    const v = m as Record<string, unknown>;
    const index = resolveCandidateIndex(v.index, v.title, candidateTitles, true);
    if (index === null) continue;
    const headline = typeof v.headline === "string" ? v.headline.trim() : "";
    const event = typeof v.event === "string" && v.event.trim() ? v.event.trim() : headline;
    addMore(index, event, headline);
  }
  const practice = parsePractice((value as { practice?: unknown }).practice, picks);
  const texts = [
    overview,
    ...picks.flatMap((p) => [p.headline, p.background, p.forYou, ...(p.precedent ? [p.precedent] : [])]),
    ...more.map((m) => m.headline),
    ...(practice ? [practice.question, practice.checkHow, ...(practice.whyUncertain ? [practice.whyUncertain] : [])] : []),
  ];
  assertNoBanned(texts);
  assertChinese(texts);
  return { overview, picks, more, practice };
}

/** 练习题可有可无（工具报告没有）；有的话必须指向 picks 里的一条，问题和检验方法都要有。 */
function parsePractice(raw: unknown, picks: BriefPick[]): BriefPractice | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const index = typeof v.index === "number" ? v.index : Number(v.index);
  if (!picks.some((p) => p.index === index)) return null;
  const question = typeof v.question === "string" ? v.question.trim() : "";
  const checkHow = typeof v.checkHow === "string" ? v.checkHow.trim() : "";
  if (!question || !checkHow) return null;
  const whyUncertain = typeof v.whyUncertain === "string" && v.whyUncertain.trim() ? v.whyUncertain.trim() : undefined;
  const aiHorizon = PRACTICE_HORIZON_DAYS.some(([k]) => k === v.horizon) ? (v.horizon as PracticeHorizon) : undefined;
  const horizon = practiceHorizon(question, aiHorizon, tokyoDate());
  return { index, question, checkHow, horizon, ...(whyUncertain ? { whyUncertain } : {}) };
}

/**
 * 写报告时故意不给 AI 看任何关于他的信息：看得到它就会每条都往他身上扯。
 * "跟你"由第二步 linkPicksToReader 单独做，并由代码核对。
 */
/**
 * 挑法的几个旋钮（挑法盲测 /signals/lab 用；每天的报告用默认值）。
 * model：换更强的模型；thinkingBudget：先想再挑；textLength：每条候选给 AI 看多少字（读了正文时给多一些）。
 */
export type BriefOptions = { model?: string; thinkingBudget?: number; textLength?: number };

export async function generateSignalBrief(kind: BriefKind, candidates: BriefCandidate[], options: BriefOptions = {}): Promise<Brief> {
  if (candidates.length === 0) return { overview: "", picks: [], more: [], practice: null };
  const thinkingBudget = options.thinkingBudget ?? 0;
  const numbered = candidates
    .map((c, i) => `[${i}] ${c.title}（${c.source}）${c.china ? "（中国）" : ""}\n${c.text.slice(0, options.textLength ?? 160)}`)
    .join("\n");
  const contents = `候选：\n${numbered}`;
  const systemInstruction = `${BRIEF_PROMPTS[kind]}

${SIGNAL_SHARED_RULES}

另外写 overview：开头的一段总述，3 到 5 句，把挑出来的几条串起来讲${OVERVIEW_TOPIC[kind]}。第一句直接说今天最重要的那一件事是什么；每一句都要带一件具体的事（谁、做了什么）。不许用"持续演进""几个重要领域""值得注意的是"这类空开头，也不要逐条复述。

${kind === "news" ? practiceInstruction(tokyoDate()) : ""}
${kind === "news" || kind === "voices" || kind === "money" ? `${OPPORTUNITY_INSTRUCTION}\n${OVERVIEW_LENS}` : ""}
${kind === "tools" ? "" : DOMAIN_INSTRUCTION}
${MORE_INSTRUCTION}
只输出 JSON：{"overview":"…","picks":[{"index":序号,"title":"原标题照抄","event":"…","headline":"…","background":"…","forYou":"…"${kind === "news" || kind === "voices" || kind === "money" ? ',"opportunity":"…","precedent":"…"' : ""}${kind === "tools" ? "" : ',"domain":"…"'}}],"more":[{"index":序号,"title":"原标题照抄","event":"…","headline":"…"}]${kind === "news" ? ',"practice":{"index":序号,"horizon":"3m","question":"…","checkHow":"…","whyUncertain":"…"}' : ""}}`;

  return executeAiJson(
    { operation: `signal_brief_${kind}`, module: "unknown", outputMode: "json", timeoutMs: 50_000 },
    (attempt) => ({
      model: options.model ?? MODEL,
      contents:
        contents +
        (attempt === 1
          ? "\n\n上一次输出没通过校验（序号对不上、缺字段，或出现了迎合、投资建议类的话）。严格按 JSON 字段重写。"
          : ""),
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget },
        // 思考会吃 maxOutputTokens
        maxOutputTokens: 4000 + thinkingBudget,
      },
    }),
    (value) => parseBrief(value, candidates.map((c) => c.title), kind === "calendar")
  );
}

/** 两轮挑法的第一轮：只看标题和简介，粗选出值得读正文再决定的几条。 */
export async function shortlistCandidates(kind: BriefKind, candidates: BriefCandidate[], size: number): Promise<number[]> {
  if (candidates.length <= size) return candidates.map((_, i) => i);
  const numbered = candidates
    .map((c, i) => `[${i}] ${c.title}（${c.source}）${c.china ? "（中国）" : ""}\n${c.text.slice(0, 160)}`)
    .join("\n");
  const titles = candidates.map((c) => c.title);
  return executeAiJson(
    { operation: `signal_shortlist_${kind}`, module: "unknown", outputMode: "json", timeoutMs: 30_000 },
    () => ({
      model: MODEL,
      contents: `候选：\n${numbered}`,
      config: {
        systemInstruction: `${BRIEF_PROMPTS[kind]}

这一步只粗选：挑出最多 ${size} 条值得把正文读完再决定要不要的。标题看着热闹、简介里看不出到底发生了什么的，宁可放进来读一读；
一眼就知道不值得的（重复、八卦、和这一节无关）不要。每条写 index 和 title（照抄原标题前 20 个字，代码拿它核对序号）。

只输出 JSON：{"picks":[{"index":序号,"title":"原标题照抄"}]}`,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 1500,
      },
    }),
    (value) => {
      const raw = (value as { picks?: unknown } | null)?.picks;
      if (!Array.isArray(raw)) throw new Error("缺少 picks");
      const out: number[] = [];
      for (const r of raw) {
        if (!r || typeof r !== "object") continue;
        const v = r as Record<string, unknown>;
        const index = resolveCandidateIndex(v.index, v.title, titles, true);
        if (index !== null && !out.includes(index)) out.push(index);
      }
      if (out.length === 0) throw new Error("一条都没对上");
      return out.slice(0, size);
    }
  );
}

// ── 差距清单：每天专门扫一轮 ─────────────────────────────────────────────────

/** 每天扫出来、拿去问"日本有没有"的最多几条（每条要上网搜两次，Tavily 免费额度有限）。 */
const GAP_SCAN_SIZE = 4;

export type GapPick = { index: number; headline: string; background: string };

const GAP_SCAN_PROMPT = `下面是最近一天中文媒体、美国媒体（Hacker News、TechCrunch）上的消息，和中国 App 榜新上榜的 App。
你帮一个在日本、想找创业方向的人，从里面挑"那边已经有、日本可能还没有"的东西。

只挑讲的是一种具体的产品、服务或生意做法的：有人在卖什么、怎么收钱、怎么把东西送到人手上。
不挑：宏观数据、政治外交、事故、人事变动、股价财报、纯技术讨论、只说拿了多少钱却看不出在做什么的融资新闻。
最多挑 ${GAP_SCAN_SIZE} 条，日本越可能还没有、写得越具体的排越前。没有合适的就给空数组，不要硬凑。

每条写：
- index：候选序号；
- title：照抄那条候选的原标题，原文语言、不翻译，抄前 20 个字就行（代码拿它核对序号，对不上的会被丢掉）；
- headline：一句中文，说清楚这是个什么东西（谁在做、给谁用）；
- background：两三句中文：它怎么运作、怎么收钱、做到了什么程度。只写候选里写了的，没写的不要编。

只输出 JSON：{"picks":[{"index":序号,"title":"原标题照抄","headline":"…","background":"…"}]}`;

/** 序号要和照抄的原标题对得上（对不上按标题换回、都对不上就丢掉）；可以一条都没有。 */
export function parseGapPicks(value: unknown, candidateTitles: string[]): GapPick[] {
  const raw = (value as { picks?: unknown } | null)?.picks;
  if (!Array.isArray(raw)) throw new Error("缺少 picks");
  const out: GapPick[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const v = r as Record<string, unknown>;
    const index = resolveCandidateIndex(v.index, v.title, candidateTitles, true);
    const headline = typeof v.headline === "string" ? v.headline.trim() : "";
    const background = typeof v.background === "string" ? v.background.trim() : "";
    if (index === null || !headline || !background || out.some((o) => o.index === index)) continue;
    out.push({ index, headline, background });
  }
  const picks = out.slice(0, GAP_SCAN_SIZE);
  const texts = picks.flatMap((p) => [p.headline, p.background]);
  assertNoBanned(texts);
  assertChineseAllowingNames(texts);
  return picks;
}

/** 从中文、美国的候选里挑出讲产品、服务、生意做法的几条，写清楚是什么东西。 */
export async function selectGapCandidates(candidates: BriefCandidate[]): Promise<GapPick[]> {
  if (candidates.length === 0) return [];
  const contents = `候选：\n${candidates
    .map((c, i) => `[${i}] ${c.title}（${c.source}）\n${c.text.slice(0, 200)}`)
    .join("\n")}`;
  return executeAiJson(
    { operation: "signal_gap_scan", module: "unknown", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1 ? "\n\n上一次输出没通过校验（序号和标题对不上、缺字段，或没用中文）。严格按 JSON 字段重写。" : ""),
      config: {
        systemInstruction: GAP_SCAN_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 2000,
      },
    }),
    (value) => parseGapPicks(value, candidates.map((c) => c.title))
  );
}

// ── 工具深读 ───────────────────────────────────────────────────────────────

export type ToolAnalysisInput = SignalReader & {
  name: string;
  description: string;
  /** README 的开头；拿不到时为空。 */
  readme: string;
};

export type ToolAnalysis = {
  /** 这是什么、解决什么问题。 */
  what: string;
  /** 大致怎么用：装什么、跑什么、需要什么前提。 */
  howToUse: string;
  /** 适合谁、不适合谁。 */
  whoFor: string;
  /** 他可以拿它试的一件具体的事。 */
  tryThis: string;
};

const TOOL_ANALYSIS_PROMPT = `你帮一个人看 GitHub 上的新工具，让他跟上时代。他的情况见材料最后"关于他"的部分。

给你仓库名、简介和 README 开头。输出四段：
1. what：这是什么、解决什么问题，3 到 4 句，让不写代码的人也能看懂。
2. howToUse：大致怎么用 —— 要装什么、跑什么、需要什么前提（API key、显卡、付费账号）。README 里没写清楚就说没写清楚。
3. whoFor：适合谁、不适合谁，各一句。
4. tryThis：他可以拿它试的一件具体的事，能在一个周末内做完。

${SIGNAL_SHARED_RULES}

只输出 JSON：{"what":"…","howToUse":"…","whoFor":"…","tryThis":"…"}`;

export function parseToolAnalysis(value: unknown): ToolAnalysis {
  if (!value || typeof value !== "object") throw new Error("输出不是对象");
  const v = value as Record<string, unknown>;
  const result: ToolAnalysis = {
    what: requireString(v, "what"),
    howToUse: requireString(v, "howToUse"),
    whoFor: requireString(v, "whoFor"),
    tryThis: requireString(v, "tryThis"),
  };
  assertNoBanned(Object.values(result));
  assertChinese(Object.values(result));
  return result;
}

export async function analyzeToolItem(input: ToolAnalysisInput): Promise<ToolAnalysis> {
  const contents = [
    `仓库：${input.name}`,
    `简介：${input.description}`,
    `README 开头：${input.readme || "（拿不到 README）"}`,
    "",
    aboutUser(input),
  ].join("\n");

  return executeAiJson(
    { operation: "tool_analysis", module: "unknown", outputMode: "json", timeoutMs: 45_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1
          ? "\n\n上一次输出没通过校验（缺字段，或出现了迎合、空话）。严格按 JSON 字段重写。"
          : ""),
      config: {
        systemInstruction: TOOL_ANALYSIS_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 2000,
      },
    }),
    parseToolAnalysis
  );
}

// ── 判断练习：挑刺 ─────────────────────────────────────────────────────────

export type JudgmentInput = {
  newsTitle: string;
  newsSummary: string;
  /** 文章正文节选；拿不到时为空。 */
  body: string;
  question: string;
  judgment: string;
  /** 用户选的检验期限，比如"三个月后"。 */
  horizon: string;
};

export type JudgmentFeedback = {
  /** 他没想到、但会影响结果的因素。 */
  missed: string;
  /** 这句判断怎么改，才能到期时明确说出对或错。 */
  sharpen: string;
  /** 最可能让他看错的理由。 */
  counter: string;
};

const JUDGMENT_PROMPT = `一个人在练"读新闻、下判断、事后对账"。他刚读了一条新闻，回答了一个问题，写下自己的判断。
你是带他练习的老同事。你的工作不是评价他对不对（现在没人知道），而是让这句判断变得更值得押注。

输出三段：
1. missed：他没提到、但会实质影响结果的一两个因素。具体到"谁会做什么"，不要泛泛说"还要考虑宏观环境"。
2. sharpen：这句判断如果到期时没法明确说对或错，就指出模糊在哪，并给一个改写后的版本（带具体的对象、方向、时间）。已经很具体就说"已经可以检验"，再补一个让它更锋利的细节。
3. counter：最可能让他看错的那个理由，一到两句。要站在反方最强的位置说。

不评价他聪明不聪明，不说"判断得很好""思路清晰"，也不打分。
${SIGNAL_SHARED_RULES}

只输出 JSON：{"missed":"…","sharpen":"…","counter":"…"}`;

export function parseJudgmentFeedback(value: unknown): JudgmentFeedback {
  if (!value || typeof value !== "object") throw new Error("输出不是对象");
  const v = value as Record<string, unknown>;
  const result: JudgmentFeedback = {
    missed: requireString(v, "missed"),
    sharpen: requireString(v, "sharpen"),
    counter: requireString(v, "counter"),
  };
  const texts = Object.values(result);
  assertNoBanned(texts);
  assertChinese(texts);
  const praise = ["判断得很好", "思路清晰", "很有见地", "非常准确"].find((w) => texts.join("").includes(w));
  if (praise) throw new Error(`出现了夸奖：${praise}`);
  return result;
}

export async function critiqueJudgment(input: JudgmentInput): Promise<JudgmentFeedback> {
  const contents = [
    `新闻标题：${input.newsTitle}`,
    `新闻简介：${input.newsSummary || "（没有）"}`,
    `正文节选：${input.body ? input.body.slice(0, 2000) : "（拿不到正文）"}`,
    "",
    `他回答的问题：${input.question}`,
    `他的判断：${input.judgment}`,
    `检验期限：${input.horizon}`,
  ].join("\n");

  return executeAiJson(
    { operation: "judgment_critique", module: "unknown", outputMode: "json", timeoutMs: 45_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1
          ? "\n\n上一次输出没通过校验（缺字段、出现了夸奖或空话、或没用中文）。严格按 JSON 字段重写。"
          : ""),
      config: {
        systemInstruction: JUDGMENT_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 1500,
      },
    }),
    parseJudgmentFeedback
  );
}

// ── 历史上类似的事 ─────────────────────────────────────────────────────────

export type HistoricalAnalog = {
  /**
   * modern：近现代（大约 1900 年以后），条件可比，能当"这类事通常怎样"的参照。
   * ancient：古代，只看人和制度怎么反应，是启发不是基准。
   * 早期缓存的数据没有这个字段，按 modern 处理。
   */
  era?: "modern" | "ancient";
  /** 年份或时期，比如"2006 年 7 月"。记不清就写大概。 */
  when: string;
  /** 当时发生了什么。 */
  what: string;
  /** 之后实际怎样了。 */
  after: string;
  /** 这次和那次像在哪（《Thinking in Time》：每个类比都要分开列像和不像）。早期缓存没有。 */
  alike?: string;
  /** 这次和那次不像在哪 —— 错误的类比几乎都错在这里。早期缓存没有。 */
  unlike?: string;
  /** 用来上网核实这一次的搜索词（具体到时间和对象）。 */
  query?: string;
  /** 换一种语言的搜索词：一种语言搜不到能逐字核对的原文时，另一种常能搜到。 */
  altQuery?: string;
  /** user：他自己想到的类比（问题驱动），AI 只负责展开和核实，不进基准率。 */
  source?: "user";
  /** 上网核实的结果；早期缓存的数据没有。 */
  check?: AnalogCheck;
};

export type AnalogCheckStatus = "supported" | "corrected" | "unverified";

export type AnalogCheck = {
  /** supported：查到出处；corrected：查到了，但和 AI 记的不一样，已按原文改；unverified：没查到出处。 */
  status: AnalogCheckStatus;
  /** corrected 时：AI 记成了什么、原文是什么。 */
  correction?: string;
  /** 代码核对过、确实在网页里的原文。 */
  basis: { url: string; title: string; excerpt: string }[];
};

export type BookPick = {
  /** 页面上显示的书名（有中文版写中文名）。 */
  title: string;
  /** 原书名，用来去书目库核实。 */
  originalTitle: string;
  author: string;
  /** 为什么读这本能帮他看懂这类事。 */
  why: string;
};

export type SignalHistory = {
  /** 这类事通常会怎样（从历史上的几次里归纳）。 */
  baseRate: string;
  analogs: HistoricalAnalog[];
  /** 这次和过去有什么不同。 */
  different: string;
  books: BookPick[];
};

const HISTORY_PROMPT = `你帮一个人练"读新闻、下判断"。预测做得好的人，都是先看"这类事过去通常怎样"，再看"这次有什么不同"。
给你一条新闻，你负责第一步：找历史上的参照。

输出：
1. analogs：历史上 1 到 4 次相似的事。到这几个地方去找：日本、中国（近现代和古代）、欧美及其他国家。
   - 近现代（大约 1900 年以后）的事：era 写 "modern"，这是主要参照，至少给 1 次。
     中国近现代可以想想：改革开放与价格双轨制、90 年代国企改革与下岗潮、2015 年股灾、房地产调控等。
   - 古代的事：era 写 "ancient"，最多 1 次，只在真的能说明"人和制度会怎么反应"时才给。
     比如王安石变法（好政策在执行中走样）、宋代交子滥发、明代白银流入与断流。
   每一次都必须是**一件具体的事**，不是一类现象：
   - 有一个具名的主体（哪家公司、哪项政策、哪个产品）；
   - 有一个具体的年份（近现代的事不许写"2010 年代""2000 年代初期"这种十年一档的说法，也不许写跨度超过 3 年的区间）；
   - 有一个看得见的结果（用户数、价格、倒闭、撤退、法案通过）。
   好的例子："2018 年 PayPay 上线，靠 100 亿日元返现，两年内注册用户破 3000 万。"
   不好的例子："2010 年代中国移动支付快速普及，周边国家开始模仿。"（没有主体、没有具体年份，搜不到能核对的原文）
   每次写：
   - era："modern" 或 "ancient"。
   - when：具体年份或年月，比如"2018 年 10 月"。
   - what：当时发生了什么，一到两句，点出主体的名字。
   - after：之后几个月到几年里实际怎样了，一到两句。这是最重要的部分。
   - alike：这次和那次像在哪，一句话，要具体（同样是谁、在什么处境下、做了什么）。
   - unlike：这次和那次不像在哪，一句话 —— 挑最可能让结果不一样的那个差别。
     错误的类比几乎都错在"不像"的地方，这一句不许空着，也不许写"时代不同"这种空话。
     alike 和 unlike 都直接写那一点，不要用"这次和那次像在""不像在"开头（页面上已经有"像的地方""不像的地方"的标题）。
   - query：用来上网核实这一次的搜索词，具体到时间和对象，不要写成一句话。
     日本的事用日文（如 "日銀 2006年7月 ゼロ金利解除 その後"），中国的事用中文，其他用英文。
   - altQuery：同一件事换一种语言的搜索词：日本和中国的事用英文，欧美的事用日文。
2. baseRate：只用近现代（modern）的那几次归纳"这类事通常会怎样"，两到三句。古代的事不能拿来当基准。几次结果不一样就直说不一样，以及取决于什么。
3. different：这次和过去比，有什么明显不同，可能让结果不一样，一到两句。
4. books：0 到 2 本能帮他看懂这类事的书。
   - 只推荐非虚构类：经济、金融、历史、商业、社会学。绝不推荐小说，哪怕题材沾边。
   - 必须直接讲这类事（比如讲央行和利率、讲日本泡沫和通缩、讲人口与劳动力、讲中国的改革与经济史），不推荐泛泛的"思维方法"书。
   - 只推荐你确定真实存在、比较有名的书；没有合适的就给空数组，不要凑。
   每本写 title（有中文版就写中文名）、originalTitle（原书名，用原文：英文书写英文、日文书写日文、中文书写中文）、
   author（作者名同样用原文，不要音译：写 "Charles Goodhart" 不写"查尔斯·古德哈特"）、why（为什么读它能看懂这类事，一句话）。

铁律：
- 只写你有把握的历史事实。年份记不准就写"大约 XXXX 年前后"，细节记不清就少写，绝不编数字。
- 找不到真正相似的事，就只给 1 个最接近的，并在 baseRate 里说明参照性有限。
${SIGNAL_SHARED_RULES}

只输出 JSON：{"analogs":[{"era":"modern","when":"…","what":"…","after":"…","alike":"…","unlike":"…","query":"…","altQuery":"…"}],"baseRate":"…","different":"…","books":[{"title":"…","originalTitle":"…","author":"…","why":"…"}]}`;

/** 去掉"这次和中国当时的情况像在，"这类套话开头（页面上已经有"像的地方"标题）。空的返回 undefined。 */
export function trimAnalogLead(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const text = raw.trim().replace(/^这次和[^，,：:]{0,20}?(不像|像)(的地方)?(在|是)?[，,：:]\s*/, "");
  return text || undefined;
}

/** 主语含糊（"一些视频网站""不少企业"）的参照说的是一类现象，搜不到能核对的原文。 */
const VAGUE_SUBJECT = /一些|某些|不少|许多|各种|若干/;

/** 近现代参照的时间最多跨几年。 */
const MAX_ANALOG_SPAN_YEARS = 3;

/**
 * 一个时间写法跨了几年："2018 年 10 月" → 0，"2015–2018 年" → 3，"2010 年代" → 10，没有四位年份 → 无穷大。
 */
export function whenSpan(when: string): number {
  if (/\d{4}\s*年代|\d0s\b/.test(when)) return 10;
  const years = Array.from(when.matchAll(/(1[0-9]|20)\d{2}/g)).map((m) => Number(m[0]));
  if (years.length === 0) return Infinity;
  return Math.max(...years) - Math.min(...years);
}

export function parseSignalHistory(value: unknown): SignalHistory {
  if (!value || typeof value !== "object") throw new Error("输出不是对象");
  const v = value as Record<string, unknown>;
  const rawAnalogs = Array.isArray(v.analogs) ? v.analogs : [];
  const analogs: HistoricalAnalog[] = rawAnalogs
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .map((a) => ({
      era: a.era === "ancient" ? ("ancient" as const) : ("modern" as const),
      when: requireString(a, "when"),
      what: requireString(a, "what"),
      after: requireString(a, "after"),
      alike: trimAnalogLead(a.alike),
      unlike: trimAnalogLead(a.unlike),
      query: typeof a.query === "string" && a.query.trim() ? a.query.trim().slice(0, 120) : undefined,
      altQuery: typeof a.altQuery === "string" && a.altQuery.trim() ? a.altQuery.trim().slice(0, 120) : undefined,
    }))
    // 近现代的必须是具体某一年的一件事："2010 年代""2015–2018 年"这种一整类现象搜不到能核对的原文，丢掉
    .filter((a) => a.era === "ancient" || (whenSpan(a.when) <= MAX_ANALOG_SPAN_YEARS && !VAGUE_SUBJECT.test(a.what)))
    // 古代的最多留一条，排在最后
    .filter((a, i, all) => a.era === "modern" || all.findIndex((x) => x.era === "ancient") === i)
    .sort((a, b) => (a.era === b.era ? 0 : a.era === "modern" ? -1 : 1))
    .slice(0, 4);
  if (!analogs.some((a) => a.era === "modern")) throw new Error("缺少近现代的参照");
  const books: BookPick[] = (Array.isArray(v.books) ? v.books : [])
    .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
    .flatMap((b) => {
      try {
        return [{
          title: requireString(b, "title"),
          originalTitle: requireString(b, "originalTitle"),
          author: requireString(b, "author"),
          why: requireString(b, "why"),
        }];
      } catch {
        return []; // 缺字段的书直接丢，不让整份作废
      }
    })
    .slice(0, 2);
  const result: SignalHistory = {
    baseRate: requireString(v, "baseRate"),
    analogs,
    different: requireString(v, "different"),
    books,
  };
  // 书名、作者名常是外文，只检查叙述部分有没有用中文
  const prose = [
    result.baseRate,
    result.different,
    ...analogs.flatMap((a) => [a.what, a.after, a.alike ?? "", a.unlike ?? ""]).filter(Boolean),
    ...books.map((b) => b.why),
  ];
  assertNoBanned(prose);
  assertChinese(prose);
  return result;
}

export async function findHistoricalAnalogs(input: {
  title: string;
  summary: string;
  body: string;
  /** question：不是一条新闻，是他要一直追的一个问题（问题驱动），title 是问题，summary 是"怎么才算"和他的看法。 */
  subject?: "news" | "question";
}): Promise<SignalHistory> {
  const contents =
    input.subject === "question"
      ? [
          `这次不是一条新闻，是他要一直追的一个问题。做法一样：找历史上相似的事、归纳这类事通常怎样。`,
          `问题：${input.title}`,
          input.summary ? `补充：${input.summary}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : [
          `新闻标题：${input.title}`,
          `新闻简介：${input.summary || "（没有）"}`,
          `正文节选：${input.body ? input.body.slice(0, 2000) : "（拿不到正文）"}`,
        ].join("\n");

  return executeAiJson(
    { operation: "signal_history", module: "unknown", outputMode: "json", timeoutMs: 45_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1
          ? "\n\n上一次输出没通过校验（缺字段、没用中文、或出现了空话）。严格按 JSON 字段重写。"
          : ""),
      config: {
        systemInstruction: HISTORY_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 2500,
      },
    }),
    parseSignalHistory
  );
}

// ── 从自述里抽处境事实 ─────────────────────────────────────────────────────

export type SituationFact = {
  /** 改写成第三人称的一句事实，比如"在一家电商公司做广告数据分析"。 */
  fact: string;
  /** 原文里的出处（逐字摘抄）。代码会核对它真的在原文里。 */
  quote: string;
};

const FACTS_PROMPT = `下面是一个人在不同时间写下的自述。从里面只抽"处境事实"，给读新闻的 AI 当背景用。

处境事实是：他在做什么工作、在什么行业或公司类型、什么职位或阶段、住在哪个国家或城市、在学什么、手上在做什么项目、有什么时间或经济上的约束。
不是处境事实、一律不抽：性格（"我很内向"）、能力评价（"我不擅长沟通"）、动机和价值观（"我想证明自己"）、情绪、对自己的任何评价。
拿不准是事实还是评价的，不抽。

每条写：
- fact：改写成一句客观的话，不带评价。关键名词照原文用，不要换成意思相近的词。
- quote：原文里对应的那一段，必须逐字照抄，不能改一个字。

同一句原话只抽一条，不要把一句话拆成几条。最多 8 条。没有处境事实就给空数组。
只输出 JSON：{"facts":[{"fact":"…","quote":"…"}]}`;

/** 出处必须逐字出现在原文里（忽略空白差异），对不上的丢掉。 */
export function parseSituationFacts(value: unknown, sources: string[]): SituationFact[] {
  if (!value || typeof value !== "object") throw new Error("输出不是对象");
  const raw = (value as { facts?: unknown }).facts;
  if (!Array.isArray(raw)) throw new Error("缺少 facts");
  const squash = (t: string) => t.replace(/\s+/g, "");
  const haystack = sources.map(squash);
  return raw
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({
      fact: typeof f.fact === "string" ? f.fact.trim() : "",
      quote: typeof f.quote === "string" ? f.quote.trim() : "",
    }))
    .filter((f) => f.fact && f.quote.length >= 4 && haystack.some((h) => h.includes(squash(f.quote))))
    .slice(0, 8);
}

export async function extractSituationFacts(declarations: string[]): Promise<SituationFact[]> {
  if (declarations.length === 0) return [];
  const contents = declarations.map((d, i) => `[${i + 1}] ${d}`).join("\n\n");
  return executeAiJson(
    { operation: "situation_facts", module: "unknown", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents: contents + (attempt === 1 ? "\n\n上一次输出格式不对。严格按 JSON 字段重写。" : ""),
      config: {
        systemInstruction: FACTS_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 1500,
      },
    }),
    (value) => parseSituationFacts(value, declarations)
  );
}

// ── 报告的第二步："跟你" ───────────────────────────────────────────────────

/** edge：他的处境让他在这件事上比一般人更有优势（会中文、在日本、做电商广告…，必须是处境事实里写着的）。 */
export type PersonalLink = { index: number; personal: string; edge?: boolean; link?: string };

const LINK_PROMPT = `下面是今天报告里的几条，和"关于他"的记录。找出真的跟他连得上的，最多 ${MAX_PERSONAL} 条。

连得上的意思是：这条新闻能直接改变他手上某件事的做法或结论 —— 同一个行业、同一类问题、或者他记过的观察里直接提到过。
"都跟 AI 有关""都是商业新闻"不算连得上；要写"可能会影响""可能有关""未来可能出现机会"才连得上的，也不算。
连不上的就不写，一条都没有就给空数组。宁缺毋滥：大多数日子应该是零条或一条。

每条写：
- index：报告里那一条的序号。
- personal：跟他有什么关系，一到两句，具体到他记录里的那件事。
- link：逐字照抄"关于他"里你据以联系的那一条（或其中一段）。

另写 edge：如果他记录里写着的处境（会的语言、所在的国家、做的行业和工作）让他在这件事上比一般人更有优势
——更容易看懂、更容易做、或者别人很难做——就写 true，并在 personal 里说清是哪一点优势；只是"跟他有关"就写 false。
优势必须是记录里写着的，不许自己推测他会什么。edge 为 true 的排在前面。

不要用"作为未来的社长"这种套话。
不要曲解他记录里的词：照原话的意思说，不要自己换成近似但意思不同的词（比如把"AI 推荐率监测"说成"AI 推荐系统"）。
${SIGNAL_SHARED_RULES}

只输出 JSON：{"links":[{"index":序号,"personal":"…","link":"…","edge":false}]}`;

/** "跟你"那一句如果靠这些说法才连得上，就是硬凑（2026-10 实测：倒闭潮→"可能影响你分析的新客比例"）。 */
const HEDGED_LINK = /可能会?(影响|有关|关注|出现|遇到|带来)|或许|也许|未来如果|如果当地/;

/** link 必须真在"关于他"里（忽略空白），序号必须是报告里的一条；最多留 MAX_PERSONAL 条。 */
export function parsePersonalLinks(value: unknown, indices: number[], readerItems: string[]): PersonalLink[] {
  if (!value || typeof value !== "object") throw new Error("输出不是对象");
  const raw = (value as { links?: unknown }).links;
  if (!Array.isArray(raw)) throw new Error("缺少 links");
  const squash = (t: string) => t.replace(/\s+/g, "");
  const grounded = (link: string) =>
    squash(link).length >= 2 &&
    readerItems.some((item) => squash(item).includes(squash(link)) || squash(link).includes(squash(item)));
  const seen = new Set<number>();
  const result: PersonalLink[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const v = r as Record<string, unknown>;
    const index = typeof v.index === "number" ? v.index : Number(v.index);
    const personal = typeof v.personal === "string" ? v.personal.trim() : "";
    const link = typeof v.link === "string" ? v.link.trim() : "";
    // 理由里全是"可能会影响""可能有关"的，是硬凑出来的
    if (!indices.includes(index) || seen.has(index) || !personal || !grounded(link) || HEDGED_LINK.test(personal)) continue;
    seen.add(index);
    result.push({ index, personal, link, ...(v.edge === true ? { edge: true } : {}) });
    if (result.length >= MAX_PERSONAL) break;
  }
  assertNoBanned(result.map((r) => r.personal));
  assertChinese(result.map((r) => r.personal));
  return result;
}

// ── 日本这边有没有（中文媒体的精选） ─────────────────────────────────────────

export type JapanInput = { index: number; headline: string; background: string };
export type JapanComparison = {
  index: number;
  japan: string;
  /** 用日语写的搜索词，拿去查"日本有没有这种东西"。 */
  query: string;
  /** 红杉的"为什么是现在"：日本这边还没有时，最近什么变了让它可能做成，或者还缺什么。 */
  whyNow?: string;
  /** 资料里查到日本已经有公司为这件事拉到了投资（原文由代码核对）。"日本没有"难证明，"有人刚拿到钱在做"好查。 */
  funded?: { company: string; url: string; excerpt: string };
  /** 上网核实的结果（跟历史参照同一种结构）；还没核实时没有。 */
  check?: AnalogCheck;
};

const JAPAN_PROMPT = `下面几条是中国正在发生的事。中国已经跑通、日本还没有的做法，往往几年后会来日本。
每一条回答一个问题：日本现在有没有同样的东西？

japan 的写法：
- 第一句先给结论，只能用这四种开头之一："有，""有类似的，但没普及""没有""拿不准"。
- 再用一两句说：有的话是什么样的（可以说一类服务，拿不准就别点名公司）；没有或没普及的话，可能卡在哪（法规、支付习惯、物流、人口结构、商业习惯）。
- 如果这条讲的是政府发文、监管规定，就比的是"日本有没有同样的规定"。
- 不许写"日本企业需要关注""值得借鉴""值得注意"这类空话；不要编日本公司或服务的名字。用中文写。

结论是"没有"或"有类似的，但没普及"时，再写 whyNow（红杉看创业项目必问的"为什么是现在"）：
如果现在有人在日本做这件事，最近哪些变化让它变得可能（法规、价格、人口、技术、习惯）；还不行的话，还缺什么。一到两句。
结论是"有，"或"拿不准"时 whyNow 留空字符串。

再写 query：用日语写的搜索词，3 到 6 个词，用来上网查"日本有没有这种东西"。
写成日本这边的说法，不要直译中国的产品名（例：微信的 AI 助手 → "LINE AI アシスタント 機能"；即时零售 → "即配 ネットスーパー 30分"）。

只输出 JSON：{"items":[{"index":序号,"japan":"…","whyNow":"…","query":"…"}]}`;

/** 反方向：日本做成、中国还没有的东西 —— 适合跨境电商，或者把日本的做法带去中国。 */
const CHINA_PROMPT = `下面几条是日本正在发生的事。日本已经做成、中国还没有的东西，可能适合跨境电商卖给中国人，或者把这种做法带去中国。
只回答讲的是一种产品、服务或商业做法的那几条；政治、外交、宏观数据、事故、人事、法规类的跳过，不写进 items。
每一条回答一个问题：中国现在有没有同样的东西？

japan 字段（沿用这个名字）的写法：
- 第一句先给结论，只能用这四种开头之一："有，""有类似的，但没普及""没有""拿不准"。
- 再用一两句说：有的话是什么样的（可以说一类服务，拿不准就别点名公司）；没有或没普及的话，可能卡在哪（法规、消费习惯、价格、渠道、信任）。
- 不许写"值得借鉴""值得注意"这类空话；不要编中国公司或服务的名字。用中文写。

结论是"没有"或"有类似的，但没普及"时，再写 whyNow：如果现在把它带去中国（或者通过跨境电商卖给中国人），
最近哪些变化让它变得可能；还不行的话，还缺什么。一到两句。其余情况 whyNow 留空字符串。

再写 query：用中文写的搜索词，3 到 6 个词，用来上网查"中国有没有这种东西"（写成中国这边的说法，不要直译日文名）。

只输出 JSON：{"items":[{"index":序号,"japan":"…","whyNow":"…","query":"…"}]}`;

/**
 * 美国的条目（Hacker News、TechCrunch）也问"日本有没有"：美国先出现、日本还没有的做法，同样常常几年后才来。
 * 和中国那一版同一套写法，只把出发地换掉、例子换成美国的。
 */
const US_PROMPT = JAPAN_PROMPT.replace(
  "下面几条是中国正在发生的事。中国已经跑通、日本还没有的做法，往往几年后会来日本。",
  "下面几条是美国正在发生的事。美国先出现、日本还没有的做法、产品、商业模式，往往几年后会来日本。\n只回答讲的是一种产品、服务或商业做法的那几条；纯技术讨论、政治、事故、人事类的跳过，不写进 items。"
).replace(
  "不要直译中国的产品名（例：微信的 AI 助手 → \"LINE AI アシスタント 機能\"；即时零售 → \"即配 ネットスーパー 30分\"）",
  "不要直译美国的产品名（例：DoorDash 的店铺代送 → \"フードデリバリー 小売 代行\"；按用量收费的 SaaS → \"従量課金 SaaS 日本\"）"
);

/** 比较的方向：问"日本有没有"（中国的条目 japan、美国的条目 us），还是问"中国有没有"（日本的条目）。 */
export type CompareSide = "japan" | "china" | "us";

const JAPAN_OPENERS = ["有，", "有类似的", "没有", "拿不准"];
const JAPAN_FILLER = /需要关注|值得借鉴|值得注意|值得关注/;

/** 只留开头给了结论、没有空话、序号对得上的；一条都不合格就返回空（页面上就不显示这一行）。 */
export function parseJapanComparisons(value: unknown, inputs: JapanInput[]): JapanComparison[] {
  const items = (value as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) throw new Error("缺少 items");
  const wanted = new Set(inputs.map((i) => i.index));
  const out: JapanComparison[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const v = raw as Record<string, unknown>;
    const index = typeof v.index === "number" ? v.index : Number(v.index);
    const japan = typeof v.japan === "string" ? v.japan.trim() : "";
    if (!wanted.has(index) || out.some((o) => o.index === index)) continue;
    if (!JAPAN_OPENERS.some((o) => japan.startsWith(o)) || JAPAN_FILLER.test(japan)) continue;
    const query = typeof v.query === "string" ? v.query.trim().slice(0, 80) : "";
    const whyNow = typeof v.whyNow === "string" && v.whyNow.trim() ? v.whyNow.trim() : undefined;
    out.push({ index, japan, query, ...(whyNow ? { whyNow } : {}) });
  }
  assertNoBanned(out.flatMap((o) => [o.japan, o.whyNow ?? ""]).filter(Boolean));
  assertChineseAllowingNames(out.flatMap((o) => [o.japan, o.whyNow ?? ""]).filter(Boolean));
  return out;
}

// 先搜再写：以前是先凭印象写"日本有没有"，再拿它自己想的搜索词去核实 —— 核实只能纠错：
// 日本有一个它不知道的服务，它会先写"没有"，资料里没提到也只是标"没查到"，永远发现不了。
// 现在先只写搜索词，上网找完，看着资料再下结论；核实那一步照旧。

const QUERY_PROMPTS: Record<CompareSide, string> = {
  japan: `下面几条是中国正在发生的事。每条写一个日语搜索词，3 到 6 个词，用来上网查"日本现在有没有同样的东西"。
写成日本这边的说法，不要直译中国的产品名（例：微信的 AI 助手 → "LINE AI アシスタント 機能"；即时零售 → "即配 ネットスーパー 30分"）。`,
  us: `下面几条是美国正在发生的事。只给讲的是一种产品、服务或商业做法的那几条写，纯技术讨论、政治、事故、人事类的跳过。
每条写一个日语搜索词，3 到 6 个词，用来上网查"日本现在有没有同样的东西"。
写成日本这边的说法，不要直译美国的产品名（例：DoorDash 的店铺代送 → "フードデリバリー 小売 代行"；按用量收费的 SaaS → "従量課金 SaaS 日本"）。`,
  china: `下面几条是日本正在发生的事。只给讲的是一种产品、服务或商业做法的那几条写，政治、外交、宏观数据、事故、人事、法规类的跳过。
每条写一个中文搜索词，3 到 6 个词，用来上网查"中国现在有没有同样的东西"。写成中国这边的说法，不要直译日文名。`,
};

export type JapanQuery = { index: number; query: string };

export function parseJapanQueries(value: unknown, inputs: JapanInput[]): JapanQuery[] {
  const items = (value as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) throw new Error("缺少 items");
  const wanted = new Set(inputs.map((i) => i.index));
  const out: JapanQuery[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const v = raw as Record<string, unknown>;
    const index = typeof v.index === "number" ? v.index : Number(v.index);
    const query = typeof v.query === "string" ? v.query.trim().slice(0, 80) : "";
    if (!wanted.has(index) || !query || out.some((o) => o.index === index)) continue;
    out.push({ index, query });
  }
  return out;
}

/** 只写搜索词，不下结论（结论看完资料再写）。 */
export async function planJapanQueries(inputs: JapanInput[], side: CompareSide = "japan"): Promise<JapanQuery[]> {
  if (inputs.length === 0) return [];
  const contents = inputs.map((i) => `[${i.index}] ${i.headline}\n${i.background}`).join("\n\n");
  return executeAiJson(
    { operation: `brief_${side}_query`, module: "unknown", outputMode: "json", timeoutMs: 20_000 },
    () => ({
      model: MODEL,
      contents,
      config: {
        systemInstruction: `${QUERY_PROMPTS[side]}\n\n只输出 JSON：{"items":[{"index":序号,"query":"…"}]}`,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 800,
      },
    }),
    (value) => parseJapanQueries(value, inputs)
  );
}

/** 有资料时加在比较的提示后面：先看资料再下结论。 */
function withSourcesRule(side: CompareSide): string {
  const place = side === "china" ? "中国" : "日本";
  return `

每条下面附了先上网搜到的资料（用${place}这边的说法搜的）。先看资料，再下结论：
- 资料里有${place}的同类服务或做法，就照实写"有，"或"有类似的，但没普及"，可以点名资料里出现的服务和公司（只点名资料里有的）。
- 资料里没提到，不等于${place}没有 —— 资料和这件事对不上时，照你知道的写，但不点名。`;
}

/**
 * 给每条写一句"日本这边"（反方向是"中国那边"）。
 * sources 是先搜到的资料（按序号）；没有资料时就是 AI 的印象，页面上要标出来。
 */
export async function compareWithJapan(
  inputs: JapanInput[],
  side: CompareSide = "japan",
  sources?: Map<number, SearchSource[]>
): Promise<JapanComparison[]> {
  if (inputs.length === 0) return [];
  const hasSources = !!sources && Array.from(sources.values()).some((s) => s.length > 0);
  const contents = inputs
    .map((i) => {
      const found = sources?.get(i.index) ?? [];
      const block = found.map((src, j) => `  [资料 ${j + 1}] ${src.title}\n  ${src.content.slice(0, 600)}`).join("\n");
      return `[${i.index}] ${i.headline}\n${i.background}${hasSources ? `\n搜到的资料：\n${block || "  （没搜到）"}` : ""}`;
    })
    .join("\n\n");
  return executeAiJson(
    { operation: `brief_${side}`, module: "unknown", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1 ? "\n\n上一次输出没通过校验：每条 japan 第一句必须以规定的四种开头之一起头，不许写空话。" : ""),
      config: {
        systemInstruction:
          (side === "japan" ? JAPAN_PROMPT : side === "us" ? US_PROMPT : CHINA_PROMPT) + (hasSources ? withSourcesRule(side) : ""),
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 1500,
      },
    }),
    (value) => parseJapanComparisons(value, inputs)
  );
}

const JAPAN_CHECK_PROMPT = `你在核实几句"日本这边有没有"的说法。每句下面附了上网搜到的资料。

每句输出：
- i：编号。
- status：
  "supported"：资料能支撑这句说法（说"有"，资料里确实有日本的同类服务；说"没普及""没有"，资料里能看出日本确实只有不同的东西或还很少见）。
  "corrected"：资料和说法**相互矛盾**才用（说"没有"，资料里明明有日本的同类服务；说"有"，资料显示其实已经退出或根本不是一回事）。
  "unverified"：资料和这件事对不上，或者说不清。注意：资料里没提到，不等于日本没有 —— 这种情况用 unverified，不要当成"没有"的证据。
- japan：supported、unverified 时照抄原来的；corrected 时写改正后的，第一句仍然以"有，""有类似的，但没普及""没有""拿不准"之一开头，可以点名资料里出现的日本服务。
- correction：只有 corrected 时写，一句话点出矛盾："原来说 X，资料里是 Y"。
- basis：支撑或改正它的资料原文，逐字照抄（不翻译、不改字，每句 15 到 150 字），附资料编号 source。unverified 时给空数组。
- funded：资料里如果写着日本有公司正在为这件事（或非常接近的事）拉投资、完成融资，写公司名 company、
  逐字照抄写着融资的那句原文 excerpt（要出现"資金調達""出資""融资"这类字眼）和资料编号 source；没有就给 null。

一律用简体中文写（basis 照抄原文，不用翻译）。不要编资料里没有的事实。

只输出 JSON：{"items":[{"i":0,"status":"supported","japan":"…","correction":"","basis":[{"source":1,"excerpt":"…"}],"funded":null}]}`;

export type JapanSources = { comparison: JapanComparison; sources: SearchSource[] };

/** 融资的原文必须逐字在那篇资料里、而且真的写着融资，公司名不能空；对不上就当没有。 */
export function parseFunded(raw: unknown, sources: SearchSource[]): JapanComparison["funded"] {
  if (!raw || typeof raw !== "object") return undefined;
  const v = raw as Record<string, unknown>;
  const src = sources[(typeof v.source === "number" ? v.source : Number(v.source)) - 1];
  const company = typeof v.company === "string" ? v.company.trim() : "";
  const excerpt = typeof v.excerpt === "string" ? v.excerpt.trim() : "";
  const squash = (t: string) => t.replace(/\s+/g, "");
  if (!src || !company || squash(excerpt).length < 8) return undefined;
  if (!squash(src.content).includes(squash(excerpt))) return undefined;
  if (!/資金調達|調達|出資|融资|投資|ラウンド|funding|raised/i.test(excerpt)) return undefined;
  return { company: company.slice(0, 60), url: src.url, excerpt: excerpt.slice(0, 200) };
}

/**
 * 原文必须逐字出现在这一句自己的那几篇资料里，否则不算。
 * 说"查到了"或"改正了"却拿不出一句对得上的原文，降成 unverified，内容退回原来写的。
 */
export function parseJapanChecks(value: unknown, inputs: JapanSources[]): JapanComparison[] {
  if (!value || typeof value !== "object") throw new Error("输出不是对象");
  const raw = (value as { items?: unknown }).items;
  if (!Array.isArray(raw)) throw new Error("缺少 items");
  const squash = (t: string) => t.replace(/\s+/g, "");
  const byI = new Map<number, Record<string, unknown>>();
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const it = r as Record<string, unknown>;
    const i = typeof it.i === "number" ? it.i : Number(it.i);
    if (Number.isInteger(i) && !byI.has(i)) byI.set(i, it);
  }
  const out = inputs.map(({ comparison, sources }, i): JapanComparison => {
    const it = byI.get(i);
    const status = it?.status;
    const basis = (Array.isArray(it?.basis) ? (it?.basis as unknown[]) : [])
      .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
      .map((b) => {
        const src = sources[(typeof b.source === "number" ? b.source : Number(b.source)) - 1];
        const excerpt = typeof b.excerpt === "string" ? b.excerpt.trim() : "";
        if (!src || squash(excerpt).length < 8 || !squash(src.content).includes(squash(excerpt))) return null;
        return { url: src.url, title: src.title, excerpt: excerpt.slice(0, 300) };
      })
      .filter((b): b is { url: string; title: string; excerpt: string } => b !== null)
      .slice(0, 3);
    const funded = parseFunded(it?.funded, sources);
    const withFunding = (c: JapanComparison): JapanComparison => (funded ? { ...c, funded } : c);
    const unverified: JapanComparison = withFunding({ ...comparison, check: { status: "unverified", basis: [] } });
    if (!it || basis.length === 0 || (status !== "supported" && status !== "corrected")) return unverified;
    if (status === "corrected") {
      const correction = typeof it.correction === "string" ? it.correction.trim() : "";
      const japan = typeof it.japan === "string" ? it.japan.trim() : "";
      const valid = JAPAN_OPENERS.some((o) => japan.startsWith(o)) && !JAPAN_FILLER.test(japan);
      // 说改正了，却没改、没说哪里不一样、或改出来的不合格 —— 当成"查到出处"
      if (correction && valid && japan !== comparison.japan) {
        return withFunding({ ...comparison, japan, check: { status: "corrected", correction, basis } });
      }
    }
    return withFunding({ ...comparison, check: { status: "supported", basis } });
  });
  const texts = out.flatMap((c) => [c.japan, c.check?.correction ?? ""]).filter(Boolean);
  assertNoBanned(texts);
  assertChineseAllowingNames(texts);
  return out;
}

/** 拿搜到的资料核实"日本这边"。一条资料都没搜到的直接标没查到，不调 AI。 */
export async function checkJapanComparisons(inputs: JapanSources[], side: CompareSide = "japan"): Promise<JapanComparison[]> {
  if (inputs.every((i) => i.sources.length === 0)) {
    return inputs.map(({ comparison }) => ({ ...comparison, check: { status: "unverified", basis: [] } }));
  }
  const blocks = inputs
    .map(({ comparison, sources }, i) =>
      [
        `【${i}】${comparison.japan}`,
        sources.length > 0
          ? sources.map((src, j) => `  [资料 ${j + 1}] ${src.title}\n  ${src.url}\n  ${src.content.slice(0, 1200)}`).join("\n")
          : "  （没搜到资料）",
      ].join("\n")
    )
    .join("\n\n");
  return executeAiJson(
    { operation: "brief_japan_check", module: "unknown", outputMode: "json", timeoutMs: 40_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        blocks +
        (attempt === 1
          ? "\n\n上一次输出没通过校验。basis 必须逐字照抄对应那句下面资料的原文，source 是资料编号；叙述用中文。"
          : ""),
      config: {
        // 反方向核实"中国有没有"：同一套规则，把"日本"换成"中国"
        systemInstruction: side === "china" ? JAPAN_CHECK_PROMPT.replaceAll("日本", "中国") : JAPAN_CHECK_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 3000,
      },
    }),
    (value) => parseJapanChecks(value, inputs)
  );
}

export async function linkPicksToReader(
  picks: { index: number; headline: string; background: string }[],
  reader: SignalReader
): Promise<PersonalLink[]> {
  const items = [
    ...reader.facts,
    ...reader.observations,
    ...reader.hypotheses,
    ...reader.skills,
    ...reader.ideas,
    ...reader.dreams,
  ];
  if (picks.length === 0 || items.length === 0) return [];
  const contents = [
    "今天的报告：",
    ...picks.map((p) => `[${p.index}] ${p.headline}\n${p.background}`),
    "",
    aboutUser(reader),
  ].join("\n");

  return executeAiJson(
    { operation: "brief_personal_links", module: "unknown", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents: contents + (attempt === 1 ? "\n\n上一次输出没通过校验。严格按 JSON 字段重写。" : ""),
      config: {
        systemInstruction: LINK_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 800,
      },
    }),
    (value) => parsePersonalLinks(value, picks.map((p) => p.index), items)
  ).then((links) => judgePersonalLinks(links, picks));
}

/**
 * 写"跟你"的模型总爱硬凑（"倒闭潮 → 可能影响你分析的新客比例"），提示词和字眼表都拦不全。
 * 交给裁判判"这条新闻会不会直接改变他手上这件事的做法或结论"：
 * 6 个例子里，硬凑的 0.00–0.02，真相关的 0.87–0.99。门槛 0.5；裁判不可用就一条都不标。
 */
const PERSONAL_ABOVE = 0.5;

export function keepJudgedLinks(links: PersonalLink[], result: JevResult): PersonalLink[] {
  return links.filter((_, i) => secondOption(result.answers[`link_${i}`]) > PERSONAL_ABOVE);
}

async function judgePersonalLinks(
  links: PersonalLink[],
  picks: { index: number; headline: string }[]
): Promise<PersonalLink[]> {
  if (links.length === 0) return [];
  const questions: Record<string, JevQuestion> = {};
  const state = links
    .map((l, i) => {
      const headline = picks.find((p) => p.index === l.index)?.headline ?? "";
      questions[`link_${i}`] = {
        type: "score",
        instructions: `[${i}] 这条新闻会不会直接改变他手上这件事的做法或结论？只是同一个大领域、要靠"可能""未来""如果"才连得上的，算不会。`,
        criteria: ["不会：只是沾边，要靠推测才连得上", "会：直接改变他手上这件事的做法或结论"],
      };
      return `[${i}] 他手上的事：${l.link ?? ""}\n新闻：${headline}\nAI 写的关系：${l.personal}`;
    })
    .join("\n\n");
  try {
    return await executeJev({ operation: "personal_judge", module: "unknown", timeoutMs: 30_000 }, { state, questions }, (result) =>
      keepJudgedLinks(links, result)
    );
  } catch (e) {
    console.error("personal link judge failed, dropping links", e);
    return [];
  }
}

// ── 往下推：多层推论 ───────────────────────────────────────────────────────

/**
 * 五档，不给百分比：AI 给的"62%"是编的，却会让人觉得很精确（原则 1）。
 * "possible" 沿用早期三档时的键名，意思是"一半一半"，这样旧数据不用迁移。
 */
export type Likelihood = "very_likely" | "likely" | "possible" | "unlikely" | "very_unlikely";
export const LIKELIHOOD_ORDER: Likelihood[] = ["very_likely", "likely", "possible", "unlikely", "very_unlikely"];

export type InferenceStep = {
  /** 会发生什么。 */
  claim: string;
  /** 为什么会这样：从上一步到这一步的机制。 */
  why: string;
  /** 怎么看出它正在发生：一个能观察到的信号。 */
  watch: string;
  likelihood: Likelihood;
  /** 用来查证这一步的搜索词（日文或英文，具体）。没给就用 claim 本身。 */
  query: string;
  /**
   * 反方向的搜索词：照着推论本身去搜，搜到的几乎全是支持它的文章（确认偏误搬进了搜索）。
   * 所以同时搜"它不会发生 / 影响有限"的说法。
   */
  counterQuery: string;
  /** 从哪个角度想到的；没写或写错的当成"顺着往下"（从已有节点重判时可能没有）。 */
  lens?: InferenceLens;
  /** 用到的材料原文（逐字出现在那份材料里才留）。 */
  basis?: InferenceBasis;
};

/** 每层最多几条。层数上限由调用方控制。 */
const INFERENCE_BRANCHES = 3;

/** 推之前查材料用的三个角度（"顺着往下"不用查：链本身就是它的材料）。 */
const SCOUT_LENSES = ["ripple", "reaction", "precedent"] as const;
export type ScoutQuery = { lens: (typeof SCOUT_LENSES)[number]; query: string };

const SCOUT_PROMPT = `你帮一个人练"顺着一条消息往下推"。推下一层之前，先上网找一点材料 —— 只盯着这条链自己的说法，推出来的多半是换个说法。
给你新闻和已经推到的链。写 3 个搜索词，各从一个角度找：
- ripple：链上还没出现过的另一群人、另一个行业、另一个地方，会被最后一步波及到 —— 找他们现在的情况。
- reaction：对手、监管、消费者、上下游碰到这类事通常怎么应对 —— 找有人反着做、或者已经在应对的报道。
- precedent：以前发生过的类似的事（别的国家、别的年份、别的行业），后来接着发生了什么。
搜索词用日文或英文（看这件事主要在哪个国家；precedent 可以用英文），3 到 8 个词，具体到对象和动作，不要写成一句话。

只输出 JSON：{"queries":[{"lens":"ripple","query":"…"},{"lens":"reaction","query":"…"},{"lens":"precedent","query":"…"}]}`;

export function parseScoutQueries(value: unknown): ScoutQuery[] {
  const raw = (value as { queries?: unknown } | null)?.queries;
  if (!Array.isArray(raw)) throw new Error("缺少 queries");
  const out: ScoutQuery[] = [];
  for (const q of raw) {
    if (!q || typeof q !== "object") continue;
    const v = q as Record<string, unknown>;
    const lens = SCOUT_LENSES.find((l) => l === v.lens);
    const query = typeof v.query === "string" ? v.query.trim().slice(0, 120) : "";
    if (!lens || !query || out.some((o) => o.lens === lens)) continue;
    out.push({ lens, query });
  }
  if (out.length === 0) throw new Error("一个能用的搜索词都没有");
  return out;
}

/** 推之前查材料的搜索词：波及别处、有人反应、以前也有过，各一个。 */
export async function planScoutQueries(input: { title: string; summary: string; chain: string[]; direction?: string }): Promise<ScoutQuery[]> {
  const contents = [
    `新闻标题：${input.title}`,
    `新闻简介：${input.summary || "（没有）"}`,
    input.chain.length === 0
      ? "已经推到的链：（还没有，下一层直接从新闻推）"
      : `已经推到的链：\n${input.chain.map((c, i) => `${i + 1}. ${c}`).join("\n")}`,
    input.direction ? `他想往这个方向推：${input.direction}（三个搜索词都围绕它）` : "",
  ].join("\n");
  return executeAiJson(
    { operation: "signal_inference_scout", module: "unknown", outputMode: "json", timeoutMs: 15_000 },
    () => ({
      model: MODEL,
      contents,
      config: {
        systemInstruction: SCOUT_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 600,
      },
    }),
    parseScoutQueries
  );
}

const INFERENCE_PROMPT = `你帮一个人练"顺着一条消息往下推"。给你一条新闻，和已经推到的那条链（可能为空）。
你只负责推下一层：在这条链最后一步成立的前提下，接下来最可能发生的 2 到 ${INFERENCE_BRANCHES} 种情况。

每种情况写：
- claim：会发生什么，一句话，具体到谁、做什么。
- why：为什么上一步会导致这一步，说清机制，一到两句。
- watch：到时候看什么能知道它正在发生（哪类新闻、哪个数字、谁的动作），一句话。
- likelihood：在上一步成立的前提下，它发生的可能性，只能是这五档之一：
  "very_likely"（很可能）/"likely"（较可能）/"possible"（一半一半）/"unlikely"（不太可能）/"very_unlikely"（很不可能）。
  最好也给一条反方向或意外的情况。
- lens：这一条是从哪个角度想到的，只能是 "direct" / "ripple" / "reaction" / "precedent"（见下面）。
- basis：用到了"查到的材料"的，写 {"source":材料编号,"excerpt":"逐字照抄的那句原文，15 到 150 字，不翻译"}；没用到写 null。

怎么想：
先别急着顺着最后一步往下写。在心里列 5 到 6 个候选，分别从这四个角度想：
- direct（顺着往下）：最后一步直接推动了谁，他接下来做什么；
- ripple（波及别处）：链上还没出现过的另一群人、另一个行业、另一个地方，被波及后会怎样；
- reaction（有人反应）：对手、监管、消费者、上下游会怎么应对，让事情拐弯，甚至反过来；
- precedent（以前也有过）：以前发生过类似的事，后来接着发生了什么，这次会不会也这样、哪里不一样。
"查到的材料"是围绕这条链上网搜来的（波及到谁、有人怎么反应、以前类似的事），还有上一步查证时找到的事实。
好的下一步常常就藏在材料里：一个链上还没出现的人、一个新的机制、一个以前发生过的结果。用材料里的事实，不要编材料里没有的事。
再从候选里挑 2 到 ${INFERENCE_BRANCHES} 条输出：挑带进新的人或新机制最多的、最不像换个说法的，几条的角度尽量不一样。

铁律：
- 不写百分比、不写"概率为 X"、不写任何表示可能性的数字。只用上面五档。
- 这几种情况要真的不一样（不同的人、不同的方向），不要同一件事换个说法。
- 不重复链上已经出现过的结论，往前推，不要原地打转。
- 每一步都要带进**新的人或新的机制**。只是把上一步换个说法、或者写它的同义后果（"门票卖得多 → 球队收入增加"），不算往下推，不许写。
- 这一步要和整条链连起来看：不光接上最后一步，也要和新闻本身、链上前面每一步都对得上。前面某一步把范围限定了（"如果夺冠"），后面就不能当它一定发生。
- 考虑幅度：小变化（比如利率只动 0.25 个百分点、一家公司的小动作）通常推不出大后果。
  幅度不够大、不足以导致下一步的，就标 "unlikely"，并在 why 里说清楚为什么幅度不够。
${SIGNAL_SHARED_RULES}

另外给每种情况写两个搜索词，用日文或英文（看这件事主要在哪个国家），具体到对象和动作，不要写成一句话：
- query：找支持它的资料，比如 "大手銀行 住宅ローン金利 引き上げ 2026"。
- counterQuery：找反对它的资料 —— 它不会发生、影响有限、有人反着做，比如 "住宅ローン金利 据え置き 大手銀行" 或 "利上げ 影響 限定的"。

只输出 JSON：{"steps":[{"claim":"…","why":"…","watch":"…","likelihood":"likely","lens":"ripple","basis":{"source":1,"excerpt":"…"},"query":"…","counterQuery":"…"}]}`;

/** 材料原文必须逐字出现在它说的那份材料里（空白不算），否则当没用到材料。 */
function parseStepBasis(raw: unknown, materials: SearchSource[]): InferenceBasis | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const v = raw as Record<string, unknown>;
  const src = materials[(typeof v.source === "number" ? v.source : Number(v.source)) - 1];
  const excerpt = typeof v.excerpt === "string" ? v.excerpt.trim() : "";
  const squash = (t: string) => t.replace(/\s+/g, "");
  if (!src || squash(excerpt).length < 8 || !squash(src.content).includes(squash(excerpt))) return undefined;
  return { url: src.url, title: src.title, excerpt: excerpt.slice(0, 200) };
}

export function parseInferenceSteps(value: unknown, materials: SearchSource[] = []): InferenceStep[] {
  if (!value || typeof value !== "object") throw new Error("输出不是对象");
  const raw = (value as { steps?: unknown }).steps;
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("缺少 steps");
  const steps: InferenceStep[] = raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({
      claim: requireString(s, "claim"),
      why: requireString(s, "why"),
      watch: requireString(s, "watch"),
      query: typeof s.query === "string" && s.query.trim() ? s.query.trim().slice(0, 120) : String(s.claim ?? ""),
      counterQuery: typeof s.counterQuery === "string" ? s.counterQuery.trim().slice(0, 120) : "",
      likelihood: LIKELIHOOD_ORDER.includes(s.likelihood as Likelihood) ? (s.likelihood as Likelihood) : "possible",
      lens: INFERENCE_LENSES.find((l) => l === s.lens) ?? "direct",
      basis: parseStepBasis(s.basis, materials),
    }))
    .slice(0, INFERENCE_BRANCHES)
    // 从较可能到不太可能排
    .sort((a, b) => LIKELIHOOD_ORDER.indexOf(a.likelihood) - LIKELIHOOD_ORDER.indexOf(b.likelihood));
  const texts = steps.flatMap((s) => [s.claim, s.why, s.watch]);
  const numeric = texts.find(mentionsNumericLikelihood);
  if (numeric) throw new Error(`出现了数字化的可能性：${numeric.slice(0, 30)}`);
  assertNoBanned(texts);
  assertChinese(texts);
  return steps;
}

export async function inferNextSteps(input: {
  title: string;
  summary: string;
  body: string;
  /** 从根到当前节点已经推出的结论，按顺序。空数组表示从新闻本身开始推。 */
  chain: string[];
  /** 用户给的方向；有的话，这一层的几种情况都要围绕它推。 */
  direction?: string;
  /** 推之前查到的材料（编号从 1 开始）。没有就只凭新闻和链推。 */
  materials?: SearchSource[];
}): Promise<InferenceStep[]> {
  const materials = input.materials ?? [];
  const contents = [
    `新闻标题：${input.title}`,
    `新闻简介：${input.summary || "（没有）"}`,
    `正文节选：${input.body ? input.body.slice(0, 1500) : "（拿不到正文）"}`,
    "",
    input.chain.length === 0
      ? "已经推到的链：（还没有，从这条新闻本身开始推第一层）"
      : `已经推到的链（每一步都假设成立）：\n${input.chain.map((c, i) => `${i + 1}. ${c}`).join("\n")}`,
    input.direction
      ? `\n他想往这个方向推：${input.direction}\n` +
        `这一层的几种情况都要围绕这个方向。如果它是一个假设（"如果……"），就当它成立往下推。` +
        `这个方向本身站不住、或者跟前面的链对不上的话，照实标低可能性，并在 why 里说清楚为什么，不要硬凑。`
      : "",
    materials.length > 0
      ? `\n查到的材料：\n${materials.map((m, i) => `[材料 ${i + 1}] ${m.title}\n${m.content.slice(0, 700)}`).join("\n\n")}`
      : "\n查到的材料：（这次没查到，只凭新闻和链推）",
  ].join("\n");

  return executeAiJson(
    { operation: "signal_inference", module: "unknown", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1
          ? "\n\n上一次输出没通过校验（缺字段、写了百分比、或没用中文）。严格按 JSON 字段重写。"
          : ""),
      config: {
        systemInstruction: INFERENCE_PROMPT,
        responseMimeType: "application/json",
        // 推论要掂量幅度（0.25 个百分点推不出房价下跌），不开思考时模型一律标"较可能"。
        // 先列五六个候选再挑，思考要多一点；思考会吃 maxOutputTokens，所以上限给足，免得 JSON 被截断。
        thinkingConfig: { thinkingBudget: 2048 },
        maxOutputTokens: 6144,
      },
    }),
    (value) => parseInferenceSteps(value, materials)
  );
}

// ── 往下推：Jev 当裁判 ─────────────────────────────────────────────────────

/**
 * 写推论的（Gemini）和判可能性的（Jev）分开：让同一个模型给自己写的结论打分，
 * 它几乎一律标"较可能"。Jev 只回档位分布、不生成文字，正好当裁判。
 * 页面只显示档位，不显示 Jev 的数字（原则 1：精确性偏误）；分布太平就标"拿不准"。
 */
/**
 * p：在上一步成立的前提下的可能（五档分布按代表值折算），只拿来算整条链，不显示。
 * restates：裁判认为这一步只是把上一步换个说法（"门票卖得多 → 收入增加"），算不上往下推。
 */
export type JudgedTier = {
  likelihood: Likelihood;
  unsure: boolean;
  p: number;
  restates: boolean;
  specifies: boolean;
  /** 太泛：说的是一类变化或趋势（"日本经济会受到影响"），到时候说不清算不算发生了。 */
  vague: boolean;
};

const RESTATE_CRITERIA = [
  "带进了新的人或新的机制，真的往下推了一步",
  "只是把上一步换个说法，或者是它不言自明的同义后果",
];

/**
 * 车轱辘话有两种，用两个问题分别抓（14 个已知答案的例子上试过：单用哪一个都会漏）：
 * - 相邻两步换个说法（"门票卖得多 → 收入增加"）：只和上一步比，最准；
 * - 绕回前面某一步（"银行加存款利率 → 储户转钱 → 银行存款利率更高"）：要看整条链，问"是不是自动成立"。
 * 任一个判中就算。相邻那一问门槛放到 0.45：真往下推的步骤在这一问上都很低，离门槛很远。
 */
const CIRCULAR_CRITERIA = [
  "需要有人做出新的决定或出现新的条件，它才会发生",
  "前面成立它就自动成立，等于把前面某一步换个说法或说得更具体",
];
const RESTATE_ABOVE = 0.45;
const CIRCULAR_ABOVE = 0.5;

/**
 * 第三种：把上一步说得更具体一点（"物流公司会涨运费 → 大和上调宅急便运费"）。
 * 用反推来认：知道这一步发生了，就能断定上一步也发生了 —— 它是上一步的一个特例。
 * 真正的后果反推不回去（周边餐馆生意好，可能有别的原因）。真往下推的步骤在这一问上都 ≤0.04，门槛放 0.3。
 * 认出来的不丢：它正好是上一步的观察信号，挪过去。
 */
const SPECIFIES_CRITERIA = [
  "不能断定：这一步可能由别的原因引起，它是上一步之后的新后果",
  "能断定：这一步发生就说明上一步一定发生了，它只是上一步的一个具体例子或换个说法",
];
const SPECIFIES_ABOVE = 0.3;

/**
 * 太泛的推论是车轱辘的温床：上一步说得泛，下一步"说具体一点"就能冒充往下推。
 * 裁判偏严，连"部分储户把钱转回银行"都会给到 0.6–0.8；真正空泛的（"日本经济会受到影响"）都在 0.85 以上。
 * 门槛放 0.9，只拦真正空泛的，免得几乎每一步都要重写。
 */
const VAGUE_CRITERIA = [
  "具体：说清了谁做了什么，到时候能看出它有没有发生",
  "太泛：说的是一类变化或一种趋势，到时候很难说清它算不算发生了",
];
const VAGUE_ABOVE = 0.9;

/** 一个二选一问题里"第二项"（车轱辘那一项）的概率；缺了就当 0，不因为它让整层判档作废。 */
function secondOption(answer: unknown): number {
  const probs = (answer as { probabilities?: Record<string, unknown> } | undefined)?.probabilities;
  const v = probs?.["1"];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

const TIER_CRITERIA = [
  "很可能：在前面这些都成立的情况下，这一步几乎一定会发生",
  "较可能：多半会发生",
  "一半一半：可能发生，也可能不发生，取决于别的条件",
  "不太可能：幅度不够、条件不足，多半不会发生",
  "很不可能：有更强的力量在反方向，几乎不会发生",
];
/** 最高一档的概率低于这个，就当 Jev 拿不准。 */
const JEV_UNSURE_BELOW = 0.5;

export function parseJudgedTiers(result: JevResult, count: number): JudgedTier[] {
  return Array.from({ length: count }, (_, i) => {
    const answer = result.answers[`step_${i}`] as Record<string, unknown> | undefined;
    if (!answer || answer.type !== "score") throw new Error(`step_${i} 缺少档位`);
    // Jev 的 score 是期望值（比如 0.35），不是档位；档位取概率最高的那一档
    const raw = answer.probabilities as Record<string, unknown> | undefined;
    if (!raw || typeof raw !== "object") throw new Error(`step_${i} 缺少概率`);
    const probs = TIER_CRITERIA.map((_, level) => {
      const v = raw[String(level)];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
        throw new Error(`step_${i}[${level}] 不是 0 到 1 之间的数`);
      }
      return v;
    });
    const top = Math.max(...probs);
    const total = probs.reduce((a, b) => a + b, 0) || 1;
    const p = probs.reduce((acc, v, level) => acc + (v / total) * TIER_VALUE[LIKELIHOOD_ORDER[level]], 0);
    const restates =
      secondOption(result.answers[`restate_${i}`]) > RESTATE_ABOVE ||
      secondOption(result.answers[`circular_${i}`]) > CIRCULAR_ABOVE;
    const specifies = secondOption(result.answers[`reverse_${i}`]) > SPECIFIES_ABOVE;
    const vague = secondOption(result.answers[`concrete_${i}`]) > VAGUE_ABOVE;
    return { likelihood: LIKELIHOOD_ORDER[probs.indexOf(top)], unsure: top < JEV_UNSURE_BELOW, p, restates, specifies, vague };
  });
}

export async function judgeInferenceSteps(input: {
  title: string;
  summary: string;
  chain: string[];
  steps: InferenceStep[];
  /** 每一步上网查到的事实（和 steps 一一对应）。没查到就是空数组。 */
  evidence?: StepEvidence[][];
}): Promise<JudgedTier[]> {
  // 不给 Jev 看 Gemini 写的"为什么"：那是最有说服力、也最容易把判断往高处带的部分。
  // 换成上网查到的事实，让它看证据判断。
  const state = [
    `新闻：${input.title}`,
    input.summary ? `简介：${input.summary}` : "",
    input.chain.length > 0
      ? `假设下面这些已经依次发生：\n${input.chain.map((c, i) => `${i + 1}. ${c}`).join("\n")}`
      : "",
    "接下来可能发生的几种情况，以及上网查到的相关事实：",
    ...input.steps.map((s, i) => {
      const facts = input.evidence?.[i] ?? [];
      const lines = facts.map((f) => `   - ${f.fact}`);
      return [`[${i}] ${s.claim}`, ...(lines.length ? lines : ["   - （没查到相关事实）"])].join("\n");
    }),
  ]
    .filter(Boolean)
    .join("\n");

  const questions: Record<string, JevQuestion> = {};
  const parent = input.chain.length > 0 ? input.chain[input.chain.length - 1] : `新闻本身：${input.title}`;
  input.steps.forEach((s, i) => {
    questions[`step_${i}`] = {
      type: "score",
      instructions: `在新闻和前面那些都成立的前提下，情况 [${i}]「${s.claim}」发生的可能性有多大？要考虑变化的幅度够不够大。`,
      criteria: TIER_CRITERIA,
    };
    questions[`restate_${i}`] = {
      type: "score",
      instructions: `上一步是「${parent}」。情况 [${i}]「${s.claim}」是真的往下推了一步，还是只是把上一步换个说法？`,
      criteria: RESTATE_CRITERIA,
    };
    questions[`concrete_${i}`] = {
      type: "score",
      instructions: `「${s.claim}」具体到能在新闻里看到吗——说清了谁、做了什么，到时候能从新闻或数字里看出它有没有发生？`,
      criteria: VAGUE_CRITERIA,
    };
    questions[`reverse_${i}`] = {
      type: "score",
      instructions: `如果你只知道「${s.claim}」真的发生了，能不能由此断定「${parent}」也一定发生了？`,
      criteria: SPECIFIES_CRITERIA,
    };
    questions[`circular_${i}`] = {
      type: "score",
      instructions: `假设新闻和前面那些都已经成立。情况 [${i}]「${s.claim}」是不是不需要任何人做出新的决定、不需要任何新的条件，就自动成立（等于把前面某一步换个说法或说得更具体）？`,
      criteria: CIRCULAR_CRITERIA,
    };
  });

  return executeJev(
    { operation: "inference_judge", module: "unknown", timeoutMs: 30_000 },
    { state, questions },
    (result) => parseJudgedTiers(result, input.steps.length)
  );
}

// ── 贝叶斯草稿：AI 只给粗档，用户改，代码算 ───────────────────────────────

export type BayesDraft = {
  prior: "rare" | "low" | "even" | "high" | "common";
  priorWhy: string;
  evidence: {
    text: string;
    why: string;
    strength: "strong_for" | "for" | "neutral" | "against" | "strong_against";
    /** 用的是上网查到的哪条事实；凭印象想的证据没有来源。 */
    url?: string;
  }[];
};

const PRIORS = ["rare", "low", "even", "high", "common"] as const;
const STRENGTHS = ["strong_for", "for", "neutral", "against", "strong_against"] as const;

const BAYES_PROMPT = `你帮一个人用贝叶斯的方式估计一件事有多大可能。你只起草稿，他会改。
给你一条新闻、前面已经推到的链，和要估计的那一步。

输出：
1. prior：先不看这条新闻和前面的链，这类事平常发生的频率，只能选一档：
   "rare"（很少见）/"low"（偏少）/"even"（一半一半）/"high"（偏多）/"common"（很常见）。
2. priorWhy：为什么选这一档，一到两句（参照过去类似的情况）。
   先验里绝不能用到这条新闻和前面的链（比如"因为利率上升了，所以……"）—— 那是证据，放进先验再当证据算一次，就重复算了，结果会虚高。
   先验只回答：在一个普通的年份里，这类事有多常见。
3. evidence：2 到 4 条会改变这个估计的证据，从新闻和前面的链里找，正反都要有 —— 至少一条反对或无关的。
   证据的强度要看幅度：小变化（比如利率只动 0.25 个百分点）最多算"支持"，不要算"强烈支持"。每条写：
   - text：证据是什么，一句话。
   - why：它为什么让这件事更可能或更不可能，一句话。
   - strength：只能选一档 "strong_for"（强烈支持）/"for"（支持）/"neutral"（无关）/"against"（反对）/"strong_against"（强烈反对）。

铁律：不写任何百分比或数字化的可能性，只选档。
${SIGNAL_SHARED_RULES}

如果材料里有"上网查到的事实"（带编号），证据优先从里面挑，并在 found 里写它的编号；
确实需要补一条查到的事实里没有的证据时，found 写 0。

只输出 JSON：{"prior":"…","priorWhy":"…","evidence":[{"text":"…","why":"…","strength":"…","found":1}]}`;

export function parseBayesDraft(value: unknown, found: { url: string }[] = []): BayesDraft {
  if (!value || typeof value !== "object") throw new Error("输出不是对象");
  const v = value as Record<string, unknown>;
  if (!PRIORS.includes(v.prior as (typeof PRIORS)[number])) throw new Error("prior 不是五档之一");
  const raw = Array.isArray(v.evidence) ? v.evidence : [];
  const evidence = raw
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .filter((e) => STRENGTHS.includes(e.strength as (typeof STRENGTHS)[number]))
    .map((e) => ({
      text: requireString(e, "text"),
      why: requireString(e, "why"),
      strength: e.strength as BayesDraft["evidence"][number]["strength"],
      // 编号对得上才挂来源；对不上就当凭印象想的，不挂
      url: found[(typeof e.found === "number" ? e.found : Number(e.found)) - 1]?.url,
    }))
    .slice(0, 4);
  if (evidence.length === 0) throw new Error("缺少 evidence");
  // 只给支持的证据，草稿一算就虚高，还会把人锚过去：至少要有一条反对或无关的
  if (!evidence.some((e) => e.strength === "against" || e.strength === "strong_against" || e.strength === "neutral")) {
    throw new Error("证据只有支持的，没有反方");
  }
  const draft: BayesDraft = { prior: v.prior as BayesDraft["prior"], priorWhy: requireString(v, "priorWhy"), evidence };
  const texts = [draft.priorWhy, ...evidence.flatMap((e) => [e.text, e.why])];
  const numeric = texts.find(mentionsNumericLikelihood);
  if (numeric) throw new Error(`出现了数字化的可能性：${numeric.slice(0, 30)}`);
  assertNoBanned(texts);
  assertChinese(texts);
  return draft;
}

export async function draftBayes(input: {
  title: string;
  summary: string;
  chain: string[];
  claim: string;
  /** 这一步上网查到过的事实（带来源）。 */
  found?: { url: string; fact: string; stance: string }[];
}): Promise<BayesDraft> {
  const found = input.found ?? [];
  const contents = [
    `新闻：${input.title}`,
    input.summary ? `简介：${input.summary}` : "",
    input.chain.length > 0 ? `前面已经推到的链：\n${input.chain.map((c, i) => `${i + 1}. ${c}`).join("\n")}` : "",
    `要估计的这一步：${input.claim}`,
    found.length > 0 ? `上网查到的事实：\n${found.map((f, i) => `[${i + 1}] ${f.fact}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return executeAiJson(
    { operation: "bayes_draft", module: "unknown", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1
          ? "\n\n上一次输出没通过校验。常见原因：证据里没有一条反对或无关的（至少要一条）、档位不是规定的五档之一、写了百分比、没用中文。严格按 JSON 字段重写。"
          : ""),
      config: {
        systemInstruction: BAYES_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 512 },
        maxOutputTokens: 3000,
      },
    }),
    (value) => parseBayesDraft(value, found)
  );
}

// ── 往下推：上网查证据 ─────────────────────────────────────────────────────

export type EvidenceStance = "supports" | "contradicts" | "context";

/** 查到的一条事实。来源 URL 和原文摘录都由代码核对过，确实在搜索结果里。 */
export type StepEvidence = {
  url: string;
  title: string;
  /** 用中文写的一句事实。 */
  fact: string;
  /** 原文摘录（逐字）。 */
  excerpt: string;
  stance: EvidenceStance;
  /** 问题驱动：上一轮没有、这一轮新查到的（按链接比）。 */
  fresh?: boolean;
};

export type SearchSource = { title: string; url: string; content: string };

const MAX_EVIDENCE_PER_STEP = 4;
const STANCES = ["supports", "contradicts", "context"] as const;

const EVIDENCE_PROMPT = `你帮一个人查证一个推论。给你一个推论，和几篇上网搜到的资料。
从资料里抽出跟这个推论有关的**事实**，最多 ${MAX_EVIDENCE_PER_STEP} 条。

每条写：
- source：资料的编号（数字）。
- fact：用中文写一句具体的事实（谁、做了什么、什么时候、多少）。
- excerpt：资料里支撑这条事实的原文，逐字照抄，不要翻译、不要改字，30 到 120 字。
- stance：这条事实对推论是 "supports"（支持）、"contradicts"（反对）还是 "context"（背景，不直接支持也不反对）。

铁律：
- 只抽资料里真写了的。没写的不要补，不要推测。
- 跟推论无关的资料直接跳过；讲的是别的国家、别的行业、别的事的，也跳过（推论讲日本，就不要抽美国的数据）。一条都没有就给空数组，不要凑。
- 反对的事实和支持的一样重要，看到就要抽。
- 同一件事只留一条最具体的。

只输出 JSON：{"evidence":[{"source":1,"fact":"…","excerpt":"…","stance":"supports"}]}`;

/** 来源编号必须对得上、摘录必须逐字出现在那篇资料里（忽略空白），否则丢掉 —— 防止编来源。 */
export function parseStepEvidence(value: unknown, sources: SearchSource[]): StepEvidence[] {
  if (!value || typeof value !== "object") throw new Error("输出不是对象");
  const raw = (value as { evidence?: unknown }).evidence;
  if (!Array.isArray(raw)) throw new Error("缺少 evidence");
  const squash = (t: string) => t.replace(/\s+/g, "");
  const seen = new Set<string>();
  const out: StepEvidence[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const v = r as Record<string, unknown>;
    const idx = (typeof v.source === "number" ? v.source : Number(v.source)) - 1;
    const source = sources[idx];
    const fact = typeof v.fact === "string" ? v.fact.trim() : "";
    const excerpt = typeof v.excerpt === "string" ? v.excerpt.trim() : "";
    const stance = STANCES.includes(v.stance as EvidenceStance) ? (v.stance as EvidenceStance) : null;
    if (!source || !fact || squash(excerpt).length < 8 || !stance) continue;
    if (!squash(source.content).includes(squash(excerpt))) continue;
    if (seen.has(fact)) continue;
    seen.add(fact);
    out.push({ url: source.url, title: source.title, fact, excerpt: excerpt.slice(0, 300), stance });
    if (out.length >= MAX_EVIDENCE_PER_STEP) break;
  }
  if (out.length > 0) {
    assertNoBanned(out.map((e) => e.fact));
    assertChinese(out.map((e) => e.fact));
  }
  return out;
}

export async function extractStepEvidence(claim: string, sources: SearchSource[]): Promise<StepEvidence[]> {
  if (sources.length === 0) return [];
  const blocks = sources
    .map((src, i) => `【资料 ${i + 1}】${src.title}\n${src.url}\n${src.content.slice(0, 2500)}`)
    .join("\n\n");
  return executeAiJson(
    { operation: "inference_evidence", module: "unknown", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        `要查证的推论：${claim}\n\n${blocks}` +
        (attempt === 1 ? "\n\n上一次输出没通过校验。excerpt 必须逐字照抄资料原文，source 必须是资料编号。" : ""),
      config: {
        systemInstruction: EVIDENCE_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 1500,
      },
    }),
    (value) => parseStepEvidence(value, sources)
  );
}

// ── 周刊：只搬运、不替他写观点 ─────────────────────────────────────────────

/** 周刊要排的东西：和 lib/domains/signals/issue-shared.ts 的 IssueContent 同形（这里不引那边，免得 lib/ai 依赖领域层）。 */
export type IssueComposeInput = {
  opening: string;
  picks: {
    there: string;
    here: string;
    headline: string;
    background: string;
    hereNow: string;
    whyNow?: string;
    funded?: { company: string };
    conditions?: { name: string; holds: "yes" | "no" | "unclear"; here: string }[];
    judgment: string;
  }[];
  bets: { question: string; judgment: string; outcome: "pending" | "hit" | "miss"; made_on: string; due_on: string }[];
};

const HOLDS_TEXT = { yes: "这边也成立", no: "这边不成立", unclear: "说不清" } as const;
const OUTCOME_TEXT = { pending: "还在等", hit: "对了", miss: "错了" } as const;

function issueInputText(input: IssueComposeInput): string {
  const picks = input.picks.map((p, i) =>
    [
      `【第 ${i + 1} 条】${p.headline}`,
      `${p.there}那边：${p.background}`,
      `${p.here}这边现在：${p.hereNow}`,
      p.whyNow ? `为什么是现在：${p.whyNow}` : "",
      p.funded ? `${p.here}已经有公司拿到投资在做：${p.funded.company}` : "",
      p.conditions && p.conditions.length > 0
        ? `能不能搬过来（它在${p.there}靠这几条做成，${p.here}这边）：${p.conditions.map((c) => `${c.name}——${HOLDS_TEXT[c.holds]}（${c.here}）`).join("；")}`
        : "",
      `【他的判断】${p.judgment}`,
    ]
      .filter(Boolean)
      .join("\n")
  );
  const bets = input.bets.map(
    (b) => `【对账】${b.made_on} 押的：${b.judgment}（问题：${b.question}；${b.due_on} 对账）→ ${OUTCOME_TEXT[b.outcome]}`
  );
  return [input.opening ? `【他写的开头】${input.opening}` : "", ...picks, ...bets].filter(Boolean).join("\n\n");
}

const ISSUE_SHARED_RULES = `你帮他把这一周的"那边有、这边还没有"整理成一期周刊。你只做两件事：把下面给的事实排好、写顺；把他写的判断放进去。不许替他加观点。

铁律：
- 只用下面给的事实。没给的不要补，不要自己加数字、公司名、日期。
- 不许写"值得关注""很有潜力""机会巨大""赶紧上车"这类话；不许写投资建议；不许夸他，也不许夸读者。
- 结尾不要写"欢迎评论""关注我"之类的话（代码会加），也不要写出处链接（代码会加）。
- 长文的结构：开头一两句说这一期讲什么（他写了开头就用他的）；每条一个小标题，下面依次写那边是什么、这边现在怎样、为什么是现在、能不能搬过来（给了才写），最后一段是他的判断；最后是对账（给了才写）：他押过什么、结果对了 / 错了 / 还在等，照实写，错了也写。`;

const ISSUE_ZH_PROMPT = `${ISSUE_SHARED_RULES}

你写中文版：
- 他写的判断（【他的判断】后面那段）和开头（【他写的开头】），一字不改地照抄 —— 代码会逐字核对，改了一个字就作废。判断单独成段，前面写"我的判断："。
- 对账里他押的那句话也一字不改。
- zhLong：公众号 / 即刻用的长文。
- zhNotes：小红书笔记，**每条单独一篇**，按给的顺序，篇数和条数一样多（小红书上一篇只讲一件事的才有人看）。每篇写：
  - title：20 字以内，从他的视角写成一个观察或问题，带一个具体的事（例："在日本找不到的中国服务：无人机送药"），不要标题党、不要感叹号堆叠。
  - body：600 字以内。第一句就说清是什么东西；段落短；依次写那边是什么、这边现在怎样、为什么是现在（给了才写）；
    最后一段"我的判断："照抄他那条的判断。不要写话题标签，也不要写"评论区告诉我"之类的话（代码会加）。可以用一两个符号当小标题，不要满屏 emoji。
- zhTitles：长文的 3 个标题候选，每个 20 字以内，带一个具体的事实，不要标题党。

只输出 JSON：{"zhLong":"…","zhNotes":[{"title":"…","body":"…"}],"zhTitles":["…","…","…"]}`;

const ISSUE_JA_PROMPT = `${ISSUE_SHARED_RULES}

你写日文版（です・ます調）：
- 他写的判断和开头是中文，忠实翻译成日文，不加不减、不改语气的强弱。
- jaLong：note 用的长文。
- jaTitles：3 个标题候选，每个 30 字以内，带一个具体的事实。

只输出 JSON：{"jaLong":"…","jaTitles":["…","…","…"]}`;

/** 小红书正文上限一千字，结尾那句和话题标签由代码加，正文留足余量。 */
const XHS_BODY_MAX = 850;
const XHS_TITLE_MAX = 20;

export type XhsNote = { title: string; body: string };

function titlesOf(raw: unknown): string[] {
  return (Array.isArray(raw) ? raw : []).filter((t): t is string => typeof t === "string" && !!t.trim()).map((t) => t.trim()).slice(0, 3);
}

/**
 * 他的原话（判断、开头、对账里押的那句）必须逐字出现在中文稿里：长文里全有，每篇小红书笔记里有它那一条的判断。
 * 去掉他的原话以后，剩下的才查空话。小红书一条一篇，篇数和条数对不上不收。
 */
export function parseIssueZh(value: unknown, input: IssueComposeInput): { zhLong: string; zhNotes: XhsNote[]; zhTitles: string[] } {
  const v = (value ?? {}) as Record<string, unknown>;
  const zhLong = typeof v.zhLong === "string" ? v.zhLong.trim() : "";
  const zhNotes = (Array.isArray(v.zhNotes) ? v.zhNotes : [])
    .filter((n): n is Record<string, unknown> => !!n && typeof n === "object")
    .map((n) => ({
      title: typeof n.title === "string" ? n.title.trim() : "",
      body: typeof n.body === "string" ? n.body.trim() : "",
    }));
  const zhTitles = titlesOf(v.zhTitles);
  if (!zhLong || zhTitles.length === 0) throw new Error("缺字段");
  if (zhNotes.length !== input.picks.length || zhNotes.some((n) => !n.title || !n.body)) {
    throw new Error(`小红书要一条一篇，${input.picks.length} 条就是 ${input.picks.length} 篇`);
  }
  const squash = (t: string) => t.replace(/\s+/g, "");
  const own = [...input.picks.map((p) => p.judgment), ...input.bets.map((b) => b.judgment), input.opening].map((t) => t.trim()).filter(Boolean);
  input.picks.forEach((p, i) => {
    if (!squash(zhLong).includes(squash(p.judgment)) || !squash(zhNotes[i].body).includes(squash(p.judgment))) {
      throw new Error(`他的判断被改了：${p.judgment.slice(0, 20)}`);
    }
  });
  for (const text of [...input.bets.map((b) => b.judgment), input.opening].filter((t) => t.trim())) {
    if (!squash(zhLong).includes(squash(text))) throw new Error(`他的原话被改了：${text.slice(0, 20)}`);
  }
  for (const n of zhNotes) {
    if (Array.from(n.body).length > XHS_BODY_MAX) throw new Error(`小红书有一篇太长了（${Array.from(n.body).length} 字）`);
    if (Array.from(n.title).length > XHS_TITLE_MAX) throw new Error(`小红书有一篇标题太长了：${n.title}`);
  }
  const strip = (t: string) => own.reduce((acc, o) => acc.split(o).join(""), t);
  const aiTexts = [strip(zhLong), ...zhNotes.flatMap((n) => [n.title, strip(n.body)]), ...zhTitles];
  assertNoBanned(aiTexts);
  assertChineseAllowingNames(aiTexts);
  return { zhLong, zhNotes, zhTitles };
}

export function parseIssueJa(value: unknown): { jaLong: string; jaTitles: string[] } {
  const v = (value ?? {}) as Record<string, unknown>;
  const jaLong = typeof v.jaLong === "string" ? v.jaLong.trim() : "";
  const jaTitles = titlesOf(v.jaTitles);
  if (!jaLong || jaTitles.length === 0) throw new Error("缺字段");
  // 有平假名才是日文（整篇写成中文的不收）
  if (!/[\u3040-\u309f]/.test(jaLong)) throw new Error("不是日文");
  return { jaLong, jaTitles };
}

/** 中文、日文各写一份（并行，一份二三十秒）。 */
export async function composeIssue(input: IssueComposeInput): Promise<{
  zhLong: string;
  zhNotes: XhsNote[];
  zhTitles: string[];
  jaLong: string;
  jaTitles: string[];
}> {
  const contents = issueInputText(input);
  const call = <T>(operation: string, systemInstruction: string, parse: (v: unknown) => T, retryHint: string) =>
    executeAiJson(
      { operation, module: "unknown", outputMode: "json", timeoutMs: 55_000 },
      (attempt) => ({
        model: MODEL,
        contents: contents + (attempt === 1 ? `\n\n上一次输出没通过校验：${retryHint}` : ""),
        config: { systemInstruction, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 8000 },
      }),
      parse
    );
  const [zh, ja] = await Promise.all([
    call("signal_issue_zh", ISSUE_ZH_PROMPT, (v) => parseIssueZh(v, input), "他的判断、开头、押的那句必须一字不改；小红书一条一篇、每篇 600 字以内、标题 20 字以内；不许写空话。"),
    call("signal_issue_ja", ISSUE_JA_PROMPT, parseIssueJa, "要写成日文（です・ます調）。"),
  ]);
  return { ...zh, ...ja };
}

// ── 差距清单：能不能搬过来 ─────────────────────────────────────────────────

export type TransferPlan = {
  conditions: { name: string; there: string; query: string }[];
  precedentQuery: string;
};

export type TransferCondition = {
  name: string;
  there: string;
  here: string;
  /** 这一条在这边成不成立。没查到出处的一律 unclear —— 不凭印象下结论。 */
  holds: "yes" | "no" | "unclear";
  basis: { url: string; title: string; excerpt: string }[];
};

export type TransferJudgment = {
  conditions: TransferCondition[];
  /** 有人试过把它带到这边：谁、什么时候、结果怎样（原文由代码核对）。没查到为 null。 */
  precedent: { text: string; basis: { url: string; title: string; excerpt: string }[] } | null;
};

const MAX_TRANSFER_CONDITIONS = 5;

const transferPlanPrompt = (there: string, here: string) => `下面是${there}已经有、${here}还没有（或没普及）的一样东西。想知道能不能把它搬到${here}。
很多东西在${here}没有，不是因为没人想到，而是它在${there}做成靠的条件，${here}不具备。

它在${there}做成，靠的是哪几个条件？列 3 到 ${MAX_TRANSFER_CONDITIONS} 个最关键的，每个写：
- name：条件的短名字（例："手机支付普及""骑手便宜好招""人口够密""法规允许""大家愿意为它付钱"）。
- there：这一条在${there}是什么情况，一句，带具体的事实或数字（只写你确定的）。
- query：查"${here}现在这一条怎样"的搜索词，用${here}的语言，3 到 8 个词，具体。
再写 precedentQuery：查"有没有人试过把它带到${here}、结果怎样"的搜索词（${here}的语言）。

不写空话（"市场潜力大""需要关注"）。用中文写 name 和 there。

只输出 JSON：{"conditions":[{"name":"…","there":"…","query":"…"}],"precedentQuery":"…"}`;

export function parseTransferPlan(value: unknown): TransferPlan {
  const v = (value ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(v.conditions) ? v.conditions : [];
  const conditions = raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({
      name: typeof c.name === "string" ? c.name.trim().slice(0, 30) : "",
      there: typeof c.there === "string" ? c.there.trim() : "",
      query: typeof c.query === "string" ? c.query.trim().slice(0, 120) : "",
    }))
    .filter((c) => c.name && c.there && c.query)
    .slice(0, MAX_TRANSFER_CONDITIONS);
  if (conditions.length === 0) throw new Error("一个条件都没列出来");
  const texts = conditions.flatMap((c) => [c.name, c.there]);
  assertNoBanned(texts);
  assertChineseAllowingNames(texts);
  return { conditions, precedentQuery: typeof v.precedentQuery === "string" ? v.precedentQuery.trim().slice(0, 120) : "" };
}

/** 它在那边做成靠哪几个条件，以及查这边情况用的搜索词。 */
export async function planTransferConditions(input: {
  headline: string;
  background: string;
  hereNow: string;
  there: string;
  here: string;
}): Promise<TransferPlan> {
  const contents = [`${input.there}那边：${input.headline}`, input.background, `${input.here}这边现在：${input.hereNow}`].join("\n");
  return executeAiJson(
    { operation: "gap_transfer_plan", module: "unknown", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents: contents + (attempt === 1 ? "\n\n上一次输出没通过校验（缺字段、空话，或没用中文）。严格按 JSON 字段重写。" : ""),
      config: {
        systemInstruction: transferPlanPrompt(input.there, input.here),
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 1024 },
        maxOutputTokens: 3000,
      },
    }),
    parseTransferPlan
  );
}

const transferJudgePrompt = (here: string) => `你在看一样东西能不能搬到${here}。下面每个条件附了上网搜到的、关于${here}现在情况的资料；最后附了"有没有人试过把它带到${here}"的资料。

每个条件输出：
- i：编号。
- here：${here}现在这一条怎样，一句，只写资料里有的。
- holds："yes"（这一条在${here}也成立）/"no"（不成立，要搬过来得先解决它）/"unclear"（资料说不清）。
- basis：支撑 here 的资料原文，逐字照抄（不翻译、不改字，15 到 150 字），附这个条件下面的资料编号 source。资料里没有就给空数组，holds 写 "unclear"。
再写 precedent：先例资料里有人试过把它带到${here}的话，写 {"text":"谁、什么时候试的、结果怎样，一句","basis":[{"source":资料编号,"excerpt":"逐字原文"}]}；没有就给 null。

不要打分，不要下"值得做 / 不值得做"的结论 —— 只把每个条件说清楚。叙述用简体中文（basis 照抄原文）。

只输出 JSON：{"items":[{"i":0,"here":"…","holds":"no","basis":[{"source":1,"excerpt":"…"}]}],"precedent":null}`;

function verifiedBasis(raw: unknown, sources: SearchSource[]): { url: string; title: string; excerpt: string }[] {
  const squash = (t: string) => t.replace(/\s+/g, "");
  return (Array.isArray(raw) ? raw : [])
    .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
    .map((b) => {
      const src = sources[(typeof b.source === "number" ? b.source : Number(b.source)) - 1];
      const excerpt = typeof b.excerpt === "string" ? b.excerpt.trim() : "";
      if (!src || squash(excerpt).length < 8 || !squash(src.content).includes(squash(excerpt))) return null;
      return { url: src.url, title: src.title, excerpt: excerpt.slice(0, 300) };
    })
    .filter((b): b is { url: string; title: string; excerpt: string } => b !== null)
    .slice(0, 2);
}

/** 拿不出对得上的原文，就不许说成立或不成立（一律说不清）；先例同理，没原文就当没查到。 */
export function parseTransferJudgment(
  value: unknown,
  inputs: { condition: TransferPlan["conditions"][number]; sources: SearchSource[] }[],
  precedentSources: SearchSource[]
): TransferJudgment {
  const v = (value ?? {}) as Record<string, unknown>;
  const items = Array.isArray(v.items) ? v.items : [];
  const conditions = inputs.map(({ condition, sources }, i): TransferCondition => {
    const it = items.find((r) => r && typeof r === "object" && Number((r as Record<string, unknown>).i) === i) as Record<string, unknown> | undefined;
    const basis = verifiedBasis(it?.basis, sources);
    const here = typeof it?.here === "string" ? it.here.trim() : "";
    if (basis.length === 0 || !here) {
      return { name: condition.name, there: condition.there, here: "没查到这边的情况。", holds: "unclear", basis: [] };
    }
    const holds = it?.holds === "yes" || it?.holds === "no" ? it.holds : "unclear";
    return { name: condition.name, there: condition.there, here, holds, basis };
  });
  const p = v.precedent as Record<string, unknown> | null | undefined;
  const precedentBasis = p ? verifiedBasis(p.basis, precedentSources) : [];
  const precedentText = p && typeof p.text === "string" ? p.text.trim() : "";
  const precedent = precedentText && precedentBasis.length > 0 ? { text: precedentText, basis: precedentBasis } : null;
  const texts = [...conditions.map((c) => c.here), precedent?.text ?? ""].filter(Boolean);
  assertNoBanned(texts);
  assertChineseAllowingNames(texts);
  return { conditions, precedent };
}

export async function judgeTransferConditions(
  inputs: { condition: TransferPlan["conditions"][number]; sources: SearchSource[] }[],
  precedentSources: SearchSource[],
  here: string
): Promise<TransferJudgment> {
  const block = (sources: SearchSource[]) =>
    sources.length > 0
      ? sources.map((src, j) => `  [资料 ${j + 1}] ${src.title}\n  ${src.url}\n  ${src.content.slice(0, 1000)}`).join("\n")
      : "  （没搜到资料）";
  const contents = [
    ...inputs.map(({ condition, sources }, i) => `【${i}】${condition.name}（那边：${condition.there}）\n${block(sources)}`),
    `【先例】\n${block(precedentSources)}`,
  ].join("\n\n");
  return executeAiJson(
    { operation: "gap_transfer_judge", module: "unknown", outputMode: "json", timeoutMs: 40_000 },
    (attempt) => ({
      model: MODEL,
      contents: contents + (attempt === 1 ? "\n\n上一次输出没通过校验。basis 必须逐字照抄那个条件下面资料的原文，source 是资料编号。" : ""),
      config: {
        systemInstruction: transferJudgePrompt(here),
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 3000,
      },
    }),
    (value) => parseTransferJudgment(value, inputs, precedentSources)
  );
}

// ── 历史题：答完马上知道对错 ───────────────────────────────────────────────

/** 历史题的期限至少在多少天以前（结果早就揭晓、网上查得到）。 */
const DRILL_SETTLED_DAYS = 180;

export type DrillDraft = {
  /** 像"他最近在看的事"里的哪一件（序号）；对不上时为 -1。 */
  topic: number;
  /** 问题问的是谁（公司或机构名）。题面里必须讲到它当时的情况，不然只能靠猜。 */
  subject: string;
  /** 题面里"现在"是哪年哪月（YYYY-MM）。 */
  asOf: string;
  setup: string;
  question: string;
  /** 怎么才算"会"：一句具体的标准。标准说不清，代码判对错就不公平。 */
  criterion: string;
  /** 问题里的期限（YYYY-MM-DD）。 */
  deadline: string;
  /** 实际结果：true 是"会"。 */
  answer: boolean;
  whatHappened: string;
  whySimilar: string;
  query: string;
  /** 英文搜索词：英文资料（维基百科、外媒）常常写得更全，两种语言各搜一次。 */
  queryEn: string;
  /** 揭晓后问他的：今天那件事会不会也这样（同一个机制，几个月内能检验）。topic 对不上时为空。 */
  todayQuestion: string;
};

function drillCutoff(today: string): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) - DRILL_SETTLED_DAYS * 86_400_000).toISOString().slice(0, 10);
}

const drillPrompt = (today: string) => `他在练"读新闻、下判断"。真实的判断要等几个月才对账，反馈太慢；你来出几道"历史题"：
挑过去真实发生过、结果早已揭晓的事，把他放回当时，只告诉他当时知道的东西，让他猜后来怎样，答完马上揭晓。

今天是 ${today}。出 4 道，每道都和下面"他最近在看的事"里的某一件像（同一类机制、同一个行业，或同一种局面）。

答案要能在网上查到原话，所以挑结果被明确报道过的事：某公司宣布了什么、开始或停止了什么服务、撤出了哪个市场、
某个法案通过没有、某个价格调了没有、某个数字（官方公布的）过没过某条线。
不要出"市场反应如何""影响大不大"这种说不清的题，也不要用没人公布过的数字当门槛。

每道写：
- topic：像的是哪一件（序号）。
- subject：问题问的是谁（一家公司或一个机构的名字）。setup 和 question 里都要原样出现这个名字。
- asOf：题面里的"现在"，YYYY-MM。
- setup：以"现在是某年某月。"开头，2 到 4 句，讲 subject 在那个时候的情况（还可以带上相关的对手、政策），带具体的事实。
  只写那个时候已经知道的，不许透露后来怎样，不要用"后来""最终""结果"这种词。
  讲的必须是问题问的那家：问谷歌会不会做什么，就讲谷歌当时在做什么，不能只讲苹果。
- question：一个只能答"会"或"不会"的问题，句式"到某年某月底，subject 会不会……？"。
  期限在 asOf 之后 2 到 24 个月，而且早于 ${drillCutoff(today)}（结果早就揭晓了）。
- criterion：怎么才算"会"，一句，具体到拿着新闻一看就能判（例："正式发布并开放给普通用户用才算；只宣布计划、只给开发者测试不算"）。
- deadline：问题里那个期限，YYYY-MM-DD（那个月的最后一天）。
- answer：实际结果，true 是"会"，false 是"不会"。
- whatHappened：实际发生了什么，1 到 2 句，带日期和数字。
- whySimilar：和他在看的那件事像在哪、不像在哪，一句。
- query：上网核实"实际发生了什么"用的搜索词，用事情发生地的语言，3 到 8 个词，带公司名、年份和结果的关键词（"撤退""突破""可決"……）。
- queryEn：同一件事的英文搜索词。
- todayQuestion：回到今天 —— topic 那件事，会不会也像这道历史题那样？写一个"到某年某月底，……会不会……？"的问题，
  和历史题是同一个机制，对象换成今天那件事里的人或公司，期限在今天之后 1 到 6 个月。topic 对不上就写空字符串。

铁律：
- 只出你很确定真实发生过的事。拿不准的不要出 —— 出了也会被核实刷掉。
- 不要选结果人人都知道的大事（疫情、雷曼破产、东日本大地震这一类），也不要出从题面就猜得到答案的题。
- 四道里两道答案是"会"、两道是"不会"。只出"发生过的事"的话，一直答"会"就能对一大半，练不到判断。
- 用中文写（公司名、产品名可以保留原文）。

只输出 JSON：{"drills":[{"topic":0,"subject":"…","asOf":"2023-03","setup":"现在是2023年3月。…","question":"…","criterion":"…","deadline":"2023-12-31","answer":true,"whatHappened":"…","whySimilar":"…","query":"…","queryEn":"…","todayQuestion":"…"}]}`;

/** 透露了结果的题面不要：答案写在题里就不是练判断了。 */
const DRILL_LEAK = /后来|最终|最后|结果是|事后/;

/** 题面的"现在"到期限隔几个月：太近没东西可判，太远中间变数太多、题面又没交代。 */
const DRILL_MIN_MONTHS = 2;
const DRILL_MAX_MONTHS = 24;

function monthsBetween(asOf: string, deadline: string): number {
  const [y1, m1] = asOf.split("-").map(Number);
  const [y2, m2] = deadline.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

export function parseDrillDrafts(value: unknown, topicCount: number, today: string): DrillDraft[] {
  const raw = (value as { drills?: unknown } | null)?.drills;
  if (!Array.isArray(raw)) throw new Error("缺少 drills");
  const cutoff = drillCutoff(today);
  const out: DrillDraft[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const v = r as Record<string, unknown>;
    const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string).trim() : "");
    const [subject, asOf, setup, question, criterion, deadline, whatHappened, whySimilar, query, queryEn, todayQuestion] = [
      "subject",
      "asOf",
      "setup",
      "question",
      "criterion",
      "deadline",
      "whatHappened",
      "whySimilar",
      "query",
      "queryEn",
      "todayQuestion",
    ].map(str);
    if (!subject || !setup || !question || !criterion || !whatHappened || !query || typeof v.answer !== "boolean") continue;
    // 期限要是真日期、而且早就过了；题面不许漏答案
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || Number.isNaN(Date.parse(deadline)) || deadline >= cutoff) continue;
    if (DRILL_LEAK.test(setup) || DRILL_LEAK.test(question) || DRILL_LEAK.test(criterion)) continue;
    // 题面要讲问的那一家（只讲苹果、问谷歌，就只能靠猜），而且交代"现在"是什么时候
    if (!setup.includes(subject) || !question.includes(subject) || !setup.startsWith("现在是")) continue;
    if (!/^\d{4}-\d{2}$/.test(asOf)) continue;
    const gap = monthsBetween(asOf, deadline);
    if (gap < DRILL_MIN_MONTHS || gap > DRILL_MAX_MONTHS) continue;
    const topic = typeof v.topic === "number" && Number.isInteger(v.topic) && v.topic >= 0 && v.topic < topicCount ? v.topic : -1;
    out.push({
      topic,
      subject,
      asOf,
      setup,
      question,
      criterion,
      deadline,
      answer: v.answer,
      whatHappened,
      whySimilar,
      query: query.slice(0, 120),
      queryEn: queryEn.slice(0, 120),
      // 对不上"他在看的事"的，没有今天那件事可问
      todayQuestion: topic >= 0 ? todayQuestion : "",
    });
  }
  const texts = out.flatMap((d) => [d.setup, d.question, d.criterion, d.whatHappened, d.whySimilar, d.todayQuestion].filter(Boolean));
  assertNoBanned(texts);
  assertChineseAllowingNames(texts);
  return out;
}

/** 出三道历史题（还没核实）。topics 是他最近在看的事（新闻标题、在追的问题）。 */
export async function draftHistoryDrills(topics: string[], today: string): Promise<DrillDraft[]> {
  const contents = `他最近在看的事：\n${topics.map((t, i) => `[${i}] ${t}`).join("\n")}`;
  return executeAiJson(
    { operation: "signal_history_drills", module: "unknown", outputMode: "json", timeoutMs: 40_000 },
    (attempt) => ({
      model: MODEL,
      contents: contents + (attempt === 1 ? "\n\n上一次输出没通过校验（缺字段、期限不够早、题面漏了结果，或没用中文）。严格按要求重写。" : ""),
      config: {
        systemInstruction: drillPrompt(today),
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 1024 },
        maxOutputTokens: 5000,
      },
    }),
    (value) => parseDrillDrafts(value, topics.length, today)
  );
}

export type CheckedDrill = DrillDraft & {
  check: AnalogCheck;
  /** 实际是哪一两件事决定了结果：只取资料里明确写到的原因，原文由代码核对；资料没写原因就没有。 */
  decidedBy?: { text: string; basis: { url: string; title: string; excerpt: string }[] };
};

const DRILL_CHECK_PROMPT = `你在核实几道"历史题"的答案。每道下面附了上网搜到的资料。

每道输出：
- i：编号。
- status：
  "supported"：资料能支撑"实际发生了什么"和答案（会 / 不会）。
  "corrected"：资料和它记的**相互矛盾**（比如它说"会"，资料里明明没有发生）。
  "unverified"：资料和这件事对不上，或者说不清。资料里没提到不等于没发生 —— 这种情况用 unverified。
  "ambiguous"：按题目给的标准（criterion），资料里的事算不算"会"说不清 —— 换一种理解答案就反过来。这种题不公平，用 ambiguous。
判"会 / 不会"一律按 criterion 来，不按你自己的理解。
- answer：corrected 时写按资料改正后的答案（true / false）；其余照抄原来的。
- whatHappened：corrected 时写按资料改正后的"实际发生了什么"；其余照抄原来的。
- correction：只有 corrected 时写，一句话："原来说 X，资料里是 Y"。
- basis：支撑或改正它的资料原文，逐字照抄（不翻译、不改字，每句 15 到 150 字），附资料编号 source。unverified 时给空数组。
- decidedBy：实际是哪一两件事决定了这个结果，1 到 2 句。只写资料里明确写到的原因（"因为……""由于……""理由是……"、当事人自己说的原因），
  资料里没写原因就写空字符串 —— 不许自己推因果。
- decidedBasis：写着这个原因的资料原文，逐字照抄，附资料编号 source。decidedBy 为空时给空数组。

叙述用简体中文（basis 照抄原文）。不要编资料里没有的事实。

只输出 JSON：{"items":[{"i":0,"status":"supported","answer":true,"whatHappened":"…","correction":"","basis":[{"source":1,"excerpt":"…"}],"decidedBy":"…","decidedBasis":[{"source":1,"excerpt":"…"}]}]}`;

/** 原文必须逐字在那一道自己的资料里；拿不出对得上的原文就算没核实（返回里不带这一道）。 */
export function parseDrillChecks(value: unknown, inputs: { draft: DrillDraft; sources: SearchSource[] }[]): CheckedDrill[] {
  const raw = (value as { items?: unknown } | null)?.items;
  if (!Array.isArray(raw)) throw new Error("缺少 items");
  const squash = (t: string) => t.replace(/\s+/g, "");
  const out: CheckedDrill[] = [];
  inputs.forEach(({ draft, sources }, i) => {
    const it = raw.find((r) => r && typeof r === "object" && Number((r as Record<string, unknown>).i) === i) as Record<string, unknown> | undefined;
    if (!it || (it.status !== "supported" && it.status !== "corrected")) return;
    const basis = (Array.isArray(it.basis) ? it.basis : [])
      .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
      .map((b) => {
        const src = sources[(typeof b.source === "number" ? b.source : Number(b.source)) - 1];
        const excerpt = typeof b.excerpt === "string" ? b.excerpt.trim() : "";
        if (!src || squash(excerpt).length < 8 || !squash(src.content).includes(squash(excerpt))) return null;
        return { url: src.url, title: src.title, excerpt: excerpt.slice(0, 300) };
      })
      .filter((b): b is { url: string; title: string; excerpt: string } => b !== null)
      .slice(0, 3);
    if (basis.length === 0) return;
    // 原因也要有对得上的原文，不然就是 AI 自己推的因果，宁可不写
    const decidedText = typeof it.decidedBy === "string" ? it.decidedBy.trim() : "";
    const decidedBasis = verifiedBasis(it.decidedBasis, sources);
    const decided = decidedText && decidedBasis.length > 0 ? { decidedBy: { text: decidedText, basis: decidedBasis } } : {};
    if (it.status === "corrected") {
      const correction = typeof it.correction === "string" ? it.correction.trim() : "";
      const whatHappened = typeof it.whatHappened === "string" ? it.whatHappened.trim() : "";
      if (!correction || !whatHappened || typeof it.answer !== "boolean") return;
      out.push({ ...draft, answer: it.answer, whatHappened, check: { status: "corrected", correction, basis }, ...decided });
      return;
    }
    out.push({ ...draft, check: { status: "supported", basis }, ...decided });
  });
  assertNoBanned(out.flatMap((d) => [d.whatHappened, d.check.correction ?? "", d.decidedBy?.text ?? ""]).filter(Boolean));
  return out;
}

/**
 * 他标完"理由对上没有"之后，裁判独立判一次：他当时写的理由，和资料里写明的实际原因，是不是同一回事。
 * 只提名、不改他标的。门槛 0.5；裁判不可用返回 null（页面上就不显示这一行）。
 */
const REASON_MATCH_ABOVE = 0.5;

export async function judgeReasonMatch(input: { question: string; reasoning: string; decidedBy: string }): Promise<boolean | null> {
  try {
    return await executeJev(
      { operation: "drill_reason_judge", module: "unknown", timeoutMs: 20_000 },
      {
        state: `问题：${input.question}\n他当时的理由：${input.reasoning}\n实际决定结果的原因（资料里写明的）：${input.decidedBy}`,
        questions: {
          match: {
            type: "score",
            instructions: "他当时的理由，抓住的是不是实际决定结果的那个原因？只是同一个大方向、或者碰巧指向同一个结论但说的是别的原因，算没抓住。",
            criteria: ["没抓住：他的理由不是实际起作用的那个原因", "抓住了：他的理由就是实际起作用的那个原因"],
          },
        },
      },
      (result) => secondOption(result.answers.match) > REASON_MATCH_ABOVE
    );
  } catch (e) {
    console.error("reason match judge failed", e);
    return null;
  }
}

export async function checkHistoryDrills(inputs: { draft: DrillDraft; sources: SearchSource[] }[]): Promise<CheckedDrill[]> {
  const usable = inputs.filter((x) => x.sources.length > 0);
  if (usable.length === 0) return [];
  const blocks = usable
    .map(({ draft, sources }, i) =>
      [
        `【${i}】${draft.setup}\n问题：${draft.question}\n怎么才算会：${draft.criterion}\n它记的答案：${draft.answer ? "会" : "不会"}\n它记的实际情况：${draft.whatHappened}`,
        sources.map((src, j) => `  [资料 ${j + 1}] ${src.title}\n  ${src.url}\n  ${src.content.slice(0, 1200)}`).join("\n"),
      ].join("\n")
    )
    .join("\n\n");
  return executeAiJson(
    { operation: "signal_history_drill_check", module: "unknown", outputMode: "json", timeoutMs: 40_000 },
    (attempt) => ({
      model: MODEL,
      contents: blocks + (attempt === 1 ? "\n\n上一次输出没通过校验。basis 必须逐字照抄那一道下面资料的原文，source 是资料编号。" : ""),
      config: {
        systemInstruction: DRILL_CHECK_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 3000,
      },
    }),
    (value) => parseDrillChecks(value, usable)
  );
}

// ── 到期对账：先查现在实际怎样 ─────────────────────────────────────────────

const OUTCOME_QUERY_PROMPT = `他之前读新闻时写下了一个判断，现在到期了，要对账。先上网查这件事现在实际怎样了。
写两个搜索词，用日文或英文（看这件事主要在哪个国家），3 到 8 个词，具体到对象和动作，带上年份或年月：
- query：找"这件事后来怎样了"的最新消息（结果、公告、数字）。
- counterQuery：找和他的判断相反的结果 —— 他说会发生，就找"没有发生 / 推迟 / 撤回"；他说不会，就找"已经发生了"。
只照搜索词的写法写，不要写成一句话。

只输出 JSON：{"query":"…","counterQuery":"…"}`;

export function parseOutcomeQueries(value: unknown): { query: string; counterQuery: string } {
  const v = (value ?? {}) as Record<string, unknown>;
  const query = typeof v.query === "string" ? v.query.trim().slice(0, 120) : "";
  const counterQuery = typeof v.counterQuery === "string" ? v.counterQuery.trim().slice(0, 120) : "";
  if (!query) throw new Error("缺少 query");
  return { query, counterQuery };
}

/** 到期的判断：查"后来怎样了"和"反过来的结果"的两个搜索词。 */
export async function planOutcomeQueries(input: {
  newsTitle: string;
  question: string;
  judgment: string;
  madeOn: string;
  dueOn: string;
}): Promise<{ query: string; counterQuery: string }> {
  const contents = [
    `当时读的新闻：${input.newsTitle}`,
    `问题：${input.question}`,
    `他的判断（${input.madeOn} 写的，${input.dueOn} 到期）：${input.judgment}`,
  ].join("\n");
  return executeAiJson(
    { operation: "judgment_outcome_queries", module: "unknown", outputMode: "json", timeoutMs: 15_000 },
    () => ({
      model: MODEL,
      contents,
      config: {
        systemInstruction: OUTCOME_QUERY_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 300,
      },
    }),
    parseOutcomeQueries
  );
}

// ── 每日报告第二步：读正文重写 ───────────────────────────────────────────

/**
 * 第一步只看标题和一两句简介挑出 5 条、起草；第二步只给这 5 条去抓正文，按正文重写"来龙去脉"。
 * 每条要附原文依据（逐字摘录），代码核对确实在正文里 —— 不然背景里的数字、日期、名字
 * 就是 AI 凭记忆补的，补错了读的人也分不出来。
 */
export type GroundInput = {
  index: number;
  title: string;
  summary: string;
  /** 正文（新闻）或 README（工具）。拿不到就是空串，这条不重写。 */
  body: string;
  draft: { headline: string; background: string; forYou: string };
};

export type GroundedPick = {
  index: number;
  headline: string;
  background: string;
  forYou: string;
  /** 代码核对过、确实在正文里的原文依据。 */
  basis: string[];
};

const GROUND_PROMPT = `你在改写一份每日报告。之前只看了标题和一两句简介就起了草稿，现在给你这几条的正文。
按正文重写每一条：

- headline：一句话说发生了什么。
- background：为什么重要、来龙去脉，3 到 4 句。里面的具体事实（数字、日期、人名、公司名、地名）必须是正文里写了的；
  正文没写的不要补，草稿里有、正文里没有的事实要删掉。可以用一两句常识帮人看懂，但不要编具体数字和日期。
- forYou：照草稿的意思写（主要影响谁 / 可以找谁聊 / 可以拿它试什么），一到两句，有正文依据更好。
- basis：1 到 3 句正文原文，逐字照抄（不翻译、不改字，每句 15 到 120 字），是 background 里事实的出处。

另外按重写后的内容写 overview：开头的一段总述，3 到 5 句，第一句直接说最重要的那件事，只用这几条里出现过的事实。

${SIGNAL_SHARED_RULES}

只输出 JSON：{"overview":"…","items":[{"index":序号,"headline":"…","background":"…","forYou":"…","basis":["…"]}]}`;

/** 只收正文里真有依据的；没有一句依据对得上的条目丢掉（调用方保留草稿并标注）。 */
export function parseGroundedBrief(
  value: unknown,
  inputs: GroundInput[]
): { overview: string; items: GroundedPick[] } {
  if (!value || typeof value !== "object") throw new Error("输出不是对象");
  const v = value as Record<string, unknown>;
  const overview = dropFillerSentences(requireString(v, "overview"));
  const raw = Array.isArray(v.items) ? v.items : [];
  const squash = (t: string) => t.replace(/\s+/g, "");
  const byIndex = new Map(inputs.map((i) => [i.index, i]));
  const items: GroundedPick[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const it = r as Record<string, unknown>;
    const index = typeof it.index === "number" ? it.index : Number(it.index);
    const input = byIndex.get(index);
    if (!input || !input.body || items.some((x) => x.index === index)) continue;
    const body = squash(input.body);
    const basis = (Array.isArray(it.basis) ? it.basis : [])
      .filter((b): b is string => typeof b === "string")
      .map((b) => b.trim())
      .filter((b) => squash(b).length >= 8 && body.includes(squash(b)))
      .slice(0, 3);
    if (basis.length === 0) continue;
    items.push({
      index,
      headline: requireString(it, "headline"),
      background: requireString(it, "background"),
      forYou: requireString(it, "forYou"),
      basis: basis.map((b) => b.slice(0, 200)),
    });
  }
  const texts = [overview, ...items.flatMap((i) => [i.headline, i.background, i.forYou])];
  assertNoBanned(texts);
  assertChinese(texts);
  return { overview, items };
}

export async function groundBrief(
  inputs: GroundInput[],
  /** 世界、一线、掏钱三节：重写总述时也要保留"最后一句点出机会来源"。 */
  lens = false
): Promise<{ overview: string; items: GroundedPick[] }> {
  const withBody = inputs.filter((i) => i.body);
  if (withBody.length === 0) return { overview: "", items: [] };
  const blocks = inputs
    .map((i) =>
      [
        `【${i.index}】${i.title}`,
        `草稿：${i.draft.headline}｜${i.draft.background}｜${i.draft.forYou}`,
        i.body ? `正文：${i.body.slice(0, 2500)}` : `（拿不到正文，这条照草稿保留，不用写进 items）`,
      ].join("\n")
    )
    .join("\n\n");
  return executeAiJson(
    { operation: "brief_ground", module: "unknown", outputMode: "json", timeoutMs: 50_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        blocks +
        (attempt === 1
          ? "\n\n上一次输出没通过校验。basis 必须逐字照抄正文原文；背景只用正文里有的事实；用中文写。"
          : ""),
      config: {
        systemInstruction: lens ? `${GROUND_PROMPT}\n\n${OVERVIEW_LENS}` : GROUND_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 5000,
      },
    }),
    (value) => parseGroundedBrief(value, inputs)
  );
}

// ── 历史参照：上网逐条核实 ─────────────────────────────────────────────────

const ANALOG_CHECK_PROMPT = `你在核实一份"历史上类似的事"。每一次参照下面附了几篇上网搜到的资料。
逐条核对，重点核对"后来怎样"（after）—— 这是最重要、也最容易记错的部分。

每一次参照输出：
- i：参照的编号。
- status：
  "supported"：资料里能找到支撑（时间、发生了什么、后来怎样大体对得上）。
  "corrected"：只有参照里写的某个事实和资料**相互矛盾**时才用（年份不对、数字不对、结果正好相反）。按资料改正 when / what / after。
    资料只是比参照多讲了一些细节、或者参照没写某个细节 —— 这不算矛盾，一律用 "supported"。宁可少用 corrected。
    资料讲的是另一次同类的事（比如另一年的加息）—— 那不是改正，是搜错了，用 "unverified"，不要把两件事拼在一起。
  "unverified"：资料里找不到能支撑它的内容。
- when / what / after：supported 时照抄原来的；corrected 时写改正后的；unverified 时照抄原来的。
  when 只写时间（如 "2006 年 7 月"），不要把发生了什么也塞进去。
- correction：只有 corrected 时写，一句话点出矛盾："原来写的是 X，资料里是 Y"（X 和 Y 必须是互相冲突的两个说法）。
- basis：支撑或改正它的资料原文，逐字照抄（不翻译、不改字，每句 15 到 150 字），附资料编号 source。unverified 时给空数组。

另外写 baseRate：只用 supported 和 corrected 的那几次（古代的不算），两到三句归纳"这类事通常会怎样"。
一次都没有就写"这次的参照都没查到出处，下面只能当线索，不能当基准。"

一律用简体中文写（basis 照抄原文，不用翻译）。不要编资料里没有的事实。

只输出 JSON：{"analogs":[{"i":0,"status":"supported","when":"…","what":"…","after":"…","correction":"","basis":[{"source":1,"excerpt":"…"}]}],"baseRate":"…"}`;

export type AnalogSources = { analog: HistoricalAnalog; sources: SearchSource[] };

/** 两个时间里第一个四位年份相差几年；任意一边没有年份就当 0。 */
export function yearShift(a: string, b: string): number {
  const year = (t: string) => Number(t.match(/(1[0-9]|20)\d{2}/)?.[0] ?? NaN);
  const x = year(a);
  const y = year(b);
  return Number.isFinite(x) && Number.isFinite(y) ? Math.abs(x - y) : 0;
}

/**
 * 原文必须逐字出现在对应参照自己的那几篇资料里，否则不算。
 * 说"查到了"或"改正了"却拿不出一句对得上的原文，降成 unverified，内容退回 AI 原来写的。
 */
export function parseAnalogChecks(
  value: unknown,
  inputs: AnalogSources[]
): { analogs: HistoricalAnalog[]; baseRate: string } {
  if (!value || typeof value !== "object") throw new Error("输出不是对象");
  const v = value as Record<string, unknown>;
  const baseRate = requireString(v, "baseRate");
  const raw = Array.isArray(v.analogs) ? v.analogs : [];
  const squash = (t: string) => t.replace(/\s+/g, "");
  const byI = new Map<number, Record<string, unknown>>();
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const it = r as Record<string, unknown>;
    const i = typeof it.i === "number" ? it.i : Number(it.i);
    if (Number.isInteger(i) && !byI.has(i)) byI.set(i, it);
  }
  const analogs = inputs.map(({ analog, sources }, i): HistoricalAnalog => {
    const it = byI.get(i);
    const status = it?.status;
    const basis = (Array.isArray(it?.basis) ? (it?.basis as unknown[]) : [])
      .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
      .map((b) => {
        const src = sources[(typeof b.source === "number" ? b.source : Number(b.source)) - 1];
        const excerpt = typeof b.excerpt === "string" ? b.excerpt.trim() : "";
        if (!src || squash(excerpt).length < 8 || !squash(src.content).includes(squash(excerpt))) return null;
        return { url: src.url, title: src.title, excerpt: excerpt.slice(0, 300) };
      })
      .filter((b): b is { url: string; title: string; excerpt: string } => b !== null)
      .slice(0, 3);
    const unverified: HistoricalAnalog = { ...analog, check: { status: "unverified", basis: [] } };
    if (!it || basis.length === 0 || (status !== "supported" && status !== "corrected")) return unverified;
    if (status === "corrected") {
      const correction = typeof it.correction === "string" ? it.correction.trim() : "";
      const pick = (val: unknown, orig: string, max = 400) =>
        typeof val === "string" && val.trim() && val.trim().length <= max ? val.trim() : orig;
      // when 只放时间；超过 25 个字说明把"发生了什么"也塞进去了，保留原来的
      const when = pick(it.when, analog.when, 25);
      const what = pick(it.what, analog.what);
      const after = pick(it.after, analog.after);
      const changed = when !== analog.when || what !== analog.what || after !== analog.after;
      // 说改正了，却什么都没改（或没说哪里不一样）—— 那就是"查到出处"，不是"记错了"
      if (correction && changed) {
        // 改正前后年份差一年以上，说明换成了另一次事件（搜错了），不是记错了：退回原文、标没查到出处
        if (yearShift(analog.when, when) > 1) return unverified;
        return { ...analog, when, what, after, check: { status: "corrected", correction, basis } };
      }
    }
    return { ...analog, check: { status: "supported", basis } };
  });
  const texts = [
    baseRate,
    ...analogs.flatMap((a) => [a.what, a.after, a.check?.correction ?? ""]).filter(Boolean),
  ];
  assertNoBanned(texts);
  assertChinese(texts);
  return { analogs, baseRate };
}

export async function checkAnalogs(inputs: AnalogSources[]): Promise<{ analogs: HistoricalAnalog[]; baseRate: string }> {
  const blocks = inputs
    .map(({ analog, sources }, i) =>
      [
        `【参照 ${i}】（${analog.era === "ancient" ? "古代" : "近现代"}）${analog.when}：${analog.what}`,
        `后来：${analog.after}`,
        sources.length > 0
          ? sources.map((src, j) => `  [资料 ${j + 1}] ${src.title}\n  ${src.url}\n  ${src.content.slice(0, 1200)}`).join("\n")
          : "  （没搜到资料）",
      ].join("\n")
    )
    .join("\n\n");
  return executeAiJson(
    { operation: "history_check", module: "unknown", outputMode: "json", timeoutMs: 50_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        blocks +
        (attempt === 1
          ? "\n\n上一次输出没通过校验。basis 必须逐字照抄对应参照下面那几篇资料的原文，source 是资料编号；叙述用中文。"
          : ""),
      config: {
        systemInstruction: ANALOG_CHECK_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 4000,
      },
    }),
    (value) => parseAnalogChecks(value, inputs)
  );
}

// ── 问题驱动：他带着问题，AI 分头去查 ───────────────────────────────────────
// 借鉴 GPT Researcher（先把问题拆成几个小问题，分头查）和 Metaculus forecasting-tools（列出决定结果的关键因素）。
// 不打分：关键因素只写"现在什么情况""出现什么会变"，不给权重、不给可能性数字（原则 1）。

export type QuestionInput = {
  question: string;
  /** 怎么才算（可以为空）。 */
  criterion: string;
  /** 他现在的看法（还没写就为空）。 */
  view: string;
};

export type SubQuestionPlan = {
  /** 一个能用资料回答的小问题。 */
  question: string;
  /** 搜索词：照着问题去搜。 */
  query: string;
  /** 反方向的搜索词：专门找可能推翻他看法的资料。只照一个方向搜，搜到的几乎全是支持的。 */
  counterQuery: string;
};

const MIN_SUB_QUESTIONS = 3;
const MAX_SUB_QUESTIONS = 5;

const PLAN_PROMPT = `你帮一个人追一个他自己提的问题。先别急着回答，把它拆成 ${MIN_SUB_QUESTIONS} 到 ${MAX_SUB_QUESTIONS} 个小问题，每个小问题都要能用上网查到的资料回答。

拆的方法：
- 想想要回答这个大问题，必须先知道哪几件事（现在的情况、已经有人试过什么、卡在哪、钱和人从哪来、政策怎么管）。
- 至少一个小问题专门去找"可能推翻他看法"的东西。他还没写看法，就找"最可能让这件事不发生"的东西。
- 小问题要具体到对象，比如"TikTok Shop 在日本上线一年卖得怎样"，不要"电商的趋势如何"。

每个小问题写：
- question：一句中文的小问题。只用中文写（产品名、公司名可以保留原文，比如 TikTok Shop），不要夹日文句子。
- query：搜索词，3 到 6 个词。讲日本的事用日文，讲中国的事用中文，其他用英文。
- counterQuery：反方向的搜索词（找失败、撤退、反对、数据不好看的资料），语言规则同上。

只输出 JSON：{"subQuestions":[{"question":"…","query":"…","counterQuery":"…"}]}`;

export function parseQuestionPlan(value: unknown): SubQuestionPlan[] {
  const raw = (value as { subQuestions?: unknown } | null)?.subQuestions;
  if (!Array.isArray(raw)) throw new Error("缺少 subQuestions");
  const out: SubQuestionPlan[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const v = r as Record<string, unknown>;
    const question = typeof v.question === "string" ? v.question.trim() : "";
    const query = typeof v.query === "string" ? v.query.trim().slice(0, 120) : "";
    const counterQuery = typeof v.counterQuery === "string" ? v.counterQuery.trim().slice(0, 120) : "";
    if (!question || !query) continue;
    if (out.some((o) => o.question === question)) continue;
    out.push({ question, query, counterQuery });
  }
  if (out.length < MIN_SUB_QUESTIONS) throw new Error(`小问题不到 ${MIN_SUB_QUESTIONS} 个`);
  const result = out.slice(0, MAX_SUB_QUESTIONS);
  assertNoBanned(result.map((r) => r.question));
  assertChineseAllowingNames(result.map((r) => r.question));
  return result;
}

function questionContext(input: QuestionInput): string {
  return [
    `他的问题：${input.question}`,
    input.criterion ? `怎么才算：${input.criterion}` : "",
    input.view ? `他现在的看法：${input.view}` : "他还没写自己的看法。",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function planQuestionResearch(input: QuestionInput): Promise<SubQuestionPlan[]> {
  return executeAiJson(
    { operation: "question_plan", module: "unknown", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        questionContext(input) +
        (attempt === 1 ? `\n\n上一次输出没通过校验：小问题要有 ${MIN_SUB_QUESTIONS} 到 ${MAX_SUB_QUESTIONS} 个，用中文写，每个都要有 query。` : ""),
      config: {
        systemInstruction: PLAN_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 512 },
        maxOutputTokens: 1500,
      },
    }),
    parseQuestionPlan
  );
}

const QUESTION_EVIDENCE_PROMPT = `你帮一个人查一个小问题。给你小问题、他现在的看法（可能没有），和几篇上网搜到的资料。
从资料里抽出能回答这个小问题的**事实**，最多 ${MAX_EVIDENCE_PER_STEP} 条。

每条写：
- source：资料的编号（数字）。
- fact：用中文写一句具体的事实（谁、做了什么、什么时候、多少）。
- excerpt：资料里支撑这条事实的原文，逐字照抄，不要翻译、不要改字，30 到 120 字。
- stance：这条事实对**他现在的看法**是 "supports"（支持）、"contradicts"（反对）还是 "context"（背景）。
  他还没写看法时，一律写 "context"。

铁律：
- 只抽资料里真写了的。没写的不要补，不要推测。
- 跟小问题无关的资料直接跳过；讲的是别的国家、别的事的也跳过。一条都没有就给空数组，不要凑。
- 反对他看法的事实和支持的一样重要，看到就要抽。
- 同一件事只留一条最具体的。

只输出 JSON：{"evidence":[{"source":1,"fact":"…","excerpt":"…","stance":"context"}]}`;

/** 一个小问题的证据。来源编号和原文摘录由 parseStepEvidence 核对；没写看法时立场一律当背景。 */
export async function extractQuestionEvidence(
  subQuestion: string,
  view: string,
  sources: SearchSource[]
): Promise<StepEvidence[]> {
  if (sources.length === 0) return [];
  const blocks = sources
    .map((src, i) => `【资料 ${i + 1}】${src.title}\n${src.url}\n${src.content.slice(0, 2500)}`)
    .join("\n\n");
  const evidence = await executeAiJson(
    { operation: "question_evidence", module: "unknown", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        `小问题：${subQuestion}\n他现在的看法：${view || "（还没写）"}\n\n${blocks}` +
        (attempt === 1 ? "\n\n上一次输出没通过校验。excerpt 必须逐字照抄资料原文，source 必须是资料编号。" : ""),
      config: {
        systemInstruction: QUESTION_EVIDENCE_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 1500,
      },
    }),
    (value) => parseStepEvidence(value, sources)
  );
  return view ? evidence : evidence.map((e) => ({ ...e, stance: "context" as const }));
}

export type KeyFactor = {
  /** 决定这个问题答案的一个因素。 */
  factor: string;
  /** 这个因素现在是什么情况（只根据查到的事实）。 */
  now: string;
  /** 出现什么情况，这个因素就变了 —— 也就是"什么会让他改主意"。 */
  watch: string;
  /** 撑着 now 的那几条证据（全局编号，从 1 开始）。 */
  evidence: number[];
};

const MAX_KEY_FACTORS = 4;

const KEY_FACTORS_PROMPT = `你帮一个人追一个他自己提的问题。下面是他的问题，和 AI 分头查到的事实（每条有编号）。
找出 2 到 ${MAX_KEY_FACTORS} 个**决定这个问题答案的关键因素**。

每个因素写：
- factor：这个因素是什么，一句话（例："日本消费者信不信主播推荐的东西"）。
- now：这个因素现在是什么情况（今天的日期见材料开头，已经发生的事用过去时）。只根据下面的事实写，并在 evidence 里写出用到了哪几条（编号）。事实里没有就写"还没查到"，evidence 给空数组。
- watch：出现什么情况，这个因素就变了。要具体到能在新闻里看到（谁做了什么、哪个数字过了多少）。
- evidence：用到的事实编号。

另外写 whyNow（红杉看创业项目必问的"为什么是现在"）：这件事为什么现在会发生（或者为什么还不是时候）——
最近哪些变化让它变得可能，或者还缺什么。一到两句，只根据上面的事实；事实不够就直说还看不出来。

铁律：
- 他写了看法的话，至少一个因素要是"最可能让他看错的"。不许迎合他。
- 不许给因素打分、排权重，不许写任何可能性的百分比或"几成"。
- 不要编事实里没有的数字和公司。

只输出 JSON：{"keyFactors":[{"factor":"…","now":"…","watch":"…","evidence":[1,3]}],"whyNow":"…"}`;

export function parseKeyFactors(value: unknown, evidenceCount: number): KeyFactor[] {
  const raw = (value as { keyFactors?: unknown } | null)?.keyFactors;
  if (!Array.isArray(raw)) throw new Error("缺少 keyFactors");
  const out: KeyFactor[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const v = r as Record<string, unknown>;
    const factor = typeof v.factor === "string" ? v.factor.trim() : "";
    const now = typeof v.now === "string" ? v.now.trim() : "";
    const watch = typeof v.watch === "string" ? v.watch.trim() : "";
    if (!factor || !now || !watch) continue;
    // 编号对不上的丢掉；说了"现在怎样"却一条证据都对不上，就改成"还没查到"，不让它冒充有依据
    const evidence = (Array.isArray(v.evidence) ? v.evidence : [])
      .map((n) => (typeof n === "number" ? n : Number(n)))
      .filter((n, i, all) => Number.isInteger(n) && n >= 1 && n <= evidenceCount && all.indexOf(n) === i);
    out.push({ factor, now: evidence.length > 0 ? now : "还没查到。", watch, evidence });
  }
  if (out.length === 0) throw new Error("一个关键因素都没有");
  const result = out.slice(0, MAX_KEY_FACTORS);
  const texts = result.flatMap((f) => [f.factor, f.now, f.watch]);
  assertNoBanned(texts);
  assertChinese(texts);
  if (texts.some(mentionsNumericLikelihood)) throw new Error("写了可能性的数字");
  return result;
}

/** 关键因素那一步顺带写的"为什么是现在"；没写就是空串。 */
export function parseWhyNow(value: unknown): string {
  const v = (value as { whyNow?: unknown } | null)?.whyNow;
  const text = typeof v === "string" ? v.trim() : "";
  if (!text) return "";
  assertNoBanned([text]);
  assertChinese([text]);
  if (mentionsNumericLikelihood(text)) throw new Error("写了可能性的数字");
  return text;
}

export async function analyzeKeyFactors(
  input: QuestionInput & { facts: string[] }
): Promise<{ keyFactors: KeyFactor[]; whyNow: string }> {
  const contents = [
    `今天是 ${new Date().toISOString().slice(0, 10)}。`,
    questionContext(input),
    input.facts.length > 0 ? `查到的事实：\n${input.facts.map((f, i) => `[${i + 1}] ${f}`).join("\n")}` : "这次什么事实都没查到。",
  ].join("\n\n");
  return executeAiJson(
    { operation: "question_key_factors", module: "unknown", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1 ? "\n\n上一次输出没通过校验：每个因素都要有 factor、now、watch，用中文写，不许写可能性的数字。" : ""),
      config: {
        systemInstruction: KEY_FACTORS_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 512 },
        maxOutputTokens: 2000,
      },
    }),
    (value) => ({ keyFactors: parseKeyFactors(value, input.facts.length), whyNow: parseWhyNow(value) })
  );
}

// ── 他自己想到的类比 ───────────────────────────────────────────────────────

const USER_ANALOG_PROMPT = `他在追一个问题，自己想到了一个历史上像的事，只写了一句话。你把这一句展开成一条完整的参照，好让代码上网核实。

规则：
- 只展开他说的那一件事，不许换成另一件你觉得更像的事。他说得含糊（比如只写了"PayPay"），就按最常被提到的那一次理解。
- when：具体年份或年月。
- what：当时发生了什么，一到两句，点出主体的名字。
- after：之后几个月到几年里实际怎样了，一到两句。记不清就少写，绝不编数字。
- alike：这件事和他的问题像在哪，一句话，直接写那一点。
- unlike：不像在哪，一句话 —— 挑最可能让结果不一样的那个差别。不许空着，不许写"时代不同"这种空话。
- query：核实这件事的搜索词，具体到时间和对象。日本的事用日文，中国的事用中文，其他用英文。
- altQuery：同一件事换一种语言的搜索词：日本和中国的事用英文，欧美的事用日文。
- era：1900 年以后的写 "modern"，更早的写 "ancient"。
一律用简体中文写（搜索词除外）。

只输出 JSON：{"era":"modern","when":"…","what":"…","after":"…","alike":"…","unlike":"…","query":"…","altQuery":"…"}`;

export function parseUserAnalog(value: unknown): HistoricalAnalog {
  if (!value || typeof value !== "object") throw new Error("输出不是对象");
  const a = value as Record<string, unknown>;
  const analog: HistoricalAnalog = {
    era: a.era === "ancient" ? "ancient" : "modern",
    when: requireString(a, "when"),
    what: requireString(a, "what"),
    after: requireString(a, "after"),
    alike: trimAnalogLead(a.alike),
    unlike: trimAnalogLead(a.unlike),
    query: typeof a.query === "string" && a.query.trim() ? a.query.trim().slice(0, 120) : undefined,
    altQuery: typeof a.altQuery === "string" && a.altQuery.trim() ? a.altQuery.trim().slice(0, 120) : undefined,
    source: "user",
  };
  if (!analog.unlike) throw new Error("缺少不像的地方");
  const prose = [analog.what, analog.after, analog.alike ?? "", analog.unlike].filter(Boolean);
  assertNoBanned(prose);
  assertChineseAllowingNames(prose);
  return analog;
}

export async function expandUserAnalog(input: { question: string; userText: string }): Promise<HistoricalAnalog> {
  return executeAiJson(
    { operation: "user_analog", module: "unknown", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        `他的问题：${input.question}\n他想到的类比：${input.userText}` +
        (attempt === 1 ? "\n\n上一次输出没通过校验：每个字段都要有，unlike 不许空着，用中文写。" : ""),
      config: {
        systemInstruction: USER_ANALOG_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 1000,
      },
    }),
    parseUserAnalog
  );
}

// ── 报告认得他在追的问题 ─────────────────────────────────────────────────────

export type QuestionLink = {
  /** 报告里那一条的候选序号。 */
  index: number;
  /** 问题在传进来的列表里的位置（从 0 开始）；代码再换成问题 id，不让 AI 碰 id。 */
  question: number;
  /** 这条和那个问题怎么连上的，一句话。 */
  why: string;
};

/** 理由里出现这些说法，说明 AI 自己也知道连得勉强。 */
const WEAK_LINK = /未(明确|直接|提到|提及)|没有?(明确|直接)?(提到|提及|说明)|并未|间接|可能间接|虽然[^。]{0,20}(没|未|不是)/;

/** 一份报告最多标几条：标得多了，就没有哪条是真要紧的了。 */
const MAX_QUESTION_LINKS = 3;

const QUESTION_LINK_PROMPT = `他手上有几个自己在一直追的问题，今天的报告挑了几条新闻。
找出今天哪几条**直接关系到**他的某个问题，最多 ${MAX_QUESTION_LINKS} 条。

什么算"直接关系"：
- 这条新闻本身就是回答这个问题的一条证据（支持他的看法、或者打他的脸）；
- 或者它改变了这个问题里的一个关键条件（比如问题问"即时零售会不会普及"，新闻是"某配送公司撤出日本"）。
只是同一个大领域、沾点边的，不算；如果你要写"虽然没提到……""间接……"才能连上，那就不算。宁可一条都不标，不许硬凑 —— 硬凑的提示会让他以后不再相信这一行。

每条写：
- index：新闻的序号。
- question：问题的编号（Q 后面的数字）。
- why：一句话说清楚怎么连上的（这条讲了什么事实，对这个问题意味着什么）。不夸、不打气，不写"值得关注"。
每条新闻最多连一个问题。

只输出 JSON：{"links":[{"index":序号,"question":编号,"why":"…"}]}，一条都没有就给 {"links":[]}`;

export function parseQuestionLinks(value: unknown, pickIndexes: number[], questionCount: number): QuestionLink[] {
  const raw = (value as { links?: unknown } | null)?.links;
  if (!Array.isArray(raw)) throw new Error("缺少 links");
  const out: QuestionLink[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const v = r as Record<string, unknown>;
    const index = typeof v.index === "number" ? v.index : Number(v.index);
    const question = typeof v.question === "number" ? v.question : Number(String(v.question).replace(/^Q/i, ""));
    const why = typeof v.why === "string" ? v.why.trim() : "";
    if (!pickIndexes.includes(index) || !Number.isInteger(question) || question < 1 || question > questionCount) continue;
    // 理由里自己承认牵强（"虽然没提到物流业""间接"），就是沾边，不标
    if (!why || WEAK_LINK.test(why) || out.some((o) => o.index === index)) continue;
    out.push({ index, question: question - 1, why });
    if (out.length >= MAX_QUESTION_LINKS) break;
  }
  if (out.length > 0) {
    assertNoBanned(out.map((o) => o.why));
    assertChinese(out.map((o) => o.why));
  }
  return out;
}

export async function linkPicksToQuestions(
  picks: { index: number; headline: string; background: string }[],
  questions: { question: string; view: string }[]
): Promise<QuestionLink[]> {
  if (picks.length === 0 || questions.length === 0) return [];
  const contents = [
    "他在追的问题：",
    ...questions.map((q, i) => `[Q${i + 1}] ${q.question}${q.view ? `（他现在的看法：${q.view}）` : ""}`),
    "",
    "今天的报告：",
    ...picks.map((p) => `[${p.index}] ${p.headline}\n${p.background}`),
  ].join("\n");
  return executeAiJson(
    { operation: "brief_question_links", module: "unknown", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents: contents + (attempt === 1 ? "\n\n上一次输出没通过校验。严格按 JSON 字段重写，用中文写 why。" : ""),
      config: {
        systemInstruction: QUESTION_LINK_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 800,
      },
    }),
    (value) => parseQuestionLinks(value, picks.map((p) => p.index), questions.length)
  );
}

// ── 往下推：太泛的推论打回去写具体 ───────────────────────────────────────────

const SHARPEN_PROMPT = `下面几条推论写得太泛，到时候很难说清它算不算发生了。把每一条改写得具体，意思不变：
- 说清是谁（哪类公司、哪个行业、哪家机构，能点名就点名，拿不准就说一类具体的人或公司）、做了什么；
- 改写后，到时候能从新闻或某个数字里看出它有没有发生；
- 不许换成另一件事，不许夸大，不许写可能性的数字。
- claim 还是一句话，60 字以内；点一两个名字就够，不要把能想到的公司全列上。
同时改写 watch（怎么看出它在发生），一句话，具体到看哪类新闻、哪个数字。

只输出 JSON：{"steps":[{"i":0,"claim":"…","watch":"…"}]}，i 是原来的编号。`;

export function parseSharpened(value: unknown, count: number): { i: number; claim: string; watch: string }[] {
  const raw = (value as { steps?: unknown } | null)?.steps;
  if (!Array.isArray(raw)) throw new Error("缺少 steps");
  const out: { i: number; claim: string; watch: string }[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const v = r as Record<string, unknown>;
    const i = typeof v.i === "number" ? v.i : Number(v.i);
    const claim = typeof v.claim === "string" ? v.claim.trim() : "";
    const watch = typeof v.watch === "string" ? v.watch.trim() : "";
    if (!Number.isInteger(i) || i < 0 || i >= count || !claim || !watch || out.some((o) => o.i === i)) continue;
    out.push({ i, claim, watch });
  }
  const texts = out.flatMap((o) => [o.claim, o.watch]);
  if (texts.some(mentionsNumericLikelihood)) throw new Error("写了可能性的数字");
  assertNoBanned(texts);
  assertChinese(texts);
  return out;
}

/** 把太泛的几条改写具体（只改 claim 和 watch）。改不出来就返回空，调用方保留原样并标出来。 */
export async function sharpenSteps(input: {
  title: string;
  chain: string[];
  steps: { claim: string; watch: string }[];
}): Promise<{ i: number; claim: string; watch: string }[]> {
  if (input.steps.length === 0) return [];
  const contents = [
    `新闻：${input.title}`,
    input.chain.length > 0 ? `前面已经推到的链：\n${input.chain.map((c, i) => `${i + 1}. ${c}`).join("\n")}` : "",
    "要改写的几条：",
    ...input.steps.map((s, i) => `[${i}] ${s.claim}（怎么看出来：${s.watch}）`),
  ]
    .filter(Boolean)
    .join("\n");
  return executeAiJson(
    { operation: "inference_sharpen", module: "unknown", outputMode: "json", timeoutMs: 20_000 },
    (attempt) => ({
      model: MODEL,
      contents: contents + (attempt === 1 ? "\n\n上一次输出没通过校验。严格按 JSON 字段重写，用中文。" : ""),
      config: {
        systemInstruction: SHARPEN_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 1500,
      },
    }),
    (value) => parseSharpened(value, input.steps.length)
  );
}

// ── 今天的意外（德鲁克：没有哪个领域比意外的成功提供更丰富的创新机会） ─────────────

export type Surprise = {
  index: number;
  /** 大家原本以为会怎样。 */
  expected: string;
  /** 结果却怎样。 */
  actual: string;
  /** 材料里体现反差的原文（逐字），代码核对过。 */
  quote: string;
};

const MAX_SURPRISES = 2;

/**
 * 原文核对只能证明那件事发生了，证明不了它出乎意料 —— "原本以为"可能是 AI 自己编的预期。
 * 所以再请裁判看原文本身有没有写出反差（试过用"反而""むしろ"这类字眼来认，日文写法太多，认不全）。
 * 6 条试验里：真意外 0.95–0.99，AI 编出来的 0.38，普通新闻 0.01–0.10。门槛 0.5。
 */
const SURPRISE_ABOVE = 0.5;

const SURPRISE_PROMPT = `德鲁克说，机会最丰富的来源是"意外"：意外的成功、意外的失败、和大家原本预期反着来的结果。
大多数人看到意外会忽略它，或者觉得是例外 —— 恰恰该停下来问"为什么"。

从下面几条里找出最多 ${MAX_SURPRISES} 条真正的意外。必须是**材料本身写出了反差**：
"降价反而利润大增""原以为……结果……""市场预期……实际……""明明……却……"。
普通的增长、下跌、创新高，没有和预期对着干的，不算。宁可一条都不给。

每条写：
- index：序号。
- expected：大家原本以为会怎样，一句话、30 字以内（只写材料里有依据的预期）。直接写预期的内容，不要以"大家以为""原本以为"开头。
- actual：结果却怎样，一句话、30 字以内，不要以"结果"开头。
- quote：材料里体现反差的那句原文，逐字照抄（不翻译、不改字，10 到 120 字）。
  这句原文本身要写出反差（带着"反而""却""意外""むしろ""予想外""にもかかわらず"这类字眼）；
  原文没写出反差、只是你觉得意外的，不算。
用中文写 expected 和 actual。

只输出 JSON：{"surprises":[{"index":序号,"expected":"…","actual":"…","quote":"…"}]}，没有就给 {"surprises":[]}`;

export type SurpriseInput = { index: number; title: string; summary: string; body: string };

/** 原文必须逐字出现在这一条的标题、简介或正文里（忽略空白），对不上的丢掉。 */
export function parseSurprises(value: unknown, inputs: SurpriseInput[]): Surprise[] {
  const raw = (value as { surprises?: unknown } | null)?.surprises;
  if (!Array.isArray(raw)) throw new Error("缺少 surprises");
  const squash = (t: string) => t.replace(/\s+/g, "");
  const out: Surprise[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const v = r as Record<string, unknown>;
    const index = typeof v.index === "number" ? v.index : Number(v.index);
    const input = inputs.find((i) => i.index === index);
    const expected = typeof v.expected === "string" ? v.expected.trim() : "";
    const actual = typeof v.actual === "string" ? v.actual.trim() : "";
    const quote = typeof v.quote === "string" ? v.quote.trim() : "";
    if (!input || !expected || !actual || squash(quote).length < 6 || out.some((o) => o.index === index)) continue;
    const haystack = squash(`${input.title}${input.summary}${input.body}`);
    if (!haystack.includes(squash(quote))) continue;
    const trim = (t: string) => t.replace(/[。．.，,]+$/, "");
    out.push({ index, expected: trim(expected), actual: trim(actual), quote: quote.slice(0, 200) });
    if (out.length >= MAX_SURPRISES) break;
  }
  if (out.length > 0) {
    const texts = out.flatMap((o) => [o.expected, o.actual]);
    assertNoBanned(texts);
    assertChinese(texts);
  }
  return out;
}

/** 裁判判每段原文"有没有写出反差"的概率，只留过门槛的。缺答案的当没有。 */
export function keepJudgedSurprises(surprises: Surprise[], result: JevResult): Surprise[] {
  return surprises.filter((_, i) => secondOption(result.answers[`surprise_${i}`]) > SURPRISE_ABOVE);
}

export async function findSurprises(inputs: SurpriseInput[]): Promise<Surprise[]> {
  const candidates = await draftSurprises(inputs);
  if (candidates.length === 0) return [];
  const questions: Record<string, JevQuestion> = {};
  candidates.forEach((c, i) => {
    questions[`surprise_${i}`] = {
      type: "score",
      instructions: `原文 [${i}]「${c.quote}」本身有没有写出一个和常理或预期相反的结果（比如降价反而利润增加、看好的产品很快关掉、一直在涨的突然转跌）？只看原文写了什么，不看你自己觉不觉得意外。`,
      criteria: [
        "没有：只是陈述发生了什么，或者是意料之中的变化",
        "有：原文写出了和常理或预期相反的结果",
      ],
    };
  });
  // 裁判不可用时一条都不标：意外是要人停下来想的东西，标错了比不标糟
  return executeJev(
    { operation: "surprise_judge", module: "unknown", timeoutMs: 30_000 },
    { state: candidates.map((c, i) => `[${i}] ${c.quote}`).join("\n"), questions },
    (result) => keepJudgedSurprises(candidates, result)
  );
}

async function draftSurprises(inputs: SurpriseInput[]): Promise<Surprise[]> {
  if (inputs.length === 0) return [];
  const contents = inputs
    .map((i) => [`[${i.index}] ${i.title}`, i.summary ? `简介：${i.summary}` : "", i.body ? `正文：${i.body.slice(0, 1500)}` : ""].filter(Boolean).join("\n"))
    .join("\n\n");
  return executeAiJson(
    { operation: "brief_surprises", module: "unknown", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents: contents + (attempt === 1 ? "\n\n上一次输出没通过校验。quote 必须逐字照抄材料原文；expected 和 actual 用中文。" : ""),
      config: {
        systemInstruction: SURPRISE_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 1200,
      },
    }),
    (value) => parseSurprises(value, inputs)
  );
}

// ── 今日总览：看完五节，像一个懂行的人跟他讲几句 ─────────────────────────────────

export type DigestSectionInput = {
  title: string;
  overview: string;
  items: { signalId: string; headline: string; surprise?: boolean }[];
};

export type DailyDigest = {
  /** 4 到 6 句：今天世界上发生了什么、彼此有什么联系。 */
  summary: string;
  /** 最值得点开的几条。 */
  picks: { signalId: string; why: string }[];
  /**
   * 可以往下推的一条：AI 自己推的因果链（2 到 4 步）。总述里不许混进没检验过的因果，
   * 推出来的单独放这里、标明是推测，点进去由"往下推"那套机制（正反查证据、裁判判档）检验。
   */
  chain?: { signalId: string; steps: string[] };
};

const MAX_DIGEST_PICKS = 3;

const DIGEST_PROMPT = `你是他身边一个懂行的老同事。他今天没空把五份报告一份份看完，你看完了，用几句话跟他讲今天世界上发生了什么。

summary：4 到 6 句，像当面说话：
- 先讲今天最重要的一两件事。
- 只有真的是同一件事的不同面时才连起来讲（比如人手不足同时出现在倒产、外国司机、自助收银里）；
  不相干的事就分开说，绝不许自己推出因果或结论（"A 说明 B 比 C 更有效""这暴露了 X 和 Y 的矛盾"这类，材料里没这么说就不许写）。
- 再用一句说"钱往哪里流"和"一线的人在疼什么"有没有对上；对不上就直说对不上。
- 最后一句点出今天最值得停下来想一想的那件事（意外、或者两个方向都有可能的事）。
- 不要逐条复述，不要"今天的报告包括……"这种目录式开头，不要"值得关注""持续演进"这类空话。只用材料里有的事实。
- 每一句都要有一个具体的主体（哪家公司、哪个机构、哪个行业里的谁）和一件具体的事。
  不许用抽象的话收尾或串场："凸显了……""表明……""反映了……""日益严重""总的来看""与此同时""此外"。
  "企业 AI 预算超支，凸显了新技术应用的成熟度不足"是空话；"三分之一的企业 AI 代币预算超支，大部分没换来看得见的业务成果"才是事实。
- 宁可少写一句，也不要用一句空话把两件不相干的事粘在一起。
- 你不知道他是做什么的：不许写"你""跟你""你的工作"，不许推测他关心什么。

picks：最多 ${MAX_DIGEST_PICKS} 条最值得点开的，signalId 照抄材料里的编号，why 一句话说这条本身为什么值得点开（它讲了什么关键的事），不写"跟你"。

chain（可以不写）：如果今天有一条消息，能一步一步往下推出值得想的后果，就写出来：
- signalId：从哪一条出发（照抄编号）。
- steps：2 到 4 步，每步一句话，第一步是那条消息本身讲的事，后面每一步都要带进新的人或新的机制，不许换个说法原地打转。
- 不写可能性的数字。这是推测，页面上会标明，并让他点进去用证据检验。没有值得推的就不写 chain。

${SIGNAL_SHARED_RULES}

只输出 JSON：{"summary":"…","picks":[{"signalId":"…","why":"…"}],"chain":{"signalId":"…","steps":["…","…"]}}`;

/** 抽象收尾、串场的空话（"凸显了""总的来看"）。 */
const DIGEST_FILLER = /凸显了|凸显出|表明了|反映了|反映出|日益严重|总的来看|总体来看|总而言之|综上|共同说明|都说明了|需要重新审视|正在快速变化/;

/** 去掉写了空话的句子；全是空话就原样返回（交给上游决定要不要重写）。 */
export function dropFillerSentences(text: string): string {
  const sentences = text.match(/[^。！？]+[。！？]?/g) ?? [];
  const kept = sentences.filter((x) => x.trim() && !DIGEST_FILLER.test(x)).join("").trim();
  return kept || text;
}

export function parseDigest(value: unknown, signalIds: string[]): DailyDigest {
  if (!value || typeof value !== "object") throw new Error("输出不是对象");
  const v = value as Record<string, unknown>;
  const summary = dropFillerSentences(requireString(v, "summary"));
  const raw = Array.isArray(v.picks) ? v.picks : [];
  const picks: DailyDigest["picks"] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const p = r as Record<string, unknown>;
    const signalId = typeof p.signalId === "string" ? p.signalId.trim() : "";
    const why = typeof p.why === "string" ? p.why.trim() : "";
    if (!signalIds.includes(signalId) || !why || picks.some((x) => x.signalId === signalId)) continue;
    picks.push({ signalId, why });
    if (picks.length >= MAX_DIGEST_PICKS) break;
  }
  const texts = [summary, ...picks.map((p) => p.why)];
  assertNoBanned(texts);
  assertChinese(texts);
  // 写总览的模型没看过任何关于他的信息，一写"你"就是编的
  if (texts.some((t) => /跟你|你的|你做|你平时|你可以/.test(t))) throw new Error("总览里编了跟他的关系");
  return { summary, picks, ...parseDigestChain(v.chain, signalIds) };
}

/** 往下推的那条链：出发的编号要对得上，2 到 4 步，不许写可能性数字和"跟你"；不合格就当没写。 */
export function parseDigestChain(raw: unknown, signalIds: string[]): { chain?: DailyDigest["chain"] } {
  if (!raw || typeof raw !== "object") return {};
  const v = raw as Record<string, unknown>;
  const signalId = typeof v.signalId === "string" ? v.signalId.trim() : "";
  const steps = (Array.isArray(v.steps) ? v.steps : [])
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, 4);
  if (!signalIds.includes(signalId) || steps.length < 2) return {};
  if (steps.some((s) => mentionsNumericLikelihood(s) || /跟你|你的|你做/.test(s))) return {};
  try {
    assertNoBanned(steps);
    assertChinese(steps);
  } catch {
    return {};
  }
  return { chain: { signalId, steps } };
}

export async function writeDailyDigest(sections: DigestSectionInput[]): Promise<DailyDigest> {
  const usable = sections.filter((s) => s.items.length > 0);
  if (usable.length === 0) throw new Error("今天的报告还没生成");
  const contents = usable
    .map((s) =>
      [
        `【${s.title}】`,
        s.overview ? `总述：${s.overview}` : "",
        ...s.items.map((i) => `- (${i.signalId}) ${i.headline}${i.surprise ? "（意外）" : ""}`),
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
  const ids = usable.flatMap((s) => s.items.map((i) => i.signalId));
  return executeAiJson(
    { operation: "brief_digest", module: "unknown", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents: contents + (attempt === 1 ? "\n\n上一次输出没通过校验：signalId 必须照抄材料里括号中的编号，用中文写。" : ""),
      config: {
        systemInstruction: DIGEST_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 1500,
      },
    }),
    (value) => parseDigest(value, ids)
  );
}

// ── 周报：七天的报告连起来看，哪些事一直在冒、哪些事只响了一天 ──────────────────

export type WeeklyDayInput = {
  date: string;
  /** 那天的总览；没生成就用各节总述拼起来。 */
  summary: string;
  items: { signalId: string; headline: string }[];
};

export type WeeklyThread = { title: string; note: string; signalIds: string[] };

export type WeeklyDigest = {
  /** 5 到 8 句：这一周世界上的主线。 */
  summary: string;
  /** 这一周里不止一天冒出来的事；每条至少引用两个不同日子的消息（代码核对）。 */
  threads: WeeklyThread[];
};

const MAX_WEEKLY_THREADS = 4;

const WEEKLY_PROMPT = `你是他身边一个懂行的老同事。他这一周每天都看了报告，但每天看的是碎片。你把七天连起来看，跟他讲这一周到底发生了什么。

summary：5 到 8 句，像当面说话：
- 先讲这一周的主线：哪件事从周初响到周末，中间有没有变化（变大、变小、换了说法）。
- 再讲只响了一天就没下文的大事 —— 它们可能是噪音，也可能是还没发酵，直说你分不清就写分不清。
- 只用材料里有的事实，绝不许自己推出因果或结论（"可能是因为""这说明""这意味着""标志着""这会影响""这可能会""是……的表现"都不许写，只说发生了什么）；不同的事不许硬连。
- 材料里的日期是报告的日子，不一定是事情发生的日子。要提就写成"周日的报告里""到了周一"，直接写周几，不加括号；材料里没有的日子不许提。
- 不要逐日复述，不要"本周报告包括……"这种目录式开头，不要空话。
- 你不知道他是做什么的：不许写"你""跟你""你的工作"。

threads：最多 ${MAX_WEEKLY_THREADS} 条"这一周不止一天冒出来的事"：
- title：一句话说是什么事（具体，带主体）。
- note：一句话说这几天里它怎么变的（先是……后来……）。只写材料里有的。
- signalIds：照抄材料里括号中的编号，至少要来自两个不同的日子。凑不出两个日子的就不算一条线，不要写。

${SIGNAL_SHARED_RULES}

只输出 JSON：{"summary":"…","threads":[{"title":"…","note":"…","signalIds":["…","…"]}]}`;

const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** "2026-10-12" → "周一"。 */
export function weekdayOf(date: string): string {
  return WEEKDAY_NAMES[new Date(`${date}T12:00:00Z`).getUTCDay()];
}

/** 周报里自己推因果的说法。 */
const WEEKLY_SELF_CAUSE = /可能是因为|或许是因为|这说明|这意味着|说明了|标志着|这可能会|这会|将会影响|的表现/;

/** 这句话有没有毛病：自己推了因果，或者提了材料里没有的日子。 */
function weeklySentenceBad(sentence: string, present: Set<string>): boolean {
  if (WEEKLY_SELF_CAUSE.test(sentence)) return true;
  const days = (sentence.match(/周[一二三四五六日天]/g) ?? []).map((d) => (d === "周天" ? "周日" : d));
  return days.some((d) => !present.has(d));
}

/** 按句号切开，去掉有毛病的句子（只去那一句，不整段作废 —— 整段作废的话十次有五次写不出来）。 */
export function dropBadSentences(text: string, present: Set<string>): string {
  return (text.match(/[^。！？]+[。！？]?/g) ?? [])
    .filter((x) => x.trim() && !weeklySentenceBad(x, present))
    .join("")
    .trim();
}

/**
 * dayOf：编号 → 日期。一条线引用的编号要来自至少两个不同的日子，否则丢掉。
 * 提到的周几必须是材料里有报告的那几天（模型爱把两天的材料写成"周二、周三、周四都有后续"），
 * 也不许自己推因果；犯了的那一句去掉，正文去光了才算没写出来。
 */
export function parseWeeklyDigest(value: unknown, dayOf: Map<string, string>): WeeklyDigest {
  if (!value || typeof value !== "object") throw new Error("输出不是对象");
  const v = value as Record<string, unknown>;
  const present = new Set(Array.from(dayOf.values()).map(weekdayOf));
  const summary = dropBadSentences(requireString(v, "summary"), present);
  if (!summary) throw new Error("周报正文每一句都有毛病（自己推因果，或者提了材料里没有的日子）");
  const threads: WeeklyThread[] = [];
  for (const r of Array.isArray(v.threads) ? v.threads : []) {
    if (!r || typeof r !== "object") continue;
    const t = r as Record<string, unknown>;
    const title = typeof t.title === "string" ? t.title.trim() : "";
    const note = typeof t.note === "string" ? dropBadSentences(t.note.trim(), present) : "";
    const signalIds = Array.from(
      new Set((Array.isArray(t.signalIds) ? t.signalIds : []).filter((x): x is string => typeof x === "string" && dayOf.has(x.trim())).map((x) => x.trim()))
    );
    const days = new Set(signalIds.map((id) => dayOf.get(id)));
    if (!title || !note || days.size < 2) continue;
    threads.push({ title, note, signalIds });
    if (threads.length >= MAX_WEEKLY_THREADS) break;
  }
  const texts = [summary, ...threads.flatMap((t) => [t.title, t.note])];
  assertNoBanned(texts);
  assertChinese(texts);
  if (texts.some((t) => /跟你|你的|你做|你平时|你可以/.test(t))) throw new Error("周报里编了跟他的关系");
  return { summary, threads: threads.filter((t) => !weeklySentenceBad(t.title, present)) };
}

export async function writeWeeklyDigest(days: WeeklyDayInput[]): Promise<WeeklyDigest> {
  const usable = days.filter((d) => d.items.length > 0);
  if (usable.length < 2) throw new Error("这一周有报告的日子不到两天，连不起来");
  const contents = usable
    .map((d) => [`【${d.date}（${weekdayOf(d.date)}）】`, d.summary ? `那天的总览：${d.summary}` : "", ...d.items.map((i) => `- (${i.signalId}) ${i.headline}`)].filter(Boolean).join("\n"))
    .join("\n\n");
  const dayOf = new Map(usable.flatMap((d) => d.items.map((i) => [i.signalId, d.date] as const)));
  return executeAiJson(
    { operation: "brief_weekly", module: "unknown", outputMode: "json", timeoutMs: 45_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1
          ? "\n\n上一次输出没通过校验：signalIds 必须照抄括号里的编号，每条线至少来自两个不同的日子；只能提材料里标着的那几天（周几）；不许自己推因果；用中文写。"
          : ""),
      config: {
        systemInstruction: WEEKLY_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 2000,
      },
    }),
    (value) => parseWeeklyDigest(value, dayOf)
  );
}

// ── GitHub 仓库：用中文说一句它能干什么 ─────────────────────────────────────────

export type RepoInput = { name: string; description: string | null; language: string | null; topics: string[] };

const REPO_EXPLAIN_PROMPT = `下面是 GitHub 上最近新建、星数涨得快的仓库，简介多半是英文。他不写代码为主，扫一眼英文简介很费劲，也看不出这东西能拿来干什么。

每个仓库写一句中文（30 到 60 字），按这个顺序：
1. 它是什么（一个命令行工具、一个网页应用、一个给 AI 用的插件、一个代码库……），
2. 什么人拿它能做成什么事。写场景，不写定义。比如"做电商的人可以拿它把商品图的背景一键换掉"，而不是"一个图像处理框架"。
- 简介太短、看不出用途的，就写"简介太少，看不出能干什么"。不许猜。
- 只用简介、语言、标签里有的信息。不夸，不写"强大""高效""值得关注"。
- 标签或简介显示它是拿来攻击、骚扰、破解别人东西的（raid、destroyer、crack、spam 之类），就直说它是干这个的，不许美化成"管理工具"。
- 专有名词（产品名、技术名）可以保留英文，句子用简体中文。

只输出 JSON：{"items":[{"name":"照抄仓库名","zh":"…"}]}`;

/** 模型常把"作者/仓库"写成只有"仓库"：短名只对得上一个时也认。 */
function matchRepoName(name: string, names: string[]): string | null {
  if (names.includes(name)) return name;
  const short = name.split("/").pop() ?? name;
  const hits = names.filter((n) => n.split("/").pop() === short);
  return hits.length === 1 ? hits[0] : null;
}

export function parseRepoExplanations(value: unknown, names: string[]): Map<string, string> {
  const out = new Map<string, string>();
  // 模型偶尔不包一层 items，直接给数组
  const items = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items)
      ? (value as { items: unknown[] }).items
      : [];
  for (const r of items) {
    if (!r || typeof r !== "object") continue;
    const v = r as Record<string, unknown>;
    const name = matchRepoName(typeof v.name === "string" ? v.name.trim() : "", names);
    const zh = typeof v.zh === "string" ? v.zh.trim() : "";
    if (!name || !zh || out.has(name)) continue;
    // 某一句犯规（夸、用日文写）只丢那一句，不让整批作废
    try {
      assertNoBanned([zh]);
      assertChinese([zh]);
    } catch {
      continue;
    }
    out.set(name, zh.slice(0, 120));
  }
  if (names.length > 0 && out.size === 0) throw new Error("一个仓库都没写出能用的中文");
  return out;
}

/** 一批仓库各写一句中文"能干什么"。写不出的仓库不在返回的 Map 里。 */
export async function explainRepos(repos: RepoInput[]): Promise<Map<string, string>> {
  if (repos.length === 0) return new Map();
  const names = repos.map((r) => r.name);
  const contents = repos
    .map((r) =>
      [`- ${r.name}`, `  简介：${r.description?.trim() || "（没写）"}`, r.language ? `  语言：${r.language}` : "", r.topics.length ? `  标签：${r.topics.slice(0, 6).join(", ")}` : ""]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n");
  return executeAiJson(
    { operation: "github_explain", module: "unknown", outputMode: "json", timeoutMs: 40_000 },
    (attempt) => ({
      model: MODEL,
      contents: contents + (attempt === 1 ? "\n\n上一次输出没通过校验：name 照抄仓库名，zh 用简体中文，不许写夸奖的话。" : ""),
      config: {
        systemInstruction: REPO_EXPLAIN_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 4000,
      },
    }),
    (value) => parseRepoExplanations(value, names)
  );
}

// ── 详细报告：总览只有几句，这里把今天最重要的几件事一件件讲透 ─────────────────────

export type DetailItemInput = {
  signalId: string;
  section: string;
  headline: string;
  background: string;
  /** 代码核对过的原文摘录。 */
  quotes: string[];
  opportunity?: string;
  precedent?: string;
};

export type DetailTheme = {
  title: string;
  signalIds: string[];
  /** 发生了什么：只写材料里有的事实。 */
  happened: string;
  /** 来龙去脉：之前怎样、为什么是现在。材料里没有就空着。 */
  context: string;
  /** 现在还不知道的关键一点，两个方向各一个理由（这里允许推测，页面上标明）。 */
  open: string;
  /** 接下来盯什么就能知道往哪边走：具体的对象、数字、时间。 */
  watch: string;
};

export type DigestDetail = { themes: DetailTheme[] };

const MAX_DETAIL_THEMES = 4;

const DETAIL_PROMPT = `你是他身边一个懂行的老同事。今天的总览只有几句话，他想知道得更细。
从下面今天报告里的条目中，挑出最重要的 2 到 ${MAX_DETAIL_THEMES} 件事，一件一件讲透。
"一件事"可以由几条消息组成，但只有它们真是同一件事的不同面时才放一起；不相干的不要硬凑成一个主题。

每件事写五样：
- title：一句话说是什么事，带具体主体（"横滨国立大学：漏洞被利用的时间缩短"，不是"网络安全形势严峻"）。
- signalIds：这件事用到的条目编号，照抄括号里的。
- happened：发生了什么，3 到 5 句。只写材料里有的事实：谁、做了什么、数字是多少、什么时候。原文摘录里有数字就用上。
- context：来龙去脉，1 到 3 句：这件事之前是什么样、为什么是现在冒出来。材料里没有就写空字符串，不许编。
  不许写"随着 AI 的广泛应用""近年来企业普遍面临……"这种放之四海皆准的套话 —— 换一条新闻也成立的句子就不要写。
- open：现在还不知道的关键一点，写成"会不会……：会，因为……；不会，因为……"。这里是推测，可以用"可能"。
- watch：接下来盯什么就能知道往哪边走，最多三样，每样都要点名一个具体的对象（哪家公司、哪个机构、哪份统计）和一个看得见的变化
  （"东京商工リサーチ下个月公布的餐饮业倒闭件数还是不是同期最高""熊本市 2026 年 7 月开征后公布的住宿人数"）。
  不许写"关注政策动向""观察价格走势""持续关注事态发展"这种没有对象的话。

规矩：
- happened 和 context 里不许自己推因果、下结论（"这说明""意味着""凸显了""标志着""反映了"都不许写）。推测只能放在 open 里。
- 不要逐条复述标题。不要空话。
- 你不知道他是做什么的：不许写"你""跟你""你的工作"。

${SIGNAL_SHARED_RULES}

只输出 JSON：{"themes":[{"title":"…","signalIds":["…"],"happened":"…","context":"…","open":"…","watch":"…"}]}`;

/** happened / context 里自己推因果的句子去掉（推测只许放在 open 里）。 */
const DETAIL_SELF_CAUSE = /这说明|说明了|意味着|标志着|凸显|反映了|反映出|表明/;

/** 换一条新闻也成立的套话开头。 */
const DETAIL_BOILERPLATE = /^\s*(随着|近年来|当前|如今|在.{0,24}(背景|环境|形势)下)/;

function dropDetailCause(text: string): string {
  return (text.match(/[^。！？]+[。！？]?/g) ?? [])
    .filter((x) => x.trim() && !DETAIL_SELF_CAUSE.test(x) && !DETAIL_BOILERPLATE.test(x))
    .join("")
    .trim();
}

export function parseDigestDetail(value: unknown, signalIds: string[]): DigestDetail {
  if (!value || typeof value !== "object") throw new Error("输出不是对象");
  const raw = (value as { themes?: unknown }).themes;
  const themes: DetailTheme[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    if (!r || typeof r !== "object") continue;
    const t = r as Record<string, unknown>;
    const s = (k: string) => (typeof t[k] === "string" ? (t[k] as string).trim() : "");
    const ids = Array.from(new Set((Array.isArray(t.signalIds) ? t.signalIds : []).filter((x): x is string => typeof x === "string").map((x) => x.trim()))).filter((x) =>
      signalIds.includes(x)
    );
    const happened = dropDetailCause(s("happened"));
    if (!s("title") || ids.length === 0 || !happened || !s("watch")) continue;
    themes.push({ title: s("title"), signalIds: ids, happened, context: dropDetailCause(s("context")), open: s("open"), watch: s("watch") });
    if (themes.length >= MAX_DETAIL_THEMES) break;
  }
  if (themes.length === 0) throw new Error("一件事都没写出来");
  const texts = themes.flatMap((t) => [t.title, t.happened, t.context, t.open, t.watch]).filter(Boolean);
  assertNoBanned(texts);
  assertChineseAllowingNames(texts);
  if (texts.some((x) => /跟你|你的|你做|你平时|你可以/.test(x))) throw new Error("详细报告里编了跟他的关系");
  if (texts.some((x) => mentionsNumericLikelihood(x))) throw new Error("详细报告里写了可能性的数字");
  return { themes };
}

export async function writeDigestDetail(items: DetailItemInput[]): Promise<DigestDetail> {
  if (items.length === 0) throw new Error("今天的报告还没生成");
  const contents = items
    .map((i) =>
      [
        `- (${i.signalId}) 【${i.section}】${i.headline}`,
        i.background ? `  背景：${i.background}` : "",
        ...i.quotes.slice(0, 2).map((q) => `  原文：「${q}」`),
        i.precedent ? `  先例：${i.precedent}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n");
  const ids = items.map((i) => i.signalId);
  return executeAiJson(
    { operation: "brief_digest_detail", module: "unknown", outputMode: "json", timeoutMs: 50_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1 ? "\n\n上一次输出没通过校验：signalIds 照抄括号里的编号；每件事都要有 happened 和 watch；用中文写；不许写可能性的数字。" : ""),
      config: {
        systemInstruction: DETAIL_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 4000,
      },
    }),
    (value) => parseDigestDetail(value, ids)
  );
}
