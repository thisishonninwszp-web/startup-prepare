import { type ExternalSignal, type RealityCheckResult, type TavilyResult } from "@/app/(app)/ideas/types";
import { FIRST_INQUIRY_QUESTION } from "./core";
import { executeAiJson, executeJev, type JevQuestion, type JevResult } from "@/lib/ai-gateway";
import { MODEL, generateContent } from "./shared";
import { TIER_VALUE } from "@/lib/domains/signals/inference-shared";

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
};

/** "也值得一看"：只有一句中文标题，不写背景。 */
export type BriefMore = { index: number; event: string; headline: string };

/** 一份报告里最多几条点到他。多了就是硬扯。 */
const MAX_PERSONAL = 2;

const BRIEF_SIZE = 5;

export type BriefKind = "news" | "tools" | "voices" | "calendar";

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
- 只要有一条中国的条目讲的是一种做法、产品或消费上的变化（一家公司怎么做生意、一种新服务、人们开始怎么买东西），
  5 条里至少留 1 条中国的。政府发文、监管新规、股市、宏观数据都不算；一条合适的都没有就不留。
  （"日本这边有没有"会单独再问一次，这里不用写。）
同一件事只留一条：一个事件和它引发的后续反应（比如"央行加息"和"银行跟着调存款利率"）算同一件事，挑一条，后续放进 background 里讲。

每条写：
- headline：一句话说发生了什么。
- background：为什么重要、来龙去脉，3 到 4 句，让不懂这个领域的人也能看懂。
- forYou：这件事主要影响哪一类人或企业、怎么影响，一到两句。直接写"物流公司会……""地方银行要……"，不写"你"，也不写"如果你在 XX 行业"。`,
  tools: `你每天帮一个人从几十个 GitHub 新仓库里挑出 ${BRIEF_SIZE} 个最值得看的工具，让他跟上时代。

挑的标准：
- 能直接拿来用、能解决一类真实问题的工具，优先于纯研究代码、作业、清单类仓库。
- 代表一个新趋势的（比如 AI agent 的新用法），哪怕他暂时用不上。

每条写：
- headline：一句话说这是什么。
- background：它能拿来做什么、为什么现在有很多人关注它，3 到 4 句。
- forYou：可以拿它试的一件具体的事，一个周末能做完，一句话。`,
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
  tools: "今天大家在做什么样的工具、透露出什么趋势",
  voices: "今天一线的人普遍卡在哪里、这些麻烦有什么共同点",
  calendar: "接下来几个月有哪些已经定了的变化、哪些人要开始准备（一条都没有就直说这批消息里没有写明日期的变化）",
};

export type BriefPractice = {
  /** 候选列表里的序号，必须是 picks 里的一条。 */
  index: number;
  /** 一个能在几个月后用事实检验的问题。 */
  question: string;
  /** 到时候看什么来判断对错。 */
  checkHow: string;
};

export type Brief = {
  /** 报告开头"今天的世界"：把几条串起来讲，3 到 5 句。 */
  overview: string;
  picks: BriefPick[];
  /** 精选之外、也值得一看的几条（不同的事），只有标题。 */
  more: BriefMore[];
  /** 只有新闻报告有：今天的练习题。 */
  practice: BriefPractice | null;
};

const PRACTICE_INSTRUCTION = `再出一道今天的练习题（practice）。他在练"读新闻、下判断、事后对账"。
- 从你挑的 5 条里选最适合下判断的一条（index 用候选序号）。选后续会有公开消息能验证的事，不选已经尘埃落定的。
- question：一个几个月内能用事实检验的问题，问"会怎样"而不是"你怎么看"。要能回答成一句具体的话。
  例："三个月后，日本大型地方银行的一年期定存利率会不会超过 0.5%？"
  不要："你怎么看日银加息？"
- checkHow：到时候去看什么来判断对错，一句话（看哪类新闻、哪个数字、哪家公司的公告）。
`;

/** allowEmpty：日程那一份，当天真没有带日期的消息时允许一条都不挑（不许硬凑）。 */
const MORE_SIZE = 5;

const MORE_INSTRUCTION = `每条 picks 都写 event：这是哪件事的短标签，4 到 10 个字（比如"日银加息""台积电熊本"）。
同一件事的不同报道、它引发的后续反应，用同一个标签 —— 代码会按标签去重，标签不同的才算不同的事。
picks 按重要性从高到低排，可以多挑一两条备选（最多 ${BRIEF_SIZE + 2} 条），去重后只留前 ${BRIEF_SIZE} 条。

