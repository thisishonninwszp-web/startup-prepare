import { executeAiJson } from "@/lib/ai-gateway";
import { MODEL } from "./shared";
import { checkDraft, checkSentences, entrySourceText, numbersIn, quoteIn } from "@/lib/domains/jobs/provenance-shared";
import { isDiagnosis } from "@/lib/domains/jobs/hiring-shared";
import { FILL_KEYS, isConsentField, isFillKey, type FillKey, type FormField } from "@/lib/domains/jobs/fill-shared";
import {
  CAREER_TOPICS,
  HIRE_TYPES,
  JOB_CATEGORIES,
  REMOTE_LEVELS,
  RESUME_SECTION_KEYS,
  VISA_FITS,
  type CareerEntry,
  type CareerTopic,
  type DroppedSentence,
  type HireType,
  type PostingCategory,
  type PostingCondition,
  type PostingFacts,
  type PostingMatch,
  type PostingTerm,
  type RemoteLevel,
  type ResumeSection,
  type ResumeSectionKey,
  type TailoredResume,
  type VisaFit,
} from "@/lib/domains/jobs/shared";

// ---------------------------------------------------------------------------
// 求职：抽岗位、对照底稿、整理底稿、改简历。
// 宪法原则 2：对他说的话（卡在哪、追问）要挑刺、不许夸；简历正文是写给招聘方的，可以正面写，
// 但每句都要标出处，由代码核对（provenance-shared.ts）—— AI 不能替他编经历。
// 招聘页上的原话也由代码核对，对不上的条目丢掉。
// ---------------------------------------------------------------------------

const PRAISE = /很有潜力|不错的|很棒|很优秀|很厉害|加油|相信你|完全没问题|非常适合/;

/** 对他说的话不许夸（宪法原则 2）。 */
export function assertNoPraise(text: string): void {
  if (PRAISE.test(text)) throw new Error("对他说的话里有夸奖");
}

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function intOrNull(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(n) && n > 0 && n < 10_000 ? n : null;
}

// ---- 抽岗位 ---------------------------------------------------------------

export type ExtractedPosting =
  | { is_posting: false }
  | { is_posting: true; company: string; title: string; category: PostingCategory; facts: PostingFacts };

const EXTRACT_PROMPT = `下面是一个网页的正文。他在日本找工作（在留资格是技术・人文知识・国际业务），要你从这页里抽出岗位信息。

先判断 is_posting：这一页是不是"一个具体职位"的招聘页。列了很多职位的列表页、新闻、博客、求职技巧文章都是 false；是 false 时其余字段写空值。

是招聘页时写：
- company：招聘的公司名，照页面上的写法。
- title：职位名，照页面上的写法。
- location：勤務地，照页面上的写法；没写就空字符串。
- remote：full（全远程）/ mostly（基本远程，每月只出社几次）/ hybrid（每周固定几天出社）/ none（不远程）/ unknown（页面上没说）。
- salary_min、salary_max：页面上明写的年收（或年俸），单位万日元的整数。只写了月给、时给，或者没写，就都填 null，不要自己换算。
- salary_quote：年收那一句的原话，逐字照抄；没有就空字符串。
- conditions：应募条件。必须条件（必須、応募資格）和加分条件（歓迎、尚可）都列，最多 12 条，每条：
  - text：这条要的是什么，一句中文
  - quote：页面上的原话，逐字照抄（10 到 100 字）
  - required：必须条件 true，加分条件 false
- terms：别的条件，只抽这几样：远程或出社的天数、加班（残業）、休日休假、副业可否、试用期。每条 label（中文两三个字）和 quote（原话逐字照抄）。没写的不列。
- category：这份工作主要是哪一类：data（数据分析）、consulting（咨询）、planning（事业企划、经营企划）、chinese（中文写在必须条件里）、none（都不是）。中文是必须条件就选 chinese，否则选工作内容最接近的一类。
  consulting 只算给企业做经营、业务、IT、数据方面咨询的工作；职位名带"コンサルタント"但其实是人才中介（人材紹介）、保险、不动产、广告这类销售的，选 none。
- visa：工作内容跟技人国对不对得上：
  - fit：fits（企划、分析、市场、咨询、翻译口译、工程师这类要专业知识的工作）/ no（主要是接客、店头销售、工厂、仓库、清扫、驾驶、护理这类现场作业）/ unclear（看不出来）
  - quote：業務内容的原话，逐字照抄（10 到 150 字）
  - reason：一句中文，说为什么这样判。只说工作内容，不替入管下结论。
- hire_type：招的是哪种人：mid（中途採用、経験者採用；"ポテンシャル採用""未経験歓迎"的中途也算 mid）/ second_new（明写对象是第二新卒、既卒）/ new（只招新卒）/ unclear（看不出来）。中途和第二新卒都写了的算 mid。
- experience：必须条件里要求的最少实务经验：
  - min_years：整数年数；写着"未経験可""経験不問""未経験歓迎"填 0；没写经验年数填 null。"〇ヶ月以上"按不满一年填 1。
  - quote：写着这件事的那一句原话，逐字照抄；min_years 是 null 时写空字符串。

原话一律逐字照抄，不翻译、不改字、不补字；找不到原话的条目不要写。

只输出 JSON：{"is_posting":true,"company":"…","title":"…","location":"…","remote":"unknown","salary_min":null,"salary_max":null,"salary_quote":"","conditions":[{"text":"…","quote":"…","required":true}],"terms":[{"label":"…","quote":"…"}],"category":"data","visa":{"fit":"fits","quote":"…","reason":"…"},"hire_type":"mid","experience":{"min_years":null,"quote":""}}`;

