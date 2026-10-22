import { executeAiJson } from "@/lib/ai-gateway";
import { MODEL } from "./shared";
import { assertChineseAllowingNames, assertNoBanned, titleEchoMatches, type SearchSource } from "./signals";
import { FORECAST_CATEGORIES } from "@/lib/domains/signals/forecast-shared";

/**
 * 预测账本的 AI 部分（原则 1 例外四，经用户同意 2026-10-22）：
 * 市场题译成中文、从新闻出生意题、三种思路各押一个概率、生意题到期时查证据给建议、按存档回答问题。
 * 概率只用于对世界事件的预测；原文摘录一律由代码逐字核对。
 */

const squash = (t: string) => t.replace(/\s+/g, "");

/** 摘录逐字对得上资料原文（去空白比），最多 n 条。 */
export function verifiedExcerpts(raw: unknown, sources: SearchSource[], n = 3): { url: string; title: string; excerpt: string }[] {
  const out: { url: string; title: string; excerpt: string }[] = [];
  for (const b of Array.isArray(raw) ? raw : []) {
    if (!b || typeof b !== "object") continue;
    const o = b as Record<string, unknown>;
    const src = sources[(typeof o.source === "number" ? o.source : Number(o.source)) - 1];
    const excerpt = typeof o.excerpt === "string" ? o.excerpt.trim() : "";
    if (!src || squash(excerpt).length < 8 || !squash(src.content).includes(squash(excerpt))) continue;
    out.push({ url: src.url, title: src.title, excerpt: excerpt.slice(0, 300) });
    if (out.length >= n) break;
  }
  return out;
}

function category(v: unknown): string {
  return typeof v === "string" && (FORECAST_CATEGORIES as readonly string[]).includes(v.trim()) ? v.trim() : "世界";
}

function sourcesText(sources: SearchSource[]): string {
  return sources.map((s, i) => `[${i + 1}] ${s.title}（${s.url}）\n${s.content.slice(0, 1500)}`).join("\n\n");
}

// ── 市场题译成中文 ─────────────────────────────────────────────────────────

export type MarketTranslation = { title: string; criteria: string; category: string };

const MARKET_PROMPT = `下面是预测市场上的一道题（英文）和它的结算说明。把它变成给一个在日本的中国人看的中文题目：
- title：一句「……会不会……？」，说清是谁、什么事、截止到什么时候（照原题的日子写，写成「2026 年 12 月底前」这种）。不要加原题没有的条件。
- criteria：怎么才算「会」，一到两句，只照结算说明写，不加不减；结算说明里没写的就照题目本身写。
- category：从这几个里挑一个：${FORECAST_CATEGORIES.join("、")}。
用简体中文；人名、公司名、机构名可以保留原文。不要写市场现在的概率，不要写你的看法。

只输出 JSON：{"title":"…","criteria":"…","category":"…"}`;

export function parseMarketTranslation(value: unknown): MarketTranslation {
  const v = (value ?? {}) as Record<string, unknown>;
  const title = typeof v.title === "string" ? v.title.trim() : "";
  const criteria = typeof v.criteria === "string" ? v.criteria.trim() : "";
  if (!title || title.length > 120 || !criteria || criteria.length > 400) throw new Error("题目或标准缺了、太长");
  if (/\d{1,3}\s*%|百分之/.test(`${title}${criteria}`)) throw new Error("题目里写了概率");
  assertChineseAllowingNames([title, criteria]);
  assertNoBanned([title, criteria]);
  return { title, criteria, category: category(v.category) };
}

export async function translateMarketQuestion(input: { question: string; description: string; closes: string }): Promise<MarketTranslation> {
  const contents = `题目：${input.question}\n到期：${input.closes}\n结算说明：${input.description || "（没写）"}`;
  return executeAiJson(
    { operation: "forecast_market_translate", module: "unknown", outputMode: "json", timeoutMs: 20_000 },
    () => ({
      model: MODEL,
      contents,
      config: { systemInstruction: MARKET_PROMPT, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 600 },
    }),
    parseMarketTranslation
  );
}

