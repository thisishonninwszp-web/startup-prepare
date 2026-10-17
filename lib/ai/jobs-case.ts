import { executeAiJson } from "@/lib/ai-gateway";
import { MODEL } from "./shared";
import { assertNoPraise } from "./jobs";
import { assertJapanese } from "@/lib/domains/jobs/china-shared";
import { numbersIn, quoteIn } from "@/lib/domains/jobs/provenance-shared";
import { categoryLabel, type PostingCategory } from "@/lib/domains/jobs/shared";
import {
  assertNoPraiseJa,
  isCaseType,
  isStuckStep,
  type CaseFollowup,
  type CaseQuestion,
  type CaseReview,
} from "@/lib/domains/jobs/case-shared";

// ---------------------------------------------------------------------------
// 「这家可能会问的 case」：按岗位出ケース面接的题 → AI 面试官追问 → 复盘。
// 宪法原则 1：不打分；原则 2：追问专挑漏洞、不许夸。
// 题目里写到这家公司的事要有招聘页原话（代码核对），追问和复盘要引用他写的原话（代码核对）。
// ---------------------------------------------------------------------------

const BODY_CHARS = 6000;
/** 题目里大于这个的数字必须在招聘页里（「3年で2倍」这种出题用的小数字可以，营业额、人数这类事实不许编）。 */
const FRAMING_NUMBER_MAX = 10;
const MAX_FOLLOWUPS = 3;
const KANA = /[぀-ヿ]/;

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// ---- 出题 -------------------------------------------------------------------

const QUESTION_PROMPT = `他在日本找工作，要练ケース面接。下面是他在看的一个岗位（公司、职位、类别、招聘页正文）。
出一道这家公司面试里可能会问的 case 题。

- type：analysis（分析设计：某个数字变了怎么查原因、怎么设计分析）/ improvement（业务或利润改善）/ new_business（新规事业）/ sizing（市场规模的费米估算）/ china（和中国市场有关）。
  按岗位类别挑最贴这家的：数据分析多半 analysis，咨询多半 improvement，事业/经营企划多半 new_business 或 sizing，需要中文多半 china。
- prompt_ja：题目，日文，像面试官当面问的一两句，具体到这家公司在做的生意（例：「この会社の EC 事業の売上を、3年で2倍にするにはどうしますか。」）。
- premise_ja：前提，日文一两句：能不能自己假设数字、有什么数据可以用、要答到什么程度。
- why：为什么出这道，中文一句（这家在做什么、这个岗位要做什么）。
- quote：招聘页正文里支撑 why 的一句原话，逐字照抄（10 到 120 字）。

题目和前提里不要写招聘页里没有的数字（不要编这家公司的营业额、人数）；费米题本来就不需要数字。
不要和"已经出过的题"重复。不夸、不评价这家公司。

只输出 JSON：{"type":"…","prompt_ja":"…","premise_ja":"…","why":"…","quote":"…"}`;

export function parseCaseQuestion(value: unknown, body: string): CaseQuestion {
  const v = (value ?? {}) as Record<string, unknown>;
  if (!isCaseType(v.type)) throw new Error("题型不对");
  const prompt_ja = str(v.prompt_ja, 300);
  const premise_ja = str(v.premise_ja, 300);
  const why = str(v.why, 200);
  const quote = str(v.quote, 200);
  if (!prompt_ja || !premise_ja || !why || !quote) throw new Error("缺字段");
  assertJapanese([prompt_ja, premise_ja]);
  if (!quoteIn(quote, body)) throw new Error("「为什么出这道」引的不是招聘页原话");
  const bodyNumbers = new Set(numbersIn(body));
  const invented = numbersIn(`${prompt_ja}\n${premise_ja}`).find((n) => Number(n) > FRAMING_NUMBER_MAX && !bodyNumbers.has(n));
  if (invented) throw new Error(`题目里有招聘页没有的数字：${invented}`);
  assertNoPraiseJa([prompt_ja, premise_ja]);
  assertNoPraise(why);
  return { type: v.type, prompt_ja, premise_ja, why, quote };
}

