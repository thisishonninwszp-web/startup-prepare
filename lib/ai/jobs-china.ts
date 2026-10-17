import { executeAiJson, executeJev, type JevQuestion } from "@/lib/ai-gateway";
import { MODEL } from "./shared";
import { secondOption, verifiedBasis, type SearchSource } from "./signals";
import { numbersIn, quoteIn, unsupported } from "@/lib/domains/jobs/provenance-shared";
import {
  assertJapanese,
  assertNoHype,
  type ChinaCompany,
  type ChinaJapan,
  type ChinaPlan,
  type Holds,
  type JapanCondition,
  type JapanEntrant,
} from "@/lib/domains/jobs/china-shared";

// ---------------------------------------------------------------------------
// 面试演示「御社の商売、中国ではどうなっている？」：面试官说一句生意 → 中文搜中国同行 → 那边做成靠的条件日本有没有。
// 界面给面试官看，AI 写的叙述一律日文；原文逐字核对，日文里的数字和英文词必须在原文里（代码查）。
// 宪法原则 1、2：不打分、不下"有机会"的结论，要特意找日本不具备的条件。
// ---------------------------------------------------------------------------

const MAX_COMPANIES = 4;
const SAME_ABOVE = 0.5;
const MAX_CONDITIONS = 5;
const MAX_ENTRANTS = 3;
const DEFAULT_HERE = "日本側の資料が見つかりませんでした。";
const KANA = /[぀-ヿ]/;
const HAN = /[一-鿿]/;

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** 比公司名用：统一全半角、去空白、小写。 */
function squash(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function isChinese(text: string): boolean {
  return HAN.test(text) && !KANA.test(text);
}

/**
 * 模型翻译时爱给中文名加个括号拼音或英文名（「華院数雲（Huayuan）」），资料里没有这个词，整家就被核对丢掉。
 * 括号里只有拉丁字母的删掉再核对 —— 拼音没出处，删了也不丢信息。
 */
function dropRomanized(text: string): string {
  return text.replace(/\s*[（(]\s*[A-Za-z][A-Za-z0-9 .&'-]*\s*[)）]/g, "");
}

/** 资料编号：模型有时写成 1，有时写成"资料 1"，只取里面的数字（2026-10-17 试跑时整批公司因此被丢掉）。 */
function sourceIndex(value: unknown): number {
  const digits = String(value ?? "").match(/\d+/);
  return digits ? Number(digits[0]) - 1 : -1;
}

// ---- 第 1 步：搜索词 -------------------------------------------------------------

const PLAN_PROMPT = `面试官用一句日文说了他们公司做什么生意。要用中文上网找"中国做同样生意的公司"。

写两样：
- zh_business：这门生意在中国的说法，一句中文，说清卖给谁、卖什么（例："面向中小企业的考勤管理 SaaS"）。不加评价。
- queries：2 到 3 个中文搜索词，每个 2 到 6 个词。用中国那边的叫法，不直译日文
  （例：勤怠管理 → 考勤；人材紹介 → 猎头 / 招聘平台；買取 → 回收；工務店 → 装修公司 / 家装；SaaS、App 这类照留）。
  其中一个带"融资""上市"或"排行"，容易搜到讲具体公司的报道。
全部用简体中文，不要日文假名。

只输出 JSON：{"zh_business":"…","queries":["…","…"]}`;

export function parseChinaPlan(value: unknown): ChinaPlan {
  const v = (value ?? {}) as Record<string, unknown>;
  const zh = str(v.zh_business, 80);
  if (!zh || !isChinese(zh)) throw new Error("zh_business 不是中文");
  const queries = (Array.isArray(v.queries) ? v.queries : []).map((q) => str(q, 40)).filter((q) => q && isChinese(q));
  const unique = Array.from(new Set(queries)).slice(0, 3);
  if (unique.length < 2) throw new Error("中文搜索词不到两个");
  return { zh_business: zh, queries: unique };
}

/** 第 1 步：这门生意在中国的说法和中文搜索词。 */
export async function planChinaQueries(userId: string, business: string): Promise<ChinaPlan> {
  return executeAiJson(
    { userId, operation: "china_lens_plan", module: "jobs", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents: business + (attempt === 1 ? "\n\n上一次输出没通过校验：zh_business 和 queries 必须是简体中文（不要日文假名），queries 两到三个。" : ""),
      config: {
        systemInstruction: PLAN_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 800,
      },
    }),
    parseChinaPlan
  );
}

// ---- 第 2 步：中国的公司 ----------------------------------------------------------

const companiesPrompt = (zhBusiness: string) => `下面是用中文搜到的资料（带编号）。要找在中国做"${zhBusiness}"这门生意的公司。

从资料里挑最多 ${MAX_COMPANIES} 家。必须是资料里写着它自己在做这门生意的；只是被顺带提到、做的是别的生意、或者只是这门生意的客户，都不算。
必须是在中国大陆经营的公司：海外的华人公司（例如在美国开的装修公司）、外国公司的中文网页、台湾香港的公司都不算。
卖给的客户要对得上（卖给企业的，就不收给个人用的 App）。
资料里有专门做这门生意的公司、也有大平台顺带做的，先挑专门做的。每家写：
- source：资料编号（只写数字）。
- name：公司或品牌名，照资料里的写法抄（中文就写中文），用资料里最短的那个叫法，不加"平台""系统""有限公司"这类后缀。
- what_ja：它做什么，一句日文，写给不懂中国的日本人看。只写资料里有的。
- excerpt：能说明它在做这门生意的那句原文，逐字照抄（不翻译、不改字、不拼接），15 到 150 字。
- excerpt_ja：这句原文的日文翻译，忠实，不加不减。

数字和英文词只能照资料写；资料里没有的数字、英文词不要写进 what_ja 和 excerpt_ja（不要给公司名加拼音或英文名）。
不评价好坏，不写"有望""チャンス""注目"这类词。what_ja 和 excerpt_ja 必须是日文。
资料里一家都没有，就给空数组。

只输出 JSON：{"companies":[{"source":1,"name":"…","what_ja":"…","excerpt":"…","excerpt_ja":"…"}]}`;

export type FoundCompany = Omit<ChinaCompany, "same">;

/**
 * 每家都要过代码核对，不过的那家丢掉（不重写）：原文逐字在那篇资料里、公司名在原文或标题里、
 * 译文的数字和英文词在原文里、说明的数字和英文词在那篇资料里。日文和禁用词不过就报错让它重写。
 */
export function parseChinaCompanies(value: unknown, sources: SearchSource[]): FoundCompany[] {
  const raw = (value as { companies?: unknown } | null)?.companies;
  if (!Array.isArray(raw)) throw new Error("缺少 companies");
  const out: FoundCompany[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const src = sources[sourceIndex(v.source)];
    const name = str(v.name, 40);
    const what_ja = dropRomanized(str(v.what_ja, 200));
    const excerpt = str(v.excerpt, 300);
    const excerpt_ja = dropRomanized(str(v.excerpt_ja, 400));
    if (!src || !name || !what_ja || !excerpt || !excerpt_ja) continue;
    // 网页标题也是这页上的原文（模型常拿标题当摘录）
    const page = `${src.title}\n${src.content}`;
    if (excerpt.replace(/\s+/g, "").length < 15 || !quoteIn(excerpt, page)) continue;
    if (!squash(page).includes(squash(name))) continue;
    if (unsupported(excerpt_ja, excerpt) || unsupported(what_ja, page)) continue;
    if (out.some((o) => squash(o.name) === squash(name))) continue;
    out.push({ name, what_ja, excerpt, excerpt_ja, url: src.url, title: src.title });
    if (out.length >= MAX_COMPANIES) break;
  }
  const texts = out.flatMap((c) => [c.what_ja, c.excerpt_ja]);
  assertJapanese(texts);
  assertNoHype(texts);
  return out;
}

/** 第 2 步：从中文资料里挑做同一门生意的公司（原文核对）。 */
export async function extractChinaCompanies(userId: string, zhBusiness: string, sources: SearchSource[]): Promise<FoundCompany[]> {
  const contents = sources.map((s, i) => `[资料 ${i + 1}] ${s.title}\n${s.url}\n${s.content.slice(0, 1500)}`).join("\n\n");
  return executeAiJson(
    { userId, operation: "china_lens_companies", module: "jobs", outputMode: "json", timeoutMs: 40_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1 ? "\n\n上一次输出没通过校验：what_ja 和 excerpt_ja 必须是日文（要有平假名），不许有吹捧的词；excerpt 逐字照抄资料原文。" : ""),
      config: {
        systemInstruction: companiesPrompt(zhBusiness),
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 3000,
      },
    }),
    (value) => parseChinaCompanies(value, sources)
  );
}

// ---- 裁判：是不是同一门生意 --------------------------------------------------------

export function parseSameBusiness(answers: Record<string, unknown>, count: number): boolean[] {
  return Array.from({ length: count }, (_, i) => secondOption(answers[`c_${i}`]) > SAME_ABOVE);
}

/**
 * 另一个模型独立判：每家的原文写的是不是它自己在做这门生意。
 * 写公司的模型常把"被顺带提到的""做相邻生意的"也算进来；面试官一眼看出不对，比少一家更伤。
 * 裁判没调通返回 ok:false（调用方照留、标「別のAIの確認はまだ」）。
 */
export async function judgeSameBusiness(
  zhBusiness: string,
  companies: Pick<ChinaCompany, "name" | "excerpt">[]
): Promise<{ ok: true; same: boolean[] } | { ok: false }> {
  if (companies.length === 0) return { ok: true, same: [] };
  const questions: Record<string, JevQuestion> = {};
  companies.forEach((c, i) => {
    questions[`c_${i}`] = {
      type: "score",
      instructions: `[${i}] 这句原文，写的是不是「${c.name}」这家在中国大陆经营的公司，自己在做上面这门生意（卖给同一类客户的同一类东西）？只是被顺带提到、做的是相邻的别的生意、只是这门生意的客户、卖给个人而不是企业（或反过来）、在中国大陆以外经营（海外华人公司、外国公司、台湾香港），都算不是。`,
      criteria: ["不是：说的是别的生意、别的客户，或者不在中国大陆经营", "是：一家中国大陆的公司，自己在做这门生意"],
    };
  });
  const state = [`这门生意：${zhBusiness}`, ...companies.map((c, i) => `[${i}] ${c.name}：「${c.excerpt}」`)].join("\n");
  try {
    const same = await executeJev({ operation: "china_lens_judge", module: "jobs", timeoutMs: 25_000 }, { state, questions }, (result) =>
      parseSameBusiness(result.answers, companies.length)
    );
    return { ok: true, same };
  } catch (e) {
    console.error("china lens judge failed", e);
    return { ok: false };
  }
}

// ---- 第 3 步：日本这边 -------------------------------------------------------------

const JAPAN_PLAN_PROMPT = `下面是在中国做某门生意的几家公司（附资料原文）。想知道：这门生意在中国做成靠的条件，日本有没有。
很多东西在日本没有，不是因为没人想到，而是它在中国做成靠的条件，日本不具备。
要特意找日本可能不具备的条件，不要只列对日本有利的。

列 3 到 ${MAX_CONDITIONS} 个条件，每个写：
- name：条件的短名字，日文，20 字以内（例：「スマホ決済の普及」「人件費の安さ」「規制で認められている」「中小企業がITにお金を払う習慣」）。
  写成一件具体、在日本能查到统计或报道的事；不要把好几件事揉在一起（不好的例：「多層的なニーズを持つ巨大な市場規模」）。
- there_ja：这一条在中国是什么情况，一句日文。不许写任何数字 —— 这句没有出处，面试官会当成事实。
- query_ja：查"日本现在这一条怎样"的日文搜索词，3 到 8 个词。用日本人自己会搜的说法，带具体的制度名、统计名或调查名
  （例：「働き方改革関連法 勤怠 客観的把握」「中小企業 クラウドサービス 利用率 総務省」），不要只写抽象的词。
再写 entrant_queries：两个搜索词，查"有没有中国的同行来过日本、结果怎样"：第一个日文（例："中国 勤怠管理 日本進出 撤退"），第二个中文（例："考勤 SaaS 出海 日本"）。

不写空话，不评价好坏，不写"有望""チャンス"这类词。

只输出 JSON：{"conditions":[{"name":"…","there_ja":"…","query_ja":"…"}],"entrant_queries":["…","…"]}`;

export type JapanPlan = {
  conditions: { name: string; there_ja: string; query_ja: string }[];
  entrant_queries: string[];
};

export function parseJapanPlan(value: unknown): JapanPlan {
  const v = (value ?? {}) as Record<string, unknown>;
  const conditions = (Array.isArray(v.conditions) ? v.conditions : [])
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({ name: str(c.name, 40), there_ja: str(c.there_ja, 200), query_ja: str(c.query_ja, 120) }))
    .filter((c) => c.name && c.there_ja && c.query_ja)
    .slice(0, MAX_CONDITIONS);
  if (conditions.length < 2) throw new Error("条件不到两个");
  // 中国那边的说明没有出处，写了数字面试官会当成事实
  const withNumber = conditions.find((c) => numbersIn(c.there_ja).length > 0);
  if (withNumber) throw new Error(`中国那边的说明写了数字：${withNumber.there_ja.slice(0, 20)}`);
  assertJapanese(conditions.map((c) => c.there_ja));
  assertNoHype(conditions.flatMap((c) => [c.name, c.there_ja]));
  const entrant_queries = (Array.isArray(v.entrant_queries) ? v.entrant_queries : [])
    .map((q) => str(q, 80))
    .filter(Boolean)
    .slice(0, 2);
  return { conditions, entrant_queries };
}