再写 more：精选之外、也值得一看的最多 ${MORE_SIZE} 条，必须是和 picks 不同的事。每条只写 index、event，
和 headline（一句中文，说清楚发生了什么）。不写背景。没有就给空数组。
`;

/** 标签比较前去掉空格和标点；一个包含另一个也算同一件事（"日银加息" ⊂ "日银加息后银行跟进"）。 */
export function sameEvent(a: string, b: string): boolean {
  const norm = (t: string) => t.toLowerCase().replace(/[\s\p{P}]/gu, "");
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

export function parseBrief(value: unknown, candidateCount: number, allowEmpty = false): Brief {
  if (!value || typeof value !== "object") throw new Error("输出不是对象");
  const overview = requireString(value as Record<string, unknown>, "overview");
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
    const index = typeof v.index === "number" ? v.index : Number(v.index);
    if (!Number.isInteger(index) || index < 0 || index >= candidateCount || seen.has(index)) continue;
    seen.add(index);
    const headline = requireString(v, "headline");
    const event = typeof v.event === "string" && v.event.trim() ? v.event.trim().slice(0, 30) : headline;
    // 同一件事（标签相同或互相包含）只留排在前面的那条
    if (result.some((r) => sameEvent(r.event, event))) continue;
    result.push({
      index,
      headline,
      background: requireString(v, "background"),
      forYou: requireString(v, "forYou"),
      event,
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
    const index = typeof v.index === "number" ? v.index : Number(v.index);
    if (!Number.isInteger(index) || index < 0 || index >= candidateCount) continue;
    const headline = typeof v.headline === "string" ? v.headline.trim() : "";
    const event = typeof v.event === "string" && v.event.trim() ? v.event.trim() : headline;
    addMore(index, event, headline);
  }
  const practice = parsePractice((value as { practice?: unknown }).practice, picks);
  const texts = [
    overview,
    ...picks.flatMap((p) => [p.headline, p.background, p.forYou]),
    ...more.map((m) => m.headline),
    ...(practice ? [practice.question, practice.checkHow] : []),
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
  return { index, question, checkHow };
}

/**
 * 写报告时故意不给 AI 看任何关于他的信息：看得到它就会每条都往他身上扯。
 * "跟你"由第二步 linkPicksToReader 单独做，并由代码核对。
 */
export async function generateSignalBrief(kind: BriefKind, candidates: BriefCandidate[]): Promise<Brief> {
  if (candidates.length === 0) return { overview: "", picks: [], more: [], practice: null };
  const numbered = candidates
    .map((c, i) => `[${i}] ${c.title}（${c.source}）${c.china ? "（中国）" : ""}\n${c.text.slice(0, 160)}`)
    .join("\n");
  const contents = `候选：\n${numbered}`;
  const systemInstruction = `${BRIEF_PROMPTS[kind]}

${SIGNAL_SHARED_RULES}

另外写 overview：开头的一段总述，3 到 5 句，把挑出来的几条串起来讲${OVERVIEW_TOPIC[kind]}。第一句直接说今天最重要的那一件事是什么；每一句都要带一件具体的事（谁、做了什么）。不许用"持续演进""几个重要领域""值得注意的是"这类空开头，也不要逐条复述。

${kind === "news" ? PRACTICE_INSTRUCTION : ""}
${MORE_INSTRUCTION}
只输出 JSON：{"overview":"…","picks":[{"index":序号,"event":"…","headline":"…","background":"…","forYou":"…"}],"more":[{"index":序号,"event":"…","headline":"…"}]${kind === "news" ? ',"practice":{"index":序号,"question":"…","checkHow":"…"}' : ""}}`;

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
        maxOutputTokens: 4000,
      },
    }),
    (value) => parseBrief(value, candidates.length, kind === "calendar")
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

export type PersonalLink = { index: number; personal: string };

const LINK_PROMPT = `下面是今天报告里的几条，和"关于他"的记录。找出真的跟他连得上的，最多 ${MAX_PERSONAL} 条。

连得上的意思是：同一个行业、同一类问题、或者他记过的观察里直接提到过。
"都跟 AI 有关""都是商业新闻"不算连得上。连不上的就不写，一条都没有就给空数组。宁缺毋滥。

每条写：
- index：报告里那一条的序号。
- personal：跟他有什么关系，一到两句，具体到他记录里的那件事。
- link：逐字照抄"关于他"里你据以联系的那一条（或其中一段）。

不要用"作为未来的社长"这种套话。
不要曲解他记录里的词：照原话的意思说，不要自己换成近似但意思不同的词（比如把"AI 推荐率监测"说成"AI 推荐系统"）。
${SIGNAL_SHARED_RULES}

只输出 JSON：{"links":[{"index":序号,"personal":"…","link":"…"}]}`;

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
    if (!indices.includes(index) || seen.has(index) || !personal || !grounded(link)) continue;
    seen.add(index);
    result.push({ index, personal });
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

再写 query：用日语写的搜索词，3 到 6 个词，用来上网查"日本有没有这种东西"。
写成日本这边的说法，不要直译中国的产品名（例：微信的 AI 助手 → "LINE AI アシスタント 機能"；即时零售 → "即配 ネットスーパー 30分"）。

只输出 JSON：{"items":[{"index":序号,"japan":"…","query":"…"}]}`;

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
    out.push({ index, japan, query });
  }
  assertNoBanned(out.map((o) => o.japan));
  assertChineseAllowingNames(out.map((o) => o.japan));
  return out;
}

