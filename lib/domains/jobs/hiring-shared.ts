import { numbersIn, quoteIn } from "./provenance-shared";

/**
 * 「这家为什么现在招」的类型和核对规则（不碰数据库，页面也能用）。
 *
 * 招聘页是人事照着现场的需求写的；公司在做什么（中期计划、新闻稿、新事业、同时在招的别的岗位）
 * 能帮着猜"现场到底缺什么"。但这只是推测：中介能直接从人事那里问到招聘背景，比查资料准。
 * 所以每条推测都要引一件查到的事，原话由代码核对；页面上标明是推测，并给一句面试时验证用的问题。
 */

/** S0 是招聘页本身（「募集背景」常常就写在上面），S1… 是上网查到的网页。 */
export type HiringSource = { key: string; title: string; url: string | null };

/** 查到的一件事：原话逐字核对过。 */
export type HiringFact = { key: string; source: string; quote: string; point: string };

/** 推测的一条深层需求。facts 是依据（F1…），posting_quote 是招聘页上对得上的原话（可空）。 */
export type HiringNeed = {
  need: string;
  facts: string[];
  posting_quote: string;
  /** 书类里怎么体现：只说哪类经历放前面、强调什么，不新增经历。 */
  show: string;
  /** 面试或面谈时验证用的一句（日文）。 */
  ask: string;
};

export type HiringContext = {
  posting_id: string;
  queries: string[];
  sources: HiringSource[];
  facts: HiringFact[];
  needs: HiringNeed[];
  picked: number | null;
  updated_at: string;
};

export const MAX_HIRING_FACTS = 8;
export const MAX_HIRING_NEEDS = 3;

const PRAISE = /很有潜力|不错的|很棒|很优秀|非常适合|完全没问题|相信你/;
/** 替对方诊断问题的说法：书类里写这种话显得自以为是，猜错了更伤。 */
const DIAGNOSIS = /御社の課題|貴社の課題|御社の問題|貴社の問題|課題を抱えて/;
const KANA = /[぀-ヿ]/;
/** 他没听谁说过：问题里写"伺いました""と聞きました"就是在替他编传闻，面试时说出来会出事。只许"拝見しました"。 */
const HEARSAY = /伺いました|伺っております|伺っています|と聞きました|と聞いております|とお聞きしました/;
const MAX_ASK = 120;

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** 职种词：带这些的那一截才像"这是什么工作"。 */
const ROLE_WORD = /コンサルタント|アナリスト|サイエンティスト|企画|マーケ|エンジニア|営業|担当|マネージャー|リーダー|スタッフ|ディレクター|プランナー|PM|職/;

/**
 * 职位名里最像"这是什么工作"的那一截。【】里常常才是职位名（「【経営戦略コンサルタント】大企業の顧客が中心」），
 * 也常常是宣传（「【リモート可】」）：先找带职种词的，都没有就取【】外的第一截。
 */
export function roleKeyword(title: string): string {
  const inBrackets = Array.from(title.matchAll(/【([^】]*)】|\[([^\]]*)\]|［([^］]*)］/g)).map((m) => (m[1] ?? m[2] ?? m[3] ?? "").trim());
  const outside = title
    .replace(/【[^】]*】|\[[^\]]*\]|［[^］]*］/g, " ")
    .split(/[／/（(｜|・\s]/)
    .map((x) => x.trim());
  const parts = [...inBrackets, ...outside].filter((x) => x.length >= 2);
  return (parts.find((x) => ROLE_WORD.test(x)) ?? outside.find((x) => x.length >= 2) ?? "").slice(0, 20);
}

/**
 * 搜索词由代码拼（不让 AI 写）：中期计划、今年的新闻稿、新事业或组织调整，再加"这家在扩招哪类人"。
 * 最后一个最常被漏掉、却最直接 —— 富士通那次，"咨询人员扩到 1 万人"只有带职位名才搜得到。
 */
export function hiringQueries(company: string, year: number, title = ""): string[] {
  const name = company
    .replace(/株式会社|（株）|\(株\)|有限会社|合同会社/g, "")
    .trim();
  const role = roleKeyword(title);
  return [
    `${name} 中期経営計画`,
    `${name} プレスリリース ${year}`,
    `${name} 新規事業 組織 新設 ${year}`,
    ...(role ? [`${name} ${role} 採用 強化`] : []),
  ];
}