/** 按这个岗位出一道（previous：这个岗位已经出过的题目，不重复）。 */
export async function draftCaseQuestion(
  userId: string,
  posting: { company_name: string; title: string; category: PostingCategory; body: string },
  previous: string[]
): Promise<CaseQuestion> {
  const contents = [
    `公司：${posting.company_name}`,
    `职位：${posting.title}`,
    `类别：${categoryLabel(posting.category)}`,
    previous.length > 0 ? `已经出过的题：\n${previous.map((p) => `- ${p}`).join("\n")}` : "",
    `招聘页正文：\n${posting.body.slice(0, BODY_CHARS)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return executeAiJson(
    { userId, operation: "job_case_question", module: "jobs", outputMode: "json", timeoutMs: 40_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1 ? "\n\n上一次输出没通过校验：quote 必须逐字照抄招聘页正文；题目里不要写招聘页没有的数字；prompt_ja 和 premise_ja 用日文。" : ""),
      config: {
        systemInstruction: QUESTION_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 1024 },
        maxOutputTokens: 2000,
      },
    }),
    (value) => parseCaseQuestion(value, posting.body)
  );
}

// ---- 追问 -------------------------------------------------------------------

const FOLLOWUP_PROMPT = `你是日本咨询公司的面试官，正在做ケース面接。下面是题目、前提，和应聘者写的回答（结构）。
追问 2 到 3 个问题，日文，每个对准他回答里一个具体的漏洞：哪块没拆到、哪个假设没有根据、数字从哪来、为什么先做这个。

每个问题写：
- q_ja：追问，日文，一句，像面试官当面问的。
- cites：他回答里被追问的那句话或那个数字，逐字照抄（4 到 60 字）。

不夸、不鼓励（不写「いいですね」「素晴らしい」这类），不给答案、不提示该怎么改。
他写得很少的话，第一个问题就请他把结构写完整（cites 照抄他写的开头）。

只输出 JSON：{"followups":[{"q_ja":"…","cites":"…"}]}`;

export function parseFollowups(value: unknown, answer: string): Omit<CaseFollowup, "a">[] {
  const raw = (value as { followups?: unknown } | null)?.followups;
  if (!Array.isArray(raw)) throw new Error("缺少 followups");
  const out = raw
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({ q_ja: str(f.q_ja, 200), cites: str(f.cites, 120) }))
    .filter((f) => f.q_ja && quoteIn(f.cites, answer))
    .slice(0, MAX_FOLLOWUPS);
  if (out.length < 2) throw new Error("追问不到两个（或没引用他写的原话）");
  assertJapanese(out.map((f) => f.q_ja));
  assertNoPraiseJa(out.map((f) => f.q_ja));
  return out;
}

/** 看他写的结构，追问 2–3 个。 */
export async function askFollowups(userId: string, question: CaseQuestion, answer: string): Promise<Omit<CaseFollowup, "a">[]> {
  const contents = [`题目：${question.prompt_ja}`, `前提：${question.premise_ja}`, `应聘者的回答：\n${answer}`].join("\n\n");
  return executeAiJson(
    { userId, operation: "job_case_followups", module: "jobs", outputMode: "json", timeoutMs: 40_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1 ? "\n\n上一次输出没通过校验：要 2 到 3 个追问，cites 必须逐字照抄他回答里的话（4 字以上），q_ja 用日文，不许夸。" : ""),
      config: {
        systemInstruction: FOLLOWUP_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 1024 },
        maxOutputTokens: 2000,
      },
    }),
    (value) => parseFollowups(value, answer)
  );
}

// ---- 复盘 -------------------------------------------------------------------

const REVIEW_PROMPT = `下面是一道ケース面接的题目、应聘者写的结构、面试官的追问和他的回答。给他写复盘。
他是中国人，日语能做商务沟通：说明用中文，参考结构用日文（面试是日文的）。

- reference_ja：参考结构，3 到 6 条日文要点，是面试里说得出口的一种拆法（先确认题目和目标，再拆，再排先后，最后说结论）。这只是一种参考，不是唯一答案。
- weak：最容易被追问穿的 2 到 3 处，每处 {"quote":"他写的原话（他的结构或对追问的回答里的，逐字照抄，4 到 60 字）","why":"为什么会被问穿，中文一两句"}。
- suggested_step：他主要卡在哪一步，只能是下面五个之一：
  define（题目没问清就开始答）/ split（拆法有漏、有重）/ numbers（数字没根据、算不对）/ prioritize（方案没排先后）/ conclude（没先说结论）。

不打分，不写"答得不错""还差一点"这类评价，不夸。

只输出 JSON：{"reference_ja":["…"],"weak":[{"quote":"…","why":"…"}],"suggested_step":"…"}`;

export function parseReview(value: unknown, his: string): CaseReview {
  const v = (value ?? {}) as Record<string, unknown>;
  const reference_ja = (Array.isArray(v.reference_ja) ? v.reference_ja : [])
    .map((r) => str(r, 200))
    .filter(Boolean)
    .slice(0, 6);
  if (reference_ja.length < 3) throw new Error("参考结构不到三条");
  if (!KANA.test(reference_ja.join(""))) throw new Error("参考结构没用日文");
  const weak = (Array.isArray(v.weak) ? v.weak : [])
    .filter((w): w is Record<string, unknown> => !!w && typeof w === "object")
    .map((w) => ({ quote: str(w.quote, 120), why: str(w.why, 300) }))
    .filter((w) => w.why && quoteIn(w.quote, his))
    .slice(0, 3);
  if (weak.length === 0) throw new Error("被问穿的地方没引用他写的原话");
  if (!isStuckStep(v.suggested_step)) throw new Error("卡在哪一步不在五类里");
  assertNoPraiseJa(reference_ja);
  for (const w of weak) assertNoPraise(w.why);
  return { reference_ja, weak, suggested_step: v.suggested_step };
}

/** 他答完追问以后写复盘。 */
export async function reviewCase(userId: string, question: CaseQuestion, answer: string, followups: CaseFollowup[]): Promise<CaseReview> {
  const his = [answer, ...followups.map((f) => f.a)].join("\n");
  const contents = [
    `题目：${question.prompt_ja}`,
    `前提：${question.premise_ja}`,
    `他写的结构：\n${answer}`,
    ...followups.map((f, i) => `追问 ${i + 1}：${f.q_ja}\n他的回答：${f.a || "（没答）"}`),
  ].join("\n\n");
  return executeAiJson(
    { userId, operation: "job_case_review", module: "jobs", outputMode: "json", timeoutMs: 40_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1
          ? "\n\n上一次输出没通过校验：reference_ja 至少 3 条日文；weak 的 quote 必须逐字照抄他写的话；suggested_step 只能是五个之一；不许夸。"
          : ""),
      config: {
        systemInstruction: REVIEW_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 1024 },
        maxOutputTokens: 3000,
      },
    }),
    (value) => parseReview(value, his)
  );
}