/** 第 3 步前半：那边做成靠的条件、查日本用的日文搜索词、查中国同行来没来过的搜索词。 */
export async function planJapanConditions(
  userId: string,
  zhBusiness: string,
  companies: Pick<ChinaCompany, "name" | "excerpt">[]
): Promise<JapanPlan> {
  const contents = [`这门生意：${zhBusiness}`, ...companies.map((c) => `- ${c.name}：「${c.excerpt}」`)].join("\n");
  return executeAiJson(
    { userId, operation: "china_lens_japan_plan", module: "jobs", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents: contents + (attempt === 1 ? "\n\n上一次输出没通过校验：there_ja 必须是日文、不许写数字，条件至少两个，不许有吹捧的词。" : ""),
      config: {
        systemInstruction: JAPAN_PLAN_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 1024 },
        maxOutputTokens: 3000,
      },
    }),
    parseJapanPlan
  );
}

const japanJudgePrompt = (zhBusiness: string) => `你在看一门在中国做成的生意（"${zhBusiness}"），它靠的条件日本有没有。下面每个条件附了上网搜到的、关于日本现在情况的资料；最后附了"中国同行来没来过日本"的资料。

每个条件输出：
- i：编号。
- here_ja：日本现在这一条怎样，一句日文，只写资料里有的；只说日本这边，不拿中国比较，不下结论。
- holds："yes"（日本也有）/"no"（日本没有，要做先得解决它）/"unclear"（资料说不清）。
- basis：支撑 here_ja 的资料原文，逐字照抄（不翻译、不改字，15 到 150 字），附这个条件下面的资料编号 source。资料里没有就给空数组，holds 写 "unclear"。
here_ja 里的数字和英文词必须在 basis 的原文里。

再写 entrants：资料里写着的、来过日本的中国同行，最多 ${MAX_ENTRANTS} 件。
只收做"${zhBusiness}"这门生意（或很接近的生意）的中国公司进入日本的事；别的行业的中国公司（短视频、游戏、搜索引擎之类）不算，
日本公司去中国的方向也不算。每件
{"text_ja":"谁、什么时候、结果怎样（退出了、没做起来也照写），一句日文","basis":[{"source":资料编号,"excerpt":"逐字原文"}]}；
text_ja 里的数字必须在 basis 的原文里。没有就给空数组。

不要打分，不要下"值得做 / 不值得做""有机会"的结论。叙述用日文（basis 照抄原文）。

只输出 JSON：{"items":[{"i":0,"here_ja":"…","holds":"no","basis":[{"source":1,"excerpt":"…"}]}],"entrants":[]}`;