/** 正文里夹的编号（"（F1, F3）""(S6)"）删掉：编号单独存在 facts 里，正文里的常常对不上。 */
export function stripRefs(text: string): string {
  return text
    .replace(/[（(]\s*(?:[FS]\d+\s*[,，、]?\s*)+[）)]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** 推测和书类建议要用中文写给他看：平假名占一成以上就当是日文（片假名专名不算）。 */
export function looksJapanese(text: string): boolean {
  const letters = text.replace(/[\s\p{P}\p{S}0-9A-Za-z\u30a0-\u30ff]/gu, "");
  if (!letters) return false;
  return (text.match(/[\u3040-\u309f]/g) ?? []).length / letters.length > 0.1;
}

/**
 * 核对 AI 的输出。sourceText：S0、S1… → 那一篇的正文（含标题）；postingBody：招聘页正文。
 * 原话对不上的事丢掉；推测至少引一件留下来的事，数字只许出现在依据原话或招聘页里；
 * 招聘页原话对不上就清空；验证用的问题必须是日文。一条推测都没留下就报错（让上游重写一次）。
 */
export function parseHiring(value: unknown, sourceText: Map<string, string>, postingBody: string): { facts: HiringFact[]; needs: HiringNeed[] } {
  const v = (value ?? {}) as Record<string, unknown>;
  const facts: HiringFact[] = [];
  for (const raw of Array.isArray(v.facts) ? v.facts : []) {
    const x = (raw ?? {}) as Record<string, unknown>;
    const source = str(x.source, 8);
    const quote = str(x.quote, 200);
    const point = str(x.point, 120);
    const text = sourceText.get(source);
    if (!text || !point || !quoteIn(quote, text)) continue;
    if (facts.some((f) => f.quote === quote)) continue;
    facts.push({ key: `F${facts.length + 1}`, source, quote, point });
    if (facts.length >= MAX_HIRING_FACTS) break;
  }
  // AI 写的编号是它自己数的，按原来的顺序换成留下来的编号
  const aiKeys = (Array.isArray(v.facts) ? v.facts : []).map((raw, i) => {
    const x = (raw ?? {}) as Record<string, unknown>;
    return { ai: str(x.key, 8) || `F${i + 1}`, quote: str(x.quote, 200) };
  });
  const remap = new Map<string, string>();
  for (const k of aiKeys) {
    const kept = facts.find((f) => f.quote === k.quote);
    if (kept) remap.set(k.ai, kept.key);
  }

  const needs: HiringNeed[] = [];
  for (const raw of Array.isArray(v.needs) ? v.needs : []) {
    const x = (raw ?? {}) as Record<string, unknown>;
    const need = stripRefs(str(x.need, 160));
    const show = stripRefs(str(x.show, 200));
    const ask = stripRefs(str(x.ask, 300)).replace(/[SF]\d+(の|に|で)?(コラム|記事|資料)?/g, "").trim();
    const refs = Array.from(
      new Set((Array.isArray(x.facts) ? x.facts : []).map((k) => remap.get(str(k, 8))).filter((k): k is string => !!k))
    );
    if (!need || !show || refs.length === 0) continue;
    if (PRAISE.test(need + show) || looksJapanese(need) || looksJapanese(show)) continue;
    const support = [...refs.map((k) => facts.find((f) => f.key === k)?.quote ?? ""), postingBody].join("\n");
    const allowed = new Set(numbersIn(support));
    if (numbersIn(need + show).some((n) => !allowed.has(n))) continue;
    // 每条推测都要落到这个岗位上：招聘页里对不上一句原话的，只是在讲这家公司，不是在讲这个岗位
    const postingQuote = str(x.posting_quote, 200);
    if (!postingQuote || !quoteIn(postingQuote, postingBody)) continue;
    needs.push({
      need,
      facts: refs,
      posting_quote: postingQuote,
      show,
      ask: KANA.test(ask) && !DIAGNOSIS.test(ask) && !HEARSAY.test(ask) && ask.length <= MAX_ASK ? ask : "",
    });
    if (needs.length >= MAX_HIRING_NEEDS) break;
  }
  if (needs.length === 0) throw new Error("一条有依据的推测都没留下");
  return { facts, needs };
}

/** 改简历时交给 AI 的那一段：他认同的推测 + 依据原话。没选就是 null。 */
export function hiringFocus(ctx: HiringContext | null): { need: string; quotes: string[] } | null {
  if (!ctx || ctx.picked === null) return null;
  const need = ctx.needs[ctx.picked];
  if (!need) return null;
  return {
    need: need.need,
    quotes: [...need.facts.map((k) => ctx.facts.find((f) => f.key === k)?.quote ?? ""), need.posting_quote].filter(Boolean),
  };
}

/** 志望動機里替对方诊断问题的句子（"御社の課題は…"）不留。 */
export function isDiagnosis(sentence: string): boolean {
  return DIAGNOSIS.test(sentence);
}