/** 原话对不上的条件、别的条件丢掉；年收的数要在年收原话里（写成円的也认）；签证没有原话撑着算说不清。 */
export function parsePostingFacts(value: unknown, body: string): ExtractedPosting {
  const v = (value ?? {}) as Record<string, unknown>;
  if (v.is_posting !== true) return { is_posting: false };
  const company = str(v.company, 80);
  const title = str(v.title, 120);
  if (!company || !title) throw new Error("是招聘页但公司名或职位名没写");

  const remote: RemoteLevel = typeof v.remote === "string" && v.remote in REMOTE_LEVELS ? (v.remote as RemoteLevel) : "unknown";

  const salaryQuote = str(v.salary_quote, 200);
  let salaryMin = intOrNull(v.salary_min);
  let salaryMax = intOrNull(v.salary_max);
  const quoted = new Set(numbersIn(salaryQuote));
  const inQuote = (n: number | null) => n === null || quoted.has(String(n)) || quoted.has(String(n * 10_000));
  if (!quoteIn(salaryQuote, body) || !inQuote(salaryMin) || !inQuote(salaryMax)) {
    salaryMin = null;
    salaryMax = null;
  }

  const conditions: PostingCondition[] = (Array.isArray(v.conditions) ? v.conditions : [])
    .flatMap((c) => {
      const x = (c ?? {}) as Record<string, unknown>;
      const text = str(x.text, 80);
      const quote = str(x.quote, 200);
      return text && quoteIn(quote, body) ? [{ text, quote, required: x.required === true }] : [];
    })
    .slice(0, 12);

  const terms: PostingTerm[] = (Array.isArray(v.terms) ? v.terms : [])
    .flatMap((t) => {
      const x = (t ?? {}) as Record<string, unknown>;
      const label = str(x.label, 10);
      const quote = str(x.quote, 200);
      return label && quoteIn(quote, body) ? [{ label, quote }] : [];
    })
    .slice(0, 8);

  const category: PostingCategory =
    v.category === "none" || (typeof v.category === "string" && v.category in JOB_CATEGORIES) ? (v.category as PostingCategory) : "none";

  const visaRaw = (v.visa ?? {}) as Record<string, unknown>;
  const visaQuote = str(visaRaw.quote, 300);
  const quoteOk = quoteIn(visaQuote, body);
  const fit: VisaFit = quoteOk && typeof visaRaw.fit === "string" && visaRaw.fit in VISA_FITS ? (visaRaw.fit as VisaFit) : "unclear";

  const hireType: HireType = typeof v.hire_type === "string" && v.hire_type in HIRE_TYPES ? (v.hire_type as HireType) : "unclear";
  // 经验年数只认原话里写着的：年数要出现在原话里；0 要原话里写着未経験、不問
  const expRaw = (v.experience ?? {}) as Record<string, unknown>;
  const expQuote = str(expRaw.quote, 200);
  const years = typeof expRaw.min_years === "number" && Number.isInteger(expRaw.min_years) && expRaw.min_years >= 0 && expRaw.min_years < 30 ? expRaw.min_years : null;
  const expOk =
    years !== null &&
    quoteIn(expQuote, body) &&
    (years === 0 ? /未経験|経験不問|不問|ポテンシャル/.test(expQuote) : numbersIn(expQuote).includes(String(years)) || /ヶ月|か月|カ月/.test(expQuote));
  const experience = expOk ? { min_years: years, quote: expQuote } : { min_years: null, quote: "" };

  return {
    is_posting: true,
    company,
    title,
    category,
    facts: {
      location: str(v.location, 80),
      remote,
      salary_min: salaryMin,
      salary_max: salaryMax,
      salary_quote: salaryMin === null && salaryMax === null ? "" : salaryQuote,
      conditions,
      terms,
      visa: { fit, quote: quoteOk ? visaQuote : "", reason: str(visaRaw.reason, 120) },
      hire_type: hireType,
      experience,
    },
  };
}

