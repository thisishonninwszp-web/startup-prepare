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

export type ThereFact = {
  /** 一句中文：谁、什么、多少、什么时候。 */
  text: string;
  /** 这条讲的是哪家公司（照原文写法）；不是讲某一家的没有。 */
  company?: string;
  /** 原文（代码核对过逐字在那一页上）。 */
  excerpt: string;
  url: string;
  title: string;
};

export type GapThere = {
  facts: ThereFact[];
  /** 用了哪两个搜索词（一条没摘到时，页面上请他自己去搜）。 */
  queries: string[];
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
export function thereLanguage(side: GapSide): "中文" | "英文" | "日文" {
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
    out.push({ text, ...(company ? { company } : {}), excerpt: excerpt.slice(0, 300), url: src.url, title: src.title });
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