// ── 历史回测：已经结算的题当成「那天」的题 ───────────────────────────────────

export type HistoryPreparation = MarketTranslation & { search: string };

const historyPrompt = (asOf: string) => `下面是预测市场上一道已经结束的题（英文）和它的说明。我们要把它当成「今天是 ${asOf}」时的一道题来练预测 ——
所以你写的任何东西都不能透露 ${asOf} 以后发生的事，更不能透露结果。说明里有「Update」「Resolved」「更新」「已结算」之类的段落、或者写着 ${asOf} 以后的事，一律不用。
- title：一句「……会不会……？」，说清是谁、什么事、截止到什么时候（照原题的日子写，写成「2025 年 7 月底前」这种）。不要加原题没有的条件。
- criteria：怎么才算「会」，一到两句，照结算说明写，不加不减；说明里没写的就照题目本身写。
- category：从这几个里挑一个：${FORECAST_CATEGORIES.join("、")}。
- search：给新闻检索用的英文关键词，2 到 5 个，专有名词用英文双引号括起来（例：\"Bank of Japan\" rate hike），只写这件事的主题词，不写结果。
title、criteria 用简体中文；人名、公司名、机构名可以保留原文。不要写概率，不要写你的看法。

只输出 JSON：{"title":"…","criteria":"…","category":"…","search":"…"}`;

export function parseHistoryPreparation(value: unknown): HistoryPreparation {
  const t = parseMarketTranslation(value);
  const v = (value ?? {}) as Record<string, unknown>;
  const search = typeof v.search === "string" ? v.search.trim() : "";
  if (!search || search.length > 120) throw new Error("检索词缺了或太长");
  if (/resolv|结算|已经/.test(`${t.title}${t.criteria}${search}`.toLowerCase())) throw new Error("写进了结算的事");
  return { ...t, search };
}

export async function prepareHistoryQuestion(input: { question: string; description: string; asOf: string; resolveOn: string }): Promise<HistoryPreparation> {
  const contents = `题目：${input.question}\n到期：${input.resolveOn}\n说明：${input.description.slice(0, 1200) || "（没写）"}`;
  return executeAiJson(
    { operation: "forecast_history_prepare", module: "unknown", outputMode: "json", timeoutMs: 20_000 },
    () => ({
      model: MODEL,
      contents,
      config: { systemInstruction: historyPrompt(input.asOf), responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 700 },
    }),
    parseHistoryPreparation
  );
}

// ── 到日本题：差距清单里的一条到某天会不会在日本出现 ───────────────────────────

export type ArrivalDraft = { title: string; criteria: string; resolveOn: string; category: AtlasCategoryKey };

/** 时差图谱的类别（和 atlas-shared 的 ATLAS_CATEGORIES 同一组键）。 */
export const ARRIVAL_CATEGORIES = ["payment", "mobility", "commerce", "food", "content", "work", "hardware", "other"] as const;
export type AtlasCategoryKey = (typeof ARRIVAL_CATEGORIES)[number];

export const ARRIVAL_RULES = { minDays: 300, maxDays: 760 };