type ConditionInput = { condition: JapanPlan["conditions"][number]; sources: SearchSource[] };

/** 拿不出逐字对得上的原文，或者日文里的数字、英文词原文里没有，就不许说有没有（一律資料なし）；来过日本的同理，对不上就丢。 */
export function parseJapanJudgment(value: unknown, inputs: ConditionInput[], entrantSources: SearchSource[]): ChinaJapan {
  const v = (value ?? {}) as Record<string, unknown>;
  const items = Array.isArray(v.items) ? v.items : [];
  const conditions = inputs.map(({ condition, sources }, i): JapanCondition => {
    const it = items.find((r) => r && typeof r === "object" && Number((r as Record<string, unknown>).i) === i) as
      | Record<string, unknown>
      | undefined;
    const basis = verifiedBasis(it?.basis, sources);
    const here = str(it?.here_ja, 200);
    if (basis.length === 0 || !here || unsupported(here, basis.map((b) => b.excerpt).join("\n"))) {
      return { name: condition.name, there_ja: condition.there_ja, here_ja: DEFAULT_HERE, holds: "unclear", basis: [] };
    }
    const holds: Holds = it?.holds === "yes" || it?.holds === "no" ? it.holds : "unclear";
    return { name: condition.name, there_ja: condition.there_ja, here_ja: here, holds, basis };
  });
  const entrants: JapanEntrant[] = (Array.isArray(v.entrants) ? v.entrants : [])
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({ text_ja: str(e.text_ja, 200), basis: verifiedBasis(e.basis, entrantSources) }))
    .filter((e) => e.text_ja && e.basis.length > 0 && !unsupported(e.text_ja, e.basis.map((b) => b.excerpt).join("\n")))
    .slice(0, MAX_ENTRANTS);
  const texts = [...conditions.map((c) => c.here_ja), ...entrants.map((e) => e.text_ja)];
  assertJapanese(texts);
  assertNoHype(texts);
  return { conditions, entrants };
}

