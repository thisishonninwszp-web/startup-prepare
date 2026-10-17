import { numbersIn } from "@/lib/domains/jobs/provenance-shared";
import { ATLAS_CATEGORIES, type AtlasCategory } from "./atlas-shared";
import { isCommentSentence } from "./filler";
import type { GapSide } from "./gaps-shared";
import { ISSUE_NOTE_MAX, validStance, type PickStance } from "./issue-shared";

/**
 * 差距的「一条讲透」：一条差距攒在一页上的几样新东西，和它们的核对规则（纯函数，不碰数据库）。
 * 那边查一查：事实必须有原文、原文必须在网页上、数字和公司名必须在那句原文里 —— AI 只能摘，不能编。
 */

export const THERE_MAX_FACTS = 6;

/** 那边查一查只摘这四格。页面按格摆，空着的格直说没查到。 */
export const THERE_KINDS = { who: "谁在做", scale: "做到多大", money: "怎么收钱", since: "哪年开始" } as const;
export type ThereKind = keyof typeof THERE_KINDS;

export type ThereLanguage = "中文" | "英文" | "日文";

/**
 * 「做到多大」「怎么收钱」只搜这几家商业媒体（2026-10-17 试过代码读得到：中文、英文的是全文，日文的只有七八十字摘要）。
 * 不限网站搜，出来的多是产品分析和"能不能赚钱"的博客，没有规模数字。晚点、虎嗅、亿邦、QuestMobile、财新那次一篇没出来，没放进来。
 */
export const THERE_MEDIA: Record<ThereLanguage, string[]> = {
  中文: ["36kr.com", "jiemian.com", "tmtpost.com", "21jingji.com", "thepaper.cn", "yicai.com"],
  英文: ["techcrunch.com", "businessinsider.com", "geekwire.com"],
  日文: ["nikkei.com", "itmedia.co.jp", "asahi.com"],
};

const SCALE_WORDS: Record<ThereLanguage, string> = { 中文: "月活 用户规模 GMV", 英文: "users revenue", 日文: "利用者数 売上" };
const MONEY_WORDS: Record<ThereLanguage, string> = { 中文: "商业模式 营收 融资", 英文: "business model funding", 日文: "収益 資金調達" };

export type ThereSearch = { query: string; domains: string[] };

/** 这样东西的两个叫法：产品名（新闻里点了名才有）和这一类东西的叫法；再加属于谁。 */
export type ThereNames = { product: string; category: string; parent: string };

/**
 * 都只搜商业媒体的：产品的规模和收钱（没有产品名就用这一类的叫法）、这一类东西的规模、母公司的规模；最后是 AI 写的那个词（不限网站，兜底）。
 * 两个叫法一起搜是试出来的：只给一个叫法时，AI 有时写产品（点淘），有时写一类（短剧直播电商），有时写成一家公司，搜出来的料跟着大起大落。
 * 母公司那一次也是试出来的：商业媒体讲的常是「淘宝直播 GMV」，不是「点淘」这个名字。叫法重复的不重复搜。
 */
export function thereSearches(language: ThereLanguage, names: ThereNames, freeQuery: string): ThereSearch[] {
  const product = names.product.trim();
  const category = names.category.trim();
  const parent = names.parent.trim();
  const main = product || category;
  const media = THERE_MEDIA[language];
  const out: ThereSearch[] = [
    { query: `${main} ${SCALE_WORDS[language]}`, domains: media },
    { query: `${main} ${MONEY_WORDS[language]}`, domains: media },
  ];
  const used = new Set([main]);
  for (const extra of [category, parent]) {
    if (!extra || used.has(extra)) continue;
    used.add(extra);
    out.push({ query: `${extra} ${SCALE_WORDS[language]}`, domains: media });
  }
  if (freeQuery.trim()) out.push({ query: freeQuery.trim(), domains: [] });
  return out;
}

export type ThereFact = {
  /** 一句中文：谁、什么、多少、什么时候。 */
  text: string;
  /** 四格里的哪一格（早期查的没有）。 */
  kind?: ThereKind;
  /** 这条讲的是哪家公司（照原文写法）；不是讲某一家的没有。 */
  company?: string;
  /** 原文（代码核对过逐字在那一页上）。 */
  excerpt: string;
  url: string;
  title: string;
};