const ARRIVAL_PROMPT = `下面是一条「那边（中国或美国）已经有、日本还没有」的东西：那边是怎么回事、日本这边现在怎样。
出一道可以对账的预测题：到某一天，日本会不会出现这样东西。
- title：一句「到 YYYY 年 M 月底，日本会不会……？」。说清是什么东西（具体到一类服务或产品，不要泛泛的「这个趋势」）。
- criteria：怎么才算「会」，一到两句，具体到能上网核对：在日本有公司（日本公司，或者那边的公司在日本）正式对外提供这样东西 —— 以官网、新闻稿或报道为准；只是宣布计划、只在测试不算。
- resolve_on：截止日 YYYY-MM-DD，在今天之后 ${ARRIVAL_RULES.minDays} 到 ${ARRIVAL_RULES.maxDays} 天之间，取月底。
- category：它属于哪一类，只能从这几个里挑一个：payment（支付、金融）、mobility（出行）、commerce（零售、电商）、food（外卖、餐饮）、content（内容、社交）、work（工具、企业服务）、hardware（硬件、设备）、other（其他）。
用简体中文；公司名、产品名可以保留原文。不要写概率、不要写你的看法。

只输出 JSON：{"title":"…","criteria":"…","resolve_on":"YYYY-MM-DD","category":"…"}`;