/** 第 3 步后半：拿日本的资料判每个条件有没有，再看中国同行来没来过。 */
export async function judgeJapanConditions(
  userId: string,
  zhBusiness: string,
  inputs: ConditionInput[],
  entrantSources: SearchSource[]
): Promise<ChinaJapan> {
  const block = (sources: SearchSource[]) =>
    sources.length > 0
      ? sources.map((s, j) => `  [资料 ${j + 1}] ${s.title}\n  ${s.url}\n  ${s.content.slice(0, 1000)}`).join("\n")
      : "  （没搜到资料）";
  const contents = [
    ...inputs.map(({ condition, sources }, i) => `【${i}】${condition.name}（中国那边：${condition.there_ja}）\n${block(sources)}`),
    `【中国同行来没来过日本】\n${block(entrantSources)}`,
  ].join("\n\n");
  return executeAiJson(
    { userId, operation: "china_lens_japan_judge", module: "jobs", outputMode: "json", timeoutMs: 40_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1
          ? "\n\n上一次输出没通过校验：叙述必须是日文（要有平假名），不许有吹捧的词；basis 逐字照抄那个条件下面资料的原文，source 是资料编号。"
          : ""),
      config: {
        systemInstruction: japanJudgePrompt(zhBusiness),
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 3000,
      },
    }),
    (value) => parseJapanJudgment(value, inputs, entrantSources)
  );
}

