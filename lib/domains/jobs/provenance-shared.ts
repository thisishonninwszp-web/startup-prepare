import type { CareerEntry, DroppedSentence, SourcedSentence } from "./shared";

/**
 * 出处核对：简历和底稿草稿里每一句写到的数字、英文词（工具名、公司名），都必须在它标的出处里找得到。
 * 找不到的句子删掉，写明删的理由 —— AI 只能重新组织他说过的话，不能替他编经历。
 */

function nfkc(s: string): string {
  return s.normalize("NFKC");
}

/** 句子里的数字："04" 和 "4" 算同一个，"1,200" 算 1200，全角数字也认。 */
export function numbersIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of nfkc(text).matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(n)) out.add(String(n));
  }
  return Array.from(out);
}

/** 英文写的词（GA4、Tableau、Python、Focus……），小写，至少两个字符。 */
export function latinTermsIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of nfkc(text).matchAll(/[A-Za-z][A-Za-z0-9+#.-]*/g)) {
    const term = m[0].replace(/[.-]+$/, "").toLowerCase();
    if (term.length >= 2) out.add(term);
  }
  return Array.from(out);
}

/** 一句话里的数字和英文词是不是都在出处里。返回第一个对不上的理由；都对得上返回 null。 */
export function unsupported(text: string, source: string): string | null {
  const src = nfkc(source).toLowerCase();
  const srcNumbers = new Set(numbersIn(source));
  for (const n of numbersIn(text)) if (!srcNumbers.has(n)) return `数字「${n}」在底稿里找不到`;
  for (const t of latinTermsIn(text)) if (!src.includes(t)) return `「${t}」在底稿里找不到`;
  return null;
}

/** 一条底稿拿来核对的全部文字：在哪、期间、原话、日文稿。 */
export function entrySourceText(entry: Pick<CareerEntry, "org" | "period" | "raw_text" | "draft_ja">): string {
  return [entry.org, entry.period, entry.raw_text, entry.draft_ja ?? ""].join("\n");
}

/**
 * 简历的每一句：至少标一个出处、出处是确认过的底稿、数字和英文词都对得上。
 * entries：确认过的底稿，编号 → 这条的全部文字。
 * extra：额外允许用的词（志望動機可以提到招聘页上的词）；只用来核对词，不能代替出处。
 */
export function checkSentences(
  raw: unknown,
  entries: Map<string, string>,
  extra = ""
): { kept: SourcedSentence[]; dropped: DroppedSentence[] } {
  const kept: SourcedSentence[] = [];
  const dropped: DroppedSentence[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const text = typeof v.text === "string" ? v.text.trim() : "";
    if (!text) continue;
    const ids = (Array.isArray(v.entry_ids) ? v.entry_ids : []).filter((id): id is string => typeof id === "string");
    if (ids.length === 0) {
      dropped.push({ text, reason: "没标出处" });
      continue;
    }
    const known = Array.from(new Set(ids.filter((id) => entries.has(id))));
    if (known.length === 0) {
      dropped.push({ text, reason: "标的出处不在确认过的底稿里" });
      continue;
    }
    const reason = unsupported(text, [...known.map((id) => entries.get(id) ?? ""), extra].join("\n"));
    if (reason) {
      dropped.push({ text, reason });
      continue;
    }
    kept.push({ text, entry_ids: known });
  }
  return { kept, dropped };
}

/** 底稿的日文稿：按句切开，数字和英文词在他的原话里找不到的句子删掉。 */
export function checkDraft(draft: string, source: string): { text: string; dropped: DroppedSentence[] } {
  const sentences = draft
    .split(/(?<=[。！？!?])|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const kept: string[] = [];
  const dropped: DroppedSentence[] = [];
  for (const sentence of sentences) {
    const reason = unsupported(sentence, source);
    if (reason) dropped.push({ text: sentence, reason: reason.replace("底稿", "你的原话") });
    else kept.push(sentence);
  }
  return { text: kept.join(""), dropped };
}

/** 招聘页原话是不是真在正文里（去掉空白、统一全半角后逐字比）。4 个字以下的不算。 */
export function quoteIn(quote: string, body: string): boolean {
  const squash = (s: string) => nfkc(s).replace(/\s+/g, "");
  const q = squash(quote);
  return q.length >= 4 && squash(body).includes(q);
}