export function parseArrivalDraft(value: unknown, today: string): ArrivalDraft {
  const v = (value ?? {}) as Record<string, unknown>;
  const title = typeof v.title === "string" ? v.title.trim() : "";
  const criteria = typeof v.criteria === "string" ? v.criteria.trim() : "";
  const resolveOn = typeof v.resolve_on === "string" ? v.resolve_on.trim() : "";
  const cat = typeof v.category === "string" ? v.category.trim() : "";
  if (!title || title.length > 120 || !criteria || criteria.length > 400) throw new Error("题目或标准缺了、太长");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(resolveOn)) throw new Error("截止日格式不对");
  const days = Math.round((Date.parse(`${resolveOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (!(days >= ARRIVAL_RULES.minDays && days <= ARRIVAL_RULES.maxDays)) throw new Error("截止日不在范围里");
  if (/\d{1,3}\s*%|百分之|你的|跟你/.test(`${title}${criteria}`)) throw new Error("写了概率或「你」");
  assertChineseAllowingNames([title, criteria]);
  assertNoBanned([title, criteria]);
  return { title, criteria, resolveOn, category: (ARRIVAL_CATEGORIES as readonly string[]).includes(cat) ? (cat as AtlasCategoryKey) : "other" };
}

export async function planArrivalQuestion(gap: { headline: string; background: string; japan: string }, today: string): Promise<ArrivalDraft> {
  const contents = `今天是 ${today}。\n\n那边：${gap.headline}\n${gap.background}\n\n日本这边现在：${gap.japan}`;
  return executeAiJson(
    { operation: "forecast_arrival_plan", module: "unknown", outputMode: "json", timeoutMs: 20_000 },
    (attempt) => ({
      model: MODEL,
      contents: contents + (attempt === 1 ? "\n\n上一次输出没通过校验：截止日要在范围里、取月底；category 只能是那八个英文词之一；不许写概率。" : ""),
      config: { systemInstruction: ARRIVAL_PROMPT, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 700 },
    }),
    (value) => parseArrivalDraft(value, today)
  );
}

// ── 从新闻出生意题 ─────────────────────────────────────────────────────────

export type BusinessQuestionDraft = { signalId: string; headline: string; title: string; criteria: string; resolveOn: string; category: string };

export const BUSINESS_RULES = { minDays: 30, maxDays: 365, maxPerDay: 2 };

const BUSINESS_PROMPT = `下面是今天报告里的几条新闻（带编号）。他在日本、想创业，关心中国、美国的东西会不会、什么时候到日本，日本的规制、市场会怎么变。
从里面挑最多 ${BUSINESS_RULES.maxPerDay} 条，各出一道可以对账的预测题：
- 题目必须是对世界上一件具体事情的「会不会」：谁、做什么、截止到哪天（具体到月）。到期时上网一查就能判会还是不会。
  好题：「到 2027 年 3 月底，PayPay 会不会在日本推出面向外国游客的预付卡？」坏题：「日本的支付市场会不会继续增长？」（说不清怎么算）
- 两个方向都要有理由（已经定了的事、几乎不可能的事不出）。
- 截止日在今天之后 ${BUSINESS_RULES.minDays} 到 ${BUSINESS_RULES.maxDays} 天之间。
- 不许出关于他自己、他的想法的题。
每题写：
- id：照抄新闻编号；headline：照抄那条新闻的标题。
- title：一句「……会不会……？」。
- criteria：怎么才算「会」，一到两句，具体到能上网核对（以什么公告、什么报道为准）。
- resolve_on：截止日 YYYY-MM-DD。
- category：从这几个里挑一个：${FORECAST_CATEGORIES.join("、")}。
用简体中文。不要写概率、不要写你的看法。

只输出 JSON：{"questions":[{"id":"…","headline":"…","title":"…","criteria":"…","resolve_on":"YYYY-MM-DD","category":"…"}]}`;

export function parseBusinessQuestions(value: unknown, items: Map<string, string>, today: string): BusinessQuestionDraft[] {
  const v = (value ?? {}) as Record<string, unknown>;
  const out: BusinessQuestionDraft[] = [];
  const day = (d: string) => Date.parse(`${d}T00:00:00Z`);
  for (const r of Array.isArray(v.questions) ? v.questions : []) {
    if (!r || typeof r !== "object") continue;
    const q = r as Record<string, unknown>;
    const id = typeof q.id === "string" ? q.id.trim() : "";
    const headline = items.get(id);
    const echo = typeof q.headline === "string" ? q.headline : "";
    const title = typeof q.title === "string" ? q.title.trim() : "";
    const criteria = typeof q.criteria === "string" ? q.criteria.trim() : "";
    const resolveOn = typeof q.resolve_on === "string" ? q.resolve_on.trim() : "";
    if (!headline || !titleEchoMatches(echo, headline) || !title || !criteria || title.length > 120 || criteria.length > 400) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(resolveOn)) continue;
    const days = Math.round((day(resolveOn) - day(today)) / 86_400_000);
    if (!(days >= BUSINESS_RULES.minDays && days <= BUSINESS_RULES.maxDays)) continue;
    if (/\d{1,3}\s*%|百分之|你的|跟你/.test(`${title}${criteria}`)) continue;
    out.push({ signalId: id, headline, title, criteria, resolveOn, category: category(q.category) });
    if (out.length >= BUSINESS_RULES.maxPerDay) break;
  }
  const texts = out.flatMap((q) => [q.title, q.criteria]);
  if (texts.length > 0) {
    assertChineseAllowingNames(texts);
    assertNoBanned(texts);
  }
  return out;
}

export async function planBusinessQuestions(items: { id: string; headline: string; background: string }[], today: string): Promise<BusinessQuestionDraft[]> {
  if (items.length === 0) return [];
  const contents = `今天是 ${today}。\n\n${items.map((i) => `(${i.id}) ${i.headline}\n${i.background}`).join("\n\n")}`;
  const map = new Map(items.map((i) => [i.id, i.headline]));
  return executeAiJson(
    { operation: "forecast_business_plan", module: "unknown", outputMode: "json", timeoutMs: 30_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1 ? "\n\n上一次输出没通过校验：id 和 headline 要照抄；截止日要在范围里；题目和标准不许写概率、不许写「你」；用中文。" : ""),
      config: { systemInstruction: BUSINESS_PROMPT, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 1500 },
    }),
    (value) => parseBusinessQuestions(value, map, today)
  );
}

// ── 三种思路各押一个概率 ──────────────────────────────────────────────────

export type Perspective = "outside" | "inside" | "devil";

const PERSPECTIVE_RULES: Record<Perspective, string> = {
  outside: `先找基准率：这一类事情过去一般有多大比例会发生（同类的公司、同类的政策、同类的市场在类似期限里），再看这件事比一般情况更可能还是更不可能，从基准率出发往上或往下调。
reason 第一句必须写你用的是哪一类、那一类一般怎样（资料里有就引用，没有就写「凭一般经验」）。`,
  inside: `只看这件事本身：现在走到哪一步了、离截止还有多久、还差哪几步、谁能让它发生或卡住它。按资料里查到的现状推。
reason 写最关键的一两个现状和它们指向哪边。`,
  devil: `唱反调：先想大多数人会怎么判断，然后专门找让他们判断错的理由 —— 被忽略的阻碍、拖延的常见原因、或者反过来被低估的推力。找完再给你自己的概率（不必和大多数人相反，但要认真算进那些理由）。
reason 写你找到的最有分量的那条反方理由。`,
};

const forecastPrompt = (p: Perspective) => `你在给一道预测题估概率。给你：题目、怎么才算「会」、截止日、今天的日子、出题时的背景、上网搜到的资料（带编号）。

${PERSPECTIVE_RULES[p]}

要求：
- probability：这件事到截止日按标准算「会」的概率，0.01 到 0.99 之间的小数。不要只给 0.5 来回避；真的五五开才写 0.5。
- reason：两到三句，简体中文，只用资料里有的事实和一般常识，不许编数字；资料不够就直说资料不够。
- 你看不到别人的概率，也不要猜市场给的概率。

只输出 JSON：{"probability":0.xx,"reason":"…"}`;

export type PerspectiveForecast = { probability: number; reason: string };

export function parsePerspectiveForecast(value: unknown): PerspectiveForecast {
  const v = (value ?? {}) as Record<string, unknown>;
  const p = typeof v.probability === "number" ? v.probability : Number(v.probability);
  const reason = typeof v.reason === "string" ? v.reason.trim() : "";
  if (!Number.isFinite(p) || p <= 0 || p >= 1) throw new Error("probability 不在 0 到 1 之间");
  if (!reason || reason.length > 300) throw new Error("reason 没写或太长");
  assertChineseAllowingNames([reason]);
  assertNoBanned([reason]);
  return { probability: Math.min(0.99, Math.max(0.01, Math.round(p * 100) / 100)), reason };
}

export type ForecastInput = { title: string; criteria: string; resolveOn: string; today: string; context: string; sources: SearchSource[] };

export async function forecastFromPerspective(p: Perspective, input: ForecastInput): Promise<PerspectiveForecast> {
  const contents = [
    `题目：${input.title}`,
    `怎么才算「会」：${input.criteria}`,
    `截止日：${input.resolveOn}；今天：${input.today}`,
    `出题时的背景：${input.context || "（没有）"}`,
    input.sources.length > 0 ? `资料：\n${sourcesText(input.sources)}` : "资料：（这次没搜到）",
  ].join("\n\n");
  return executeAiJson(
    { operation: `forecast_${p}`, module: "unknown", outputMode: "json", timeoutMs: 30_000 },
    () => ({
      model: MODEL,
      contents,
      config: { systemInstruction: forecastPrompt(p), responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 512 }, maxOutputTokens: 1200 },
    }),
    parsePerspectiveForecast
  );
}

// ── 生意题到期：查证据、给建议（他点确认才算） ────────────────────────────────

export type ResolutionDraft = { suggested: "yes" | "no" | "unclear"; note: string; evidence: { url: string; title: string; excerpt: string }[] };

const RESOLVE_PROMPT = `一道预测题到期了。给你题目、怎么才算「会」、截止日、上网搜到的资料（带编号）。
按标准判：到截止日为止，这件事算「会」（yes）、「不会」（no），还是资料说不清（unclear）。
- yes 或 no 都必须有资料原文撑着：evidence 里逐字照抄原文（不翻译、不改字，15 到 200 字），附资料编号 source。拿不出原文就写 unclear。
- 截止日以后才发生的不算「会」。
- note：一句简体中文，说你凭哪条判的；unclear 就说缺什么。

只输出 JSON：{"verdict":"yes|no|unclear","note":"…","evidence":[{"source":1,"excerpt":"…"}]}`;

export function parseResolutionDraft(value: unknown, sources: SearchSource[]): ResolutionDraft {
  const v = (value ?? {}) as Record<string, unknown>;
  const raw = typeof v.verdict === "string" ? v.verdict.trim() : "";
  const note = typeof v.note === "string" ? v.note.trim().slice(0, 200) : "";
  const evidence = verifiedExcerpts(v.evidence, sources, 3);
  // 拿不出对得上的原文就不许说会或不会
  const suggested = (raw === "yes" || raw === "no") && evidence.length > 0 ? raw : "unclear";
  if (note) {
    assertChineseAllowingNames([note]);
    assertNoBanned([note]);
  }
  return { suggested, note: note || "资料说不清。", evidence };
}

export async function draftResolution(input: { title: string; criteria: string; resolveOn: string; sources: SearchSource[] }): Promise<ResolutionDraft> {
  const contents = [`题目：${input.title}`, `怎么才算「会」：${input.criteria}`, `截止日：${input.resolveOn}`, `资料：\n${sourcesText(input.sources)}`].join("\n\n");
  return executeAiJson(
    { operation: "forecast_resolve", module: "unknown", outputMode: "json", timeoutMs: 30_000 },
    () => ({
      model: MODEL,
      contents,
      config: { systemInstruction: RESOLVE_PROMPT, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 1000 },
    }),
    (value) => parseResolutionDraft(value, input.sources)
  );
}

// ── 按存档回答 ─────────────────────────────────────────────────────────────

export type ArchiveStatement = { text: string; refs: number[] };

const ARCHIVE_PROMPT = `他在问自己以前看过的新闻。下面是从他的存档里按意思找出来的几条（带编号、带抓到的日子）。
只用这几条回答他的问题：
- 写 2 到 6 句，每句后面标它用了哪几条（refs，编号）。存档里没有的不许说，不许用你自己知道的事补。
- 存档里的事有先后的，按时间讲（「9 月的时候……到 10 月……」）。
- 存档回答不了，就只写一句「存档里没找到能回答这个的」，refs 给空数组。
- 不许自己推因果、不许下结论、不许写「值得关注」。用简体中文。

只输出 JSON：{"statements":[{"text":"…","refs":[1,3]}]}`;

export function parseArchiveAnswer(value: unknown, count: number): ArchiveStatement[] {
  const v = (value ?? {}) as Record<string, unknown>;
  const out: ArchiveStatement[] = [];
  for (const r of Array.isArray(v.statements) ? v.statements : []) {
    if (!r || typeof r !== "object") continue;
    const s = r as Record<string, unknown>;
    const text = typeof s.text === "string" ? s.text.trim() : "";
    const refs = Array.from(new Set((Array.isArray(s.refs) ? s.refs : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= count)));
    // 没有出处的话不收（「存档里没找到」那一句除外）
    if (!text || (refs.length === 0 && !/没找到|没有找到/.test(text))) continue;
    if (/这说明|这意味着|值得关注|标志着/.test(text)) continue;
    out.push({ text, refs });
    if (out.length >= 6) break;
  }
  const texts = out.map((s) => s.text);
  if (texts.length > 0) {
    assertChineseAllowingNames(texts);
    assertNoBanned(texts);
  }
  return out;
}

export async function answerFromArchive(question: string, items: { title: string; snippet: string; date: string }[]): Promise<ArchiveStatement[]> {
  const contents = `问题：${question}\n\n存档：\n${items.map((it, i) => `[${i + 1}]（${it.date}）${it.title}\n${it.snippet}`).join("\n\n")}`;
  return executeAiJson(
    { operation: "archive_answer", module: "unknown", outputMode: "json", timeoutMs: 30_000 },
    () => ({
      model: MODEL,
      contents,
      config: { systemInstruction: ARCHIVE_PROMPT, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 1200 },
    }),
    (value) => parseArchiveAnswer(value, items.length)
  );
}
