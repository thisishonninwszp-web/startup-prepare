import { executeAiJson } from "@/lib/ai-gateway";
import { MODEL } from "./shared";
import { assertChineseAllowingNames, assertNoBanned, type SearchSource } from "./signals";
import { checkThereFacts, THERE_MAX_FACTS, type ThereFact, type ThereLanguage, type ThereNames } from "@/lib/domains/signals/deep-shared";

// ---------------------------------------------------------------------------
// 差距的「一条讲透」：那边查一查。
// 一条差距在那边到底是什么：谁在做、做到多大、怎么收钱、哪年开始。AI 只写这样东西的叫法和属于谁，
// 搜索词由代码拼（deep-shared.ts 的 thereSearches），搜完再按四格摘事实；
// 每条事实的原文、数字、公司名由代码核对（deep-shared.ts），对不上的丢掉。不写结论、不打分。
// ---------------------------------------------------------------------------

export type ThereInput = {
  there: string;
  language: ThereLanguage;
  headline: string;
  background: string;
  /** 这样东西的两个叫法和属于谁（摘事实时用来分清主语）。 */
  names?: ThereNames;
};

export type ThereNamePlan = ThereNames & { query: string };

const thereNamePrompt = (input: ThereInput) => `下面是${input.there}已经有的一样东西（一条新闻里讲到的）。要去${input.there}的商业媒体上查它做到多大、怎么收钱。

写四样，都用${input.language}，越短越好，不要加修饰：
- product：新闻里点了名的那个产品或服务的名字（例："某某外卖 App"）；新闻讲的是一个行业、没有点名哪个产品，就写空字符串。不要写公司名。
- category：这一类东西的叫法（例："外卖 App""无人机送药""豆芽"）。一定要写。
- parent：product 属于哪家公司或哪个平台（公司名写在这里）；没有 product、或不知道，写空字符串，不要猜。
- query：一个搜索词，查它"谁在做、做到多大、怎么收钱、哪年开始"，用${input.there}本地人会搜的说法，不要带"日本"，3 到 8 个词。

只输出 JSON：{"product":"…","category":"…","parent":"…","query":"…"}`;

/** 这一类东西的叫法必须有（搜索词由代码拿它拼）；产品名、母公司、兜底搜索词可以空。 */
export function parseThereName(value: unknown): ThereNamePlan {
  const v = (value ?? {}) as Record<string, unknown>;
  const str = (k: string, max: number) => (typeof v[k] === "string" ? (v[k] as string).trim().slice(0, max) : "");
  const category = str("category", 40);
  if (!category) throw new Error("没写这一类东西的叫法");
  return { product: str("product", 40), category, parent: str("parent", 40), query: str("query", 120) };
}

export async function planThereName(input: ThereInput): Promise<ThereNamePlan> {
  return executeAiJson(
    { operation: "gap_there_name", module: "unknown", outputMode: "json", timeoutMs: 20_000 },
    (attempt) => ({
      model: MODEL,
      contents: `${input.headline}\n${input.background}` + (attempt === 1 ? "\n\n上一次输出没通过校验。只输出 JSON，category 必填。" : ""),
      config: {
        systemInstruction: thereNamePrompt(input),
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 400,
      },
    }),
    parseThereName
  );
}

const thereFactsPrompt = (there: string) => `你在帮一个人把${there}那边的一样东西查清楚。给你这样东西是什么、它在${there}的叫法和属于哪家，和几篇上网搜到的资料。
从资料里摘出最多 ${THERE_MAX_FACTS} 条事实，只要这四格：
- who：谁在做（具体公司）；
- scale：做到多大（多少人用、月活、GMV、营业额、门店数、生产商有几家、融资额）——最要紧，资料里有就一定摘；
  售价、订阅费、抽成比例是"怎么收钱"，不是"做到多大"；
- money：怎么收钱（佣金、广告、会员费、抽成……）；
- since：哪一年开始。

每条写：
- source：资料编号（数字）。
- kind："who" / "scale" / "money" / "since" 之一。
- fact：一句简体中文，写清谁、什么、多少、什么时候。数字照原文的阿拉伯数字写，不换算、不四舍五入、不改成汉字。
  数字是哪一年的、资料写了就写上；资料没写哪年，就在句末写"（资料没写哪年）"。
  它所属的公司或平台里、管这样东西的那块业务的数字也要摘（例如一款外卖 App 是某平台的外卖业务独立出来的，那块外卖业务的订单量要摘），
  主语写那块业务或那家公司，并注明关系，例如"某平台外卖业务（这款 App 的前身）……"，不能写成这样东西本身的数字。
  这一类东西整体的数字（市场规模、行业规模、有几家在做）也要摘，主语写这一类，例如"中国外卖市场……"。
  同一类里别家公司的数字（不是这样东西、也不是它所属的那块业务）不摘 —— 那是别的东西。
  母公司整体的数字（总营收、总用户、股价）跟这样东西没关系，不摘。
- company：这条讲的是哪家公司，照原文写法；不是讲某一家公司就写空字符串。
- excerpt：资料里支撑这条的原文，逐字照抄（不翻译、不改字，20 到 150 字）。

铁律：
- 只摘资料里写了的。没写的不要补，不要推测。讲的是别的东西、别的国家的，跳过（它所属的公司或平台里管这样东西的那块业务，不算别的东西）。
- 不写"这说明""意味着""前景广阔"这类结论，只写事实。不夸。
- 一条都没有就给空数组，不要凑。

只输出 JSON：{"facts":[{"source":1,"kind":"scale","fact":"…","company":"…","excerpt":"…"}]}`;

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
        `【这样东西】${input.headline}\n${input.background}` +
        (input.names
          ? `\n【在${input.there}的叫法】${input.names.product ? `产品：${input.names.product}${input.names.parent ? `（属于 ${input.names.parent}）` : ""}；` : ""}这一类：${input.names.category}`
          : "") +
        `\n\n${block}` +
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