export type GapThere = {
  facts: ThereFact[];
  /** 用了哪几个搜索词（一条没摘到时，页面上请他自己去搜）。 */
  queries: string[];
  /** AI 写的两个叫法和属于谁（早期查的没有；10-17 那几次只有一个 name）。 */
  product?: string;
  category?: string;
  name?: string;
  parent?: string;
  /** 读了几篇（一条都没摘到时，分得清是没搜到还是搜到了对不上）。 */
  searched: { pages: number };
  checked_at: string;
};

/** 他在这一页点的判断：周刊那三下 + 补的那句。 */
export type DeepStance = { stance: PickStance; note: string };

export type GapDeep = {
  there: GapThere | null;
  category: AtlasCategory | null;
  stance: DeepStance | null;
  updated_at: string;
};

/** 「那边」用什么语言搜：中国那边中文、美国那边英文、日本那边（反方向）日文。 */
export function thereLanguage(side: GapSide): ThereLanguage {
  return side === "china" ? "日文" : side === "us" ? "英文" : "中文";
}

function squash(t: string): string {
  return t.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

/**
 * AI 摘的事实，只收对得上原文的：资料编号对得上、原文逐字在那一页上、事实里的数字都在那句原文里、
 * 点名的公司在那句原文里、不是「这说明……」式的结论。同一句原文只收一次，最多 6 条。
 */
export function checkThereFacts(raw: unknown, sources: { title: string; url: string; content: string }[]): ThereFact[] {
  const out: ThereFact[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    if (out.length >= THERE_MAX_FACTS) break;
    if (!r || typeof r !== "object") continue;
    const v = r as Record<string, unknown>;
    const src = sources[(typeof v.source === "number" ? v.source : Number(v.source)) - 1];
    const text = typeof v.fact === "string" ? v.fact.trim() : "";
    const excerpt = typeof v.excerpt === "string" ? v.excerpt.trim() : "";
    const company = typeof v.company === "string" ? v.company.trim() : "";
    if (!src || !text || squash(excerpt).length < 8 || !squash(src.content).includes(squash(excerpt))) continue;
    if (isCommentSentence(text)) continue;
    const allowed = new Set(numbersIn(excerpt));
    if (numbersIn(text).some((n) => !allowed.has(n))) continue;
    if (company && !squash(excerpt).includes(squash(company))) continue;
    if (out.some((f) => squash(f.excerpt) === squash(excerpt))) continue;
    const kind = typeof v.kind === "string" && Object.hasOwn(THERE_KINDS, v.kind) ? (v.kind as ThereKind) : undefined;
    out.push({ text, ...(kind ? { kind } : {}), ...(company ? { company } : {}), excerpt: excerpt.slice(0, 300), url: src.url, title: src.title });
  }
  return out;
}

/** 名单里中国那边的名字，原样出现在这条文字里的那几个（不让 AI 猜是哪家）。两个字以下的名字不认。 */
export function mentionedNames(texts: string[], names: string[]): string[] {
  const all = texts.join("\n");
  return names.filter((n) => n.trim().length >= 2 && all.includes(n.trim()));
}

export function validCategory(raw: unknown): AtlasCategory | null {
  return typeof raw === "string" && Object.hasOwn(ATLAS_CATEGORIES, raw) ? (raw as AtlasCategory) : null;
}

/** 浏览器传来的判断：选项只认合法的，第一问必点；补的那句去掉首尾空白、最多 200 字。不合格返回 null。 */
export function validDeepStance(raw: unknown, note: unknown): DeepStance | null {
  const stance = validStance(raw);
  const text = typeof note === "string" ? note.trim() : "";
  if (!stance || text.length > ISSUE_NOTE_MAX) return null;
  return { stance, note: text };
}

export type DeepStep = "there" | "transfer" | "voices";

/** 「把缺的都查一遍」要跑哪几步，按这个顺序。 */
export function missingSteps(has: Record<DeepStep, boolean>): DeepStep[] {
  return (["there", "transfer", "voices"] as const).filter((s) => !has[s]);
}
