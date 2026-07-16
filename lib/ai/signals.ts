import { type ExternalSignal, type RealityCheckResult, type TavilyResult } from "@/app/(app)/ideas/types";
import { FIRST_INQUIRY_QUESTION } from "./core";
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