// ---- 裁判：日本那边的原文是不是真在说这一条 --------------------------------------
// 原文逐字核对只保证"这句在网页上"；2026-10-17 试跑时拿"某国人口 160 万"去证明"潜在用户多"，
// 拿"Moka 发布了 AI 产品"当成"来过日本"。说没说到点子上，另请 Jev 判。

const EVIDENCE_ABOVE = 0.5;

export type JapanVerdict = { conditions: boolean[]; entrants: boolean[] };

/** 没原文的条件本来就是資料なし，不问裁判，算过。 */
export function parseJapanVerdict(answers: Record<string, unknown>, japan: ChinaJapan): JapanVerdict {
  return {
    conditions: japan.conditions.map((c, i) => c.basis.length === 0 || secondOption(answers[`k_${i}`]) > EVIDENCE_ABOVE),
    entrants: japan.entrants.map((_, j) => secondOption(answers[`e_${j}`]) > EVIDENCE_ABOVE),
  };
}

/** 裁判判"没写着"的：条件改成資料なし，来过日本的那件丢掉。 */
export function applyJapanVerdict(japan: ChinaJapan, verdict: JapanVerdict): ChinaJapan {
  return {
    conditions: japan.conditions.map(
      (c, i): JapanCondition => (verdict.conditions[i] ? c : { ...c, here_ja: DEFAULT_HERE, holds: "unclear", basis: [] })
    ),
    entrants: japan.entrants.filter((_, j) => verdict.entrants[j]),
  };
}

