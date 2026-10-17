import { executeAiJson } from "@/lib/ai-gateway";
import { MODEL } from "./shared";
import { assertChineseAllowingNames, assertNoBanned, type SearchSource } from "./signals";
import { checkThereFacts, THERE_MAX_FACTS, type ThereFact } from "@/lib/domains/signals/deep-shared";

// ---------------------------------------------------------------------------
// 差距的「一条讲透」：那边查一查。
// 一条差距在那边到底是什么：谁在做、做到多大、怎么收钱、哪年开始。AI 先写那边语言的搜索词，搜完再摘事实；
// 每条事实的原文、数字、公司名由代码核对（deep-shared.ts），对不上的丢掉。不写结论、不打分。
// ---------------------------------------------------------------------------

export type ThereInput = { there: string; language: "中文" | "英文" | "日文"; headline: string; background: string };

const thereQueryPrompt = (input: ThereInput) => `下面是${input.there}已经有的一样东西（一条新闻里讲到的）。想把它在${input.there}的情况查清楚：谁在做、做到多大、怎么收钱、从哪一年开始。

写两个${input.language}搜索词：
- 第一个查"谁在做、做到多大"（公司名、用户数、门店数、营业额）；
- 第二个查"怎么收钱、哪一年开始"。
- 用${input.there}本地人会搜的说法，不要带"日本"，不要写成一句话，3 到 8 个词。

只输出 JSON：{"queries":["…","…"]}`;

export function parseThereQueries(value: unknown): string[] {
  const raw = (value as { queries?: unknown } | null)?.queries;
  const queries = (Array.isArray(raw) ? raw : [])
    .filter((q): q is string => typeof q === "string" && !!q.trim())
    .map((q) => q.trim().slice(0, 120))
    .slice(0, 2);
  if (queries.length === 0) throw new Error("一个搜索词都没写");
  return queries;
}

export async function planThereQueries(input: ThereInput): Promise<string[]> {
  return executeAiJson(
    { operation: "gap_there_queries", module: "unknown", outputMode: "json", timeoutMs: 20_000 },
    (attempt) => ({
      model: MODEL,
      contents: `${input.headline}\n${input.background}` + (attempt === 1 ? "\n\n上一次输出没通过校验。只输出 JSON，queries 里两个搜索词。" : ""),
      config: {
        systemInstruction: thereQueryPrompt(input),
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 500,
      },
    }),
    parseThereQueries
  );
}

const thereFactsPrompt = (there: string) => `你在帮一个人把${there}那边的一样东西查清楚。给你这样东西是什么，和几篇上网搜到的资料。
从资料里摘出最多 ${THERE_MAX_FACTS} 条事实，只要这几类：谁在做（具体公司）、做到多大（用户数、门店数、营业额、融资额）、怎么收钱、哪一年开始。

每条写：
- source：资料编号（数字）。
- fact：一句简体中文，写清谁、什么、多少、什么时候。数字照原文的阿拉伯数字写，不换算、不四舍五入、不改成汉字。
- company：这条讲的是哪家公司，照原文写法；不是讲某一家公司就写空字符串。
- excerpt：资料里支撑这条的原文，逐字照抄（不翻译、不改字，20 到 150 字）。

铁律：
- 只摘资料里写了的。没写的不要补，不要推测。讲的是别的东西、别的国家的，跳过。
- 不写"这说明""意味着""前景广阔"这类结论，只写事实。不夸。
- 一条都没有就给空数组，不要凑。

只输出 JSON：{"facts":[{"source":1,"fact":"…","company":"…","excerpt":"…"}]}`;

/** 核对见 checkThereFacts；剩下的事实里有夸的话、写成了日文，整次重来。 */
export function parseThereFacts(value: unknown, sources: SearchSource[]): ThereFact[] {
  const facts = checkThereFacts((value as { facts?: unknown } | null)?.facts, sources);
  const texts = facts.map((f) => f.text);
  assertNoBanned(texts);
  assertChineseAllowingNames(texts);
  return facts;
}

export async function extractThereFacts(input: ThereInput, sources: SearchSource[]): Promise<ThereFact[]> {
  const block = sources.map((s, i) => `[资料 ${i + 1}] ${s.title}\n${s.url}\n${s.content.slice(0, 1500)}`).join("\n\n");
  return executeAiJson(
    { operation: "gap_there_facts", module: "unknown", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        `【这样东西】${input.headline}\n${input.background}\n\n${block}` +
        (attempt === 1 ? "\n\n上一次输出没通过校验。excerpt 必须逐字照抄资料原文；fact 用简体中文、只写事实。" : ""),
      config: {
        systemInstruction: thereFactsPrompt(input.there),
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 3000,
      },
    }),
    (value) => parseThereFacts(value, sources)
  );
}