/** 从招聘页正文里抽岗位（原话由代码核对）。 */
export async function extractPostingFacts(userId: string, body: string): Promise<ExtractedPosting> {
  return executeAiJson(
    { userId, operation: "job_extract", module: "jobs", outputMode: "json", timeoutMs: 40_000 },
    (attempt) => ({
      model: MODEL,
      contents: body.slice(0, 12_000) + (attempt === 1 ? "\n\n上一次输出没通过校验：是招聘页时 company 和 title 必须写。" : ""),
      config: {
        systemInstruction: EXTRACT_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 3000,
      },
    }),
    (value) => parsePostingFacts(value, body)
  );
}

// ---- 底稿给 AI 看的样子 --------------------------------------------------------

/** 给 AI 看的底稿用短编号（E1、E2……），比 uuid 好抄；解析完再换回真 id。 */
function aliasEntries(entries: CareerEntry[]): { toId: Map<string, string>; sources: Map<string, string>; block: string } {
  const toId = new Map<string, string>();
  const sources = new Map<string, string>();
  const lines = entries.map((e, i) => {
    const alias = `E${i + 1}`;
    toId.set(alias, e.id);
    sources.set(alias, entrySourceText(e));
    return [
      `[${alias}] ${CAREER_TOPICS[e.topic]}｜${e.org || "（没写在哪）"}｜${e.period || "（没写期间）"}`,
      `原话：${e.raw_text}`,
      e.draft_ja ? `日文稿：${e.draft_ja}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });
  return { toId, sources, block: lines.join("\n\n") };
}

function conditionsBlock(conditions: PostingCondition[], anyOf = false): string {
  const lines = conditions.map((c, i) => `[${i + 1}]（${c.required ? "必须" : "加分"}）${c.text} —— 原话：「${c.quote}」`);
  return (anyOf ? ["（招聘页写的是「下面几条满足其中一条就行」：标「必须」的这几条，满足一条就够。）", ...lines] : lines).join("\n");
}

// ---- 对照 -------------------------------------------------------------------

const MATCH_PROMPT = `他在找工作。下面是一个岗位的应募条件（带编号），和他确认过的经历底稿（带编号 E1、E2……）。
对每一条条件，找出底稿里能证明他满足这一条的经历，写出那几条的编号；底稿里没有能证明的，给空数组。
只认底稿里写着的事：沾边、"应该也会"、"学一下就行"都不算。宁可判没有，也不要替他凑。

再写 blocker：这家最可能在哪一条上把他筛掉，一两句中文，直说，不安慰、不鼓励。index 写是第几条。

只输出 JSON：{"matches":[{"index":1,"entry_ids":["E1"]}],"blocker":{"index":2,"text":"…"}}`;

/** 返回的 entry_ids 是编号（E1……），由调用方换回 id。不认识的编号丢掉。 */
export function parseMatch(value: unknown, conditionCount: number, aliases: Set<string>): PostingMatch {
  const v = (value ?? {}) as Record<string, unknown>;
  const ids: string[][] = Array.from({ length: conditionCount }, () => []);
  for (const m of Array.isArray(v.matches) ? v.matches : []) {
    const x = (m ?? {}) as Record<string, unknown>;
    const index = Number(x.index);
    if (!Number.isInteger(index) || index < 1 || index > conditionCount) continue;
    const found = (Array.isArray(x.entry_ids) ? x.entry_ids : []).filter((id): id is string => typeof id === "string" && aliases.has(id));
    ids[index - 1] = Array.from(new Set(found));
  }
  const b = (v.blocker ?? {}) as Record<string, unknown>;
  const text = str(b.text, 200);
  if (!text) throw new Error("blocker 没写");
  assertNoPraise(text);
  const index = Number(b.index);
  return { entry_ids: ids, blocker: { index: Number.isInteger(index) && index >= 1 && index <= conditionCount ? index : 0, text } };
}

/** 每条条件对得上底稿哪几条，以及最可能卡他的一条。 */
export async function matchPosting(
  userId: string,
  conditions: PostingCondition[],
  entries: CareerEntry[],
  anyOf = false
): Promise<PostingMatch> {
  if (conditions.length === 0) {
    return { entry_ids: [], blocker: { index: 0, text: "招聘页上没抽到应募条件，对照不了。打开原页面自己看一眼。" } };
  }
  const { toId, block } = aliasEntries(entries);
  const result = await executeAiJson(
    { userId, operation: "job_match", module: "jobs", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        `应募条件：\n${conditionsBlock(conditions, anyOf)}\n\n底稿：\n${block}` +
        (attempt === 1 ? "\n\n上一次输出没通过校验：blocker.text 必须写，不许夸他。" : ""),
      config: {
        systemInstruction: MATCH_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 1500,
      },
    }),
    (value) => parseMatch(value, conditions.length, new Set(toId.keys()))
  );
  return { ...result, entry_ids: result.entry_ids.map((list) => list.map((alias) => toId.get(alias) ?? alias)) };
}

// ---- 底稿草稿 ----------------------------------------------------------------

const DRAFT_PROMPT = `他在写找工作用的经历底稿。给你话题、问他的问题、他用自己的话写的回答（多半是中文），还有他填的"在哪""期间"。

写 draft_ja：把他的回答整理成日本職務経歴書里常见的写法，日文，2 到 5 句，事实不增不减：
- 只写他说了的事；他没说的数字、工具名、成果一律不写，"約""以上"这种他没说的修饰也不写
- 他说的数字原样保留
- 用"〜を担当""〜を実施""〜により〜"这类写法，不夸张，不用"大幅に""飛躍的に"

再写 follow_up：一个追问，中文，一句，问这段经历里最虚的那一处（结果是跟什么比的、哪一部分是他自己做的、有没有数字）。不夸他，不说"很好"。

只输出 JSON：{"draft_ja":"…","follow_up":"…"}`;

export type EntryDraft = { draft_ja: string; dropped: DroppedSentence[]; follow_up: string };

/** 日文稿里数字、英文词在原话里找不到的句子删掉（他的原话 = source）。 */
export function parseEntryDraft(value: unknown, source: string): EntryDraft {
  const v = (value ?? {}) as Record<string, unknown>;
  const draft = str(v.draft_ja, 1200);
  if (!draft) throw new Error("draft_ja 没写");
  const followUp = str(v.follow_up, 150);
  assertNoPraise(followUp);
  const checked = checkDraft(draft, source);
  return { draft_ja: checked.text, dropped: checked.dropped, follow_up: followUp };
}

export async function draftCareerEntry(
  userId: string,
  input: { topic: CareerTopic; question: string; org: string; period: string; raw: string }
): Promise<EntryDraft> {
  const source = [input.org, input.period, input.raw].join("\n");
  const contents = [
    `话题：${CAREER_TOPICS[input.topic]}`,
    `问他的问题：${input.question || "（他自己写的）"}`,
    `在哪：${input.org || "（没写）"}`,
    `期间：${input.period || "（没写）"}`,
    `他的回答：${input.raw}`,
  ].join("\n");
  return executeAiJson(
    { userId, operation: "job_entry_draft", module: "jobs", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents: contents + (attempt === 1 ? "\n\n上一次输出没通过校验：draft_ja 必须写；follow_up 不许夸他。" : ""),
      config: {
        systemInstruction: DRAFT_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 1500,
      },
    }),
    (value) => parseEntryDraft(value, source)
  );
}

// ---- 改简历 -----------------------------------------------------------------

const TAILOR_PROMPT = `他要投下面这个岗位。给你岗位信息（公司、职位、条件、招聘页节选）和他确认过的经历底稿（编号 E1、E2……）。
用日文写一份職務経歴書和志望動機，分五段，每段若干句，每句都标出处：
- summary（職務要約）：2 到 3 句
- history（職務経歴）：按底稿里的工作和项目写，每条经历 1 到 3 句
- skills（活かせる経験・知識・スキル）：3 到 6 句，每句一项
- pr（自己PR）：2 到 4 句
- motivation（志望動機）：2 到 4 句，把他的经历和这家的工作连起来

规矩：
- 每句的 entry_ids 写这句话出自底稿哪几条（编号）。没有底稿撑着的话不要写。
- 数字、工具名、公司名只能用底稿里写着的，一个字不改；底稿里没有的不许补，"約""以上""大幅"这类他没说的修饰也不许加。
- 朝这个岗位的条件去挑底稿、排顺序，但不许把他没做过的事写成做过。
- 志望動機可以提到这家招聘页上写的工作内容。
- 如果给了「这家现在可能在意的事」（他自己认同的推测，不是事实）：按它挑底稿、排顺序，把最能对上的经历放前面；
  志望動機第一句可以引用依据里的公开事实（名称照依据原话写），再接他的经历。
  不许因为它新增他没做过的事，也不许替对方诊断问题（"御社の課題は""貴社の問題"这类不写）。

再写 probes：面试官看到这份简历最可能追问的 3 句（照抄你写的原句），每句配一个他可能会问的问题（中文）。挑最容易被问穿的，不要挑好回答的。

只输出 JSON：{"summary":[{"text":"…","entry_ids":["E1"]}],"history":[],"skills":[],"pr":[],"motivation":[],"probes":[{"sentence":"…","question":"…"}]}`;

/**
 * 每段各自核对出处；志望動機可以用招聘页上的词，以及他认同的那条推测的依据原话（focusText）。
 * 志望動機里替对方诊断问题的句子丢掉。entry_ids 是编号，由调用方换回 id。
 */
export function parseTailored(value: unknown, sources: Map<string, string>, postingBody: string, focusText = ""): TailoredResume {
  const v = (value ?? {}) as Record<string, unknown>;
  const sections = {} as Record<ResumeSectionKey, ResumeSection>;
  const dropped: TailoredResume["dropped"] = [];
  for (const key of RESUME_SECTION_KEYS) {
    const checked = checkSentences(v[key], sources, key === "motivation" ? [postingBody, focusText].join("\n") : "");
    let kept = checked.kept;
    if (key === "motivation") {
      for (const s of kept.filter((s) => isDiagnosis(s.text))) dropped.push({ text: s.text, reason: "替对方诊断问题（御社の課題…），书类里不写", section: key });
      kept = kept.filter((s) => !isDiagnosis(s.text));
    }
    sections[key] = { sentences: kept };
    dropped.push(...checked.dropped.map((d) => ({ ...d, section: key })));
  }
  if (sections.summary.sentences.length === 0 && sections.history.sentences.length === 0) {
    throw new Error("職務要約和職務経歴一句都没留下来");
  }
  const keptTexts = new Set(RESUME_SECTION_KEYS.flatMap((k) => sections[k].sentences.map((s) => s.text)));
  const probes = (Array.isArray(v.probes) ? v.probes : [])
    .flatMap((p) => {
      const x = (p ?? {}) as Record<string, unknown>;
      const sentence = str(x.sentence, 300);
      const question = str(x.question, 150);
      return keptTexts.has(sentence) && question ? [{ sentence, question }] : [];
    })
    .slice(0, 3);
  return { sections, probes, dropped };
}

export async function tailorResume(
  userId: string,
  posting: {
    company: string;
    title: string;
    conditions: PostingCondition[];
    body: string;
    /** 他认同的「这家为什么现在招」那一条，和依据原话。 */
    focus?: { need: string; quotes: string[] } | null;
  },
  entries: CareerEntry[]
): Promise<TailoredResume> {
  const { toId, sources, block } = aliasEntries(entries);
  const focusText = posting.focus ? posting.focus.quotes.join("\n") : "";
  const contents = [
    `岗位：${posting.company}｜${posting.title}`,
    `条件：\n${conditionsBlock(posting.conditions) || "（没抽到）"}`,
    `招聘页节选：\n${posting.body.slice(0, 4000)}`,
    ...(posting.focus
      ? [`这家现在可能在意的事（他认同的推测，不是事实）：${posting.focus.need}\n依据原话：\n${posting.focus.quotes.map((q) => `「${q}」`).join("\n")}`]
      : []),
    `底稿：\n${block}`,
  ].join("\n\n");
  const result = await executeAiJson(
    { userId, operation: "job_tailor", module: "jobs", outputMode: "json", timeoutMs: 50_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1 ? "\n\n上一次输出没通过校验：每句都要标底稿编号，数字和英文词只能用底稿里写着的。" : ""),
      config: {
        systemInstruction: TAILOR_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 4000,
      },
    }),
    (value) => parseTailored(value, sources, posting.body, focusText)
  );
  const sections = Object.fromEntries(
    RESUME_SECTION_KEYS.map((key) => [
      key,
      { sentences: result.sections[key].sentences.map((s) => ({ ...s, entry_ids: s.entry_ids.map((alias) => toId.get(alias) ?? alias) })) },
    ])
  ) as Record<ResumeSectionKey, ResumeSection>;
  return { ...result, sections };
}

// ---- 表单格子对应（官网填表助手）--------------------------------------------------

const FIELD_MAP_PROMPT = `下面是日本一家公司招聘页上的应募表单，列出了每一格（编号、类型、格子名字、选项），还有"可以填的东西"的清单（键和说明）。
把每一格对应到清单里的一样；对应不上的不写。
- 只按格子的名字和类型对应，拿不准就不写，不要猜。
- 只有邮箱可以对应两格（邮箱和"邮箱确认"）；别的一样只对应一格。
- 文件上传格只能对应 resume_pdf；文字格、下拉框不能对应 resume_pdf。
- 勾选框、单选、"同意"之类的一律不要对应。
- 姓和名分两格时用 last_name / first_name，合在一格用 name；ふりがな同理。
- 住所分成好几格时，只有第一格（都道府県・市区町村・番地，或者"都道府県"的下拉框）对应 address；建物名、部屋番号那格不对应。
- 生年月日分成年、月、日几个下拉框时，用 birth_year / birth_month / birth_day；格子名字可能对不齐，看选项判断（四位数的是年、1 到 12 的是月、1 到 31 的是日）。

只输出 JSON：{"map":[{"index":0,"key":"email"}]}`;

/** 一样东西只能对应几格：邮箱可以有"再输一次"，别的只填页面上最先出现的那一格（住所第二行、建物名不重复填）。 */
const REPEATABLE_KEYS = new Set<FillKey>(["email"]);

/** 只留认得的格子和键；文件格只能放 PDF、PDF 只能放文件格；勾选框、单选、同意框不对应；除邮箱外一样只对应一格。 */
export function parseFieldMap(value: unknown, fields: FormField[]): Map<number, FillKey> {
  const byIndex = new Map(fields.map((f) => [f.index, f]));
  const valid: [FormField, FillKey][] = [];
  for (const item of Array.isArray((value as { map?: unknown } | null)?.map) ? (value as { map: unknown[] }).map : []) {
    const x = (item ?? {}) as Record<string, unknown>;
    const field = byIndex.get(Number(x.index));
    if (!field || !isFillKey(x.key)) continue;
    if (field.kind === "checkbox" || field.kind === "radio" || isConsentField(field)) continue;
    if ((field.kind === "file") !== (x.key === "resume_pdf")) continue;
    valid.push([field, x.key]);
  }
  const out = new Map<number, FillKey>();
  const used = new Set<FillKey>();
  for (const [field, key] of valid.sort((a, b) => a[0].index - b[0].index)) {
    if (out.has(field.index) || (used.has(key) && !REPEATABLE_KEYS.has(key))) continue;
    out.set(field.index, key);
    used.add(key);
  }
  return out;
}

/** 表单上每一格对应哪一样（AI 只看得到格子的名字和可以填的东西的说明，看不到他的任何个人信息）。 */
export async function mapFormFields(userId: string, fields: FormField[]): Promise<Map<number, FillKey>> {
  const candidates = fields.filter((f) => f.kind !== "checkbox" && f.kind !== "radio");
  if (candidates.length === 0) return new Map();
  const fieldLines = candidates
    .map((f) => `[${f.index}] ${f.kind}${f.type !== f.kind ? `/${f.type}` : ""}　${f.label || "（没有名字）"}${f.options.length ? `　选项：${f.options.slice(0, 12).join(" / ")}` : ""}`)
    .join("\n");
  const keyLines = (Object.entries(FILL_KEYS) as [FillKey, string][]).map(([k, d]) => `${k}：${d}`).join("\n");
  return executeAiJson(
    { userId, operation: "job_field_map", module: "jobs", outputMode: "json", timeoutMs: 30_000, payloadLogging: "metadata_only" },
    (attempt) => ({
      model: MODEL,
      contents: `表单的格子：\n${fieldLines}\n\n可以填的东西：\n${keyLines}` + (attempt === 1 ? "\n\n上一次输出没通过校验：只输出 {\"map\":[…]}。" : ""),
      config: {
        systemInstruction: FIELD_MAP_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 1500,
      },
    }),
    (value) => parseFieldMap(value, fields)
  );
}