/** 第 3 步最后：每条日本原文、每件"来过日本"请 Jev 判是不是真说到了。裁判没调通就原样返回。 */
export async function judgeJapanEvidence(zhBusiness: string, japan: ChinaJapan): Promise<ChinaJapan> {
  const questions: Record<string, JevQuestion> = {};
  const lines: string[] = [`这门生意：${zhBusiness}`];
  japan.conditions.forEach((c, i) => {
    if (c.basis.length === 0) return;
    lines.push(`[k_${i}] 条件「${c.name}」的日本资料原文：${c.basis.map((b) => `「${b.excerpt}」`).join(" ")}`);
    questions[`k_${i}`] = {
      type: "score",
      instructions: `[k_${i}] 这几句日本资料原文，直接写着「${c.name}」这一条在日本现在怎样吗？只是同一个大话题、说的是别的国家、或者跟这一条没关系，都算没写着。`,
      criteria: ["没写着：跟这一条没关系，或者说的不是日本", "写着：直接说了这一条在日本的情况"],
    };
  });
  japan.entrants.forEach((e, j) => {
    lines.push(`[e_${j}] ${e.text_ja}　原文：${e.basis.map((b) => `「${b.excerpt}」`).join(" ")}`);
    questions[`e_${j}`] = {
      type: "score",
      instructions: `[e_${j}] 这几句原文，直接写着一家做上面这门生意（或很接近的生意）的中国公司进入过日本（或试过、退出了）吗？别的行业的公司、日本公司去中国、只说了这家公司在中国的事，都算没写着。`,
      criteria: ["没写着", "写着：一家做这门生意的中国公司进过日本"],
    };
  });
  if (Object.keys(questions).length === 0) return japan;
  try {
    const verdict = await executeJev(
      { operation: "china_lens_japan_evidence", module: "jobs", timeoutMs: 25_000 },
      { state: lines.join("\n"), questions },
      (result) => parseJapanVerdict(result.answers, japan)
    );
    return applyJapanVerdict(japan, verdict);
  } catch (e) {
    console.error("china lens evidence judge failed", e);
    return japan;
  }
}
