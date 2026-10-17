import { executeAiJson, executeJev, type JevQuestion } from "@/lib/ai-gateway";
import { MODEL } from "./shared";
import { secondOption, type SearchSource } from "./signals";
import { quoteIn, unsupported } from "@/lib/domains/jobs/provenance-shared";
import { assertJapanese, assertNoHype, type ChinaCompany, type ChinaPlan } from "@/lib/domains/jobs/china-shared";

// ---------------------------------------------------------------------------
// 面试演示「御社の商売、中国ではどうなっている？」：面试官说一句生意 → 中文搜中国同行 → 那边做成靠的条件日本有没有。
// 界面给面试官看，AI 写的叙述一律日文；原文逐字核对，日文里的数字和英文词必须在原文里（代码查）。
// 宪法原则 1、2：不打分、不下"有机会"的结论，要特意找日本不具备的条件。
// ---------------------------------------------------------------------------

const MAX_COMPANIES = 4;
const SAME_ABOVE = 0.5;
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

从资料里挑最多 ${MAX_COMPANIES} 家。必须是资料里写着它自己在做这门生意的；只是被顺带提到、做的是别的生意、或者只是这门生意的客户，都不算。每家写：
- source：资料编号。
- name：公司或服务名，照资料里的写法抄（中文就写中文）。
- what_ja：它做什么，一句日文，写给不懂中国的日本人看。只写资料里有的。
- excerpt：能说明它在做这门生意的那句原文，逐字照抄（不翻译、不改字、不拼接），15 到 150 字。
- excerpt_ja：这句原文的日文翻译，忠实，不加不减。

数字和英文词只能照资料写；资料里没有的数字、英文词不要写进 what_ja 和 excerpt_ja。
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
    const src = sources[(typeof v.source === "number" ? v.source : Number(v.source)) - 1];
    const name = str(v.name, 40);
    const what_ja = str(v.what_ja, 200);
    const excerpt = str(v.excerpt, 300);
    const excerpt_ja = str(v.excerpt_ja, 400);
    if (!src || !name || !what_ja || !excerpt || !excerpt_ja) continue;
    if (excerpt.replace(/\s+/g, "").length < 15 || !quoteIn(excerpt, src.content)) continue;
    if (!squash(`${excerpt}${src.title}`).includes(squash(name))) continue;
    if (unsupported(excerpt_ja, excerpt) || unsupported(what_ja, `${src.title}\n${src.content}`)) continue;
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
      instructions: `[${i}] 这句原文，写的是不是「${c.name}」自己在做上面这门生意（卖给同一类客户的同一类东西）？只是被顺带提到、做的是相邻的别的生意、或者只是这门生意的客户，都算不是。`,
      criteria: ["不是：说的是别的生意，或者它没在做这门生意", "是：它自己在做这门生意"],
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