/** 给精选里中文媒体的那几条各写一句"日本这边"。凭 AI 的印象，没上网查，页面上要标出来。 */
export async function compareWithJapan(inputs: JapanInput[]): Promise<JapanComparison[]> {
  if (inputs.length === 0) return [];
  const contents = inputs.map((i) => `[${i.index}] ${i.headline}\n${i.background}`).join("\n\n");
  return executeAiJson(
    { operation: "brief_japan", module: "unknown", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1 ? "\n\n上一次输出没通过校验：每条 japan 第一句必须以规定的四种开头之一起头，不许写空话。" : ""),
      config: {
        systemInstruction: JAPAN_PROMPT,
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

一律用简体中文写（basis 照抄原文，不用翻译）。不要编资料里没有的事实。

只输出 JSON：{"items":[{"i":0,"status":"supported","japan":"…","correction":"","basis":[{"source":1,"excerpt":"…"}]}]}`;

export type JapanSources = { comparison: JapanComparison; sources: SearchSource[] };

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
    const unverified: JapanComparison = { ...comparison, check: { status: "unverified", basis: [] } };
    if (!it || basis.length === 0 || (status !== "supported" && status !== "corrected")) return unverified;
    if (status === "corrected") {
      const correction = typeof it.correction === "string" ? it.correction.trim() : "";
      const japan = typeof it.japan === "string" ? it.japan.trim() : "";
      const valid = JAPAN_OPENERS.some((o) => japan.startsWith(o)) && !JAPAN_FILLER.test(japan);
      // 说改正了，却没改、没说哪里不一样、或改出来的不合格 —— 当成"查到出处"
      if (correction && valid && japan !== comparison.japan) {
        return { ...comparison, japan, check: { status: "corrected", correction, basis } };
      }
    }
    return { ...comparison, check: { status: "supported", basis } };
  });
  const texts = out.flatMap((c) => [c.japan, c.check?.correction ?? ""]).filter(Boolean);
  assertNoBanned(texts);
  assertChineseAllowingNames(texts);
  return out;
}

/** 拿搜到的资料核实"日本这边"。一条资料都没搜到的直接标没查到，不调 AI。 */
export async function checkJapanComparisons(inputs: JapanSources[]): Promise<JapanComparison[]> {
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
        systemInstruction: JAPAN_CHECK_PROMPT,
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
  );
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
};

/** 每层最多几条。层数上限由调用方控制。 */
const INFERENCE_BRANCHES = 3;

const INFERENCE_PROMPT = `你帮一个人练"顺着一条消息往下推"。给你一条新闻，和已经推到的那条链（可能为空）。
你只负责推下一层：在这条链最后一步成立的前提下，接下来最可能发生的 2 到 ${INFERENCE_BRANCHES} 种情况。

每种情况写：
- claim：会发生什么，一句话，具体到谁、做什么。
- why：为什么上一步会导致这一步，说清机制，一到两句。
- watch：到时候看什么能知道它正在发生（哪类新闻、哪个数字、谁的动作），一句话。
- likelihood：在上一步成立的前提下，它发生的可能性，只能是这五档之一：
  "very_likely"（很可能）/"likely"（较可能）/"possible"（一半一半）/"unlikely"（不太可能）/"very_unlikely"（很不可能）。
  最好也给一条反方向或意外的情况。

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

只输出 JSON：{"steps":[{"claim":"…","why":"…","watch":"…","likelihood":"likely","query":"…","counterQuery":"…"}]}`;

export function parseInferenceSteps(value: unknown): InferenceStep[] {
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
}): Promise<InferenceStep[]> {
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
        // 思考会吃 maxOutputTokens，所以上限给足，免得 JSON 被截断。
        thinkingConfig: { thinkingBudget: 1024 },
        maxOutputTokens: 4096,
      },
    }),
    parseInferenceSteps
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
export type JudgedTier = { likelihood: Likelihood; unsure: boolean; p: number; restates: boolean };

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
    return { likelihood: LIKELIHOOD_ORDER[probs.indexOf(top)], unsure: top < JEV_UNSURE_BELOW, p, restates };
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
  const overview = requireString(v, "overview");
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

export async function groundBrief(inputs: GroundInput[]): Promise<{ overview: string; items: GroundedPick[] }> {
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
        systemInstruction: GROUND_PROMPT,
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

铁律：
- 他写了看法的话，至少一个因素要是"最可能让他看错的"。不许迎合他。
- 不许给因素打分、排权重，不许写任何可能性的百分比或"几成"。
- 不要编事实里没有的数字和公司。

只输出 JSON：{"keyFactors":[{"factor":"…","now":"…","watch":"…","evidence":[1,3]}]}`;

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

export async function analyzeKeyFactors(input: QuestionInput & { facts: string[] }): Promise<KeyFactor[]> {
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
    (value) => parseKeyFactors(value, input.facts.length)
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
