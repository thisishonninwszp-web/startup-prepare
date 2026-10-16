import { sectionText, type JobProfile, type JobResume, type PersonalInfo, type ResumeSectionKey, RESUME_SECTIONS } from "./shared";

/**
 * 官网填表助手的纯规则。值一律由代码从条件页的个人信息和最新一版简历算出来；
 * AI 只负责"表单上这一格对应哪一样"，看得到格子的名字，看不到值。
 * 同意规约、个人信息处理的勾选框不替他勾；最后「応募する」由他自己点。
 */

/** 填表助手能往表单里填的几样东西（键 → 给 AI 看的说明）。 */
export const FILL_KEYS = {
  name: "氏名（姓と名が同じ欄）",
  last_name: "姓",
  first_name: "名",
  kana: "ふりがな・フリガナ（姓と名が同じ欄）",
  last_kana: "セイ（姓のふりがな）",
  first_kana: "メイ（名のふりがな）",
  email: "メールアドレス（確認用の再入力欄も同じ）",
  phone: "電話番号",
  postal: "郵便番号",
  address: "住所",
  birth: "生年月日（一つの欄）",
  salary_now: "現在の年収",
  salary_want: "希望年収",
  available_from: "入社可能時期・入社可能日",
  visa: "在留資格・ビザ",
  summary: "職務要約",
  history: "職務経歴",
  skills: "活かせる経験・知識・スキル",
  pr: "自己PR",
  motivation: "志望動機・応募理由",
  resume_pdf: "職務経歴書・レジュメ・CV のファイル（アップロード欄）",
} as const;
export type FillKey = keyof typeof FILL_KEYS;
export type TextFillKey = Exclude<FillKey, "resume_pdf">;

export function isFillKey(value: unknown): value is FillKey {
  return typeof value === "string" && value in FILL_KEYS;
}

export type FormFieldKind = "text" | "textarea" | "select" | "radio" | "checkbox" | "file";
/** 填表助手从页面上读出来的一格。index 是助手在页面上做的记号。 */
export type FormField = {
  index: number;
  kind: FormFieldKind;
  type: string;
  label: string;
  required: boolean;
  maxLength: number | null;
  options: string[];
};

/** 拆姓名：中间正好一个空格（半角或全角）才拆，拆不准就不拆。 */
export function splitName(full: string): { last: string; first: string } | null {
  const parts = full.trim().split(/[\s　]+/).filter(Boolean);
  return parts.length === 2 ? { last: parts[0], first: parts[1] } : null;
}

/** 每一样东西的值（代码算，不经过 AI）。没有的是空字符串，那一格就留给他自己填。 */
export function fillValues(profile: JobProfile, resume: Pick<JobResume, "sections"> | null): Record<TextFillKey, string> {
  const p = profile.personal;
  const name = splitName(p.name);
  const kana = splitName(p.kana);
  const section = (key: ResumeSectionKey) => (resume ? sectionText(key, resume.sections[key]) : "");
  const expiry = p.visa_expiry.trim();
  return {
    name: p.name.trim(),
    last_name: name?.last ?? "",
    first_name: name?.first ?? "",
    kana: p.kana.trim(),
    last_kana: kana?.last ?? "",
    first_kana: kana?.first ?? "",
    email: p.email.trim(),
    phone: p.phone.trim(),
    postal: p.postal.trim(),
    address: p.address.trim(),
    birth: p.birth.trim(),
    salary_now: profile.salaryNow !== null ? `${profile.salaryNow}万円` : "",
    salary_want: p.salary_want.trim(),
    available_from: p.available_from.trim(),
    visa: profile.visa === "gijinkoku" ? `技術・人文知識・国際業務${expiry ? `（在留期限：${expiry}）` : ""}` : "",
    summary: section("summary"),
    history: section("history"),
    skills: section("skills"),
    pr: section("pr"),
    motivation: section("motivation"),
  };
}

/** 放不放得进有字数上限的格子（跟浏览器一样按 value.length 数）。 */
export function fitsMaxLength(text: string, maxLength: number | null): boolean {
  return maxLength === null || text.length <= maxLength;
}

/** 下拉框挑哪一项：一模一样的优先；否则挑出现在值里最长的那个（住所「大阪府…」挑「大阪府」不挑「大阪」）。 */
export function pickOption(options: string[], value: string): number | null {
  const v = value.normalize("NFKC").trim();
  if (!v) return null;
  const norm = options.map((o) => o.normalize("NFKC").trim());
  const exact = norm.findIndex((o) => o === v);
  if (exact >= 0) return exact;
  let best = -1;
  norm.forEach((o, i) => {
    if (o.length >= 2 && v.includes(o) && (best < 0 || o.length > norm[best].length)) best = i;
  });
  return best >= 0 ? best : null;
}

const CONSENT = /同意|規約|プライバシー|個人情報の?(取り?扱|取扱)|privacy|consent|agree|terms/i;

/** "同意个人信息处理 / 规约"这类勾选框：一律不替他勾。 */
export function isConsentField(field: Pick<FormField, "kind" | "label">): boolean {
  return (field.kind === "checkbox" || field.kind === "radio") && CONSENT.test(field.label);
}

const DONE_PATH = /(complete|completed|thanks|thank-you|thankyou|finish|finished|done|success)(\/|$|\?|\.)/i;
const DONE_TEXT =
  /応募(が|を)?完了|応募を受け付けました|ご応募(いただき)?、?ありがとうございま|エントリー(が)?完了|送信が完了しました|thank you for (applying|your application)|application (has been )?(submitted|received)/i;

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return "";
  }
}

/**
 * 提交成功了没有：跟填好时比，网址变成"完成页"的样子，或者页面上新出现"応募完了 / ご応募ありがとうございました"。
 * 表单上本来就写着的字不算（"送信完了後、担当者より…"）；确认页不算。
 */
export function looksSubmitted(s: { startUrl: string; startText: string; url: string; text: string }): boolean {
  if (DONE_TEXT.test(s.text) && !DONE_TEXT.test(s.startText)) return true;
  if (s.url !== s.startUrl && DONE_PATH.test(pathOf(s.url)) && !DONE_PATH.test(pathOf(s.startUrl))) return true;
  return false;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 職務経歴書 PDF 用的 HTML（填表助手在本机用无界面浏览器排成 A4）。姓名联系方式由代码填，不经过 AI。 */
export function resumeHtml(input: { personal: PersonalInfo; resume: Pick<JobResume, "sections">; date: string }): string {
  const [y, m, d] = input.date.split("-").map(Number);
  const p = input.personal;
  const block = (key: ResumeSectionKey) =>
    `<section><h2>■ ${RESUME_SECTIONS[key]}</h2><p>${escapeHtml(sectionText(key, input.resume.sections[key])).replace(/\n/g, "<br>")}</p></section>`;
  const contact = [p.email, p.phone].filter(Boolean).map(escapeHtml).join(" / ");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 16mm; }
body { font-family: "Yu Gothic", "Meiryo", "Hiragino Sans", sans-serif; font-size: 10.5pt; line-height: 1.75; }
h1 { text-align: center; font-size: 16pt; margin: 0 0 12pt; }
h2 { font-size: 11pt; border-bottom: 1px solid currentColor; padding-bottom: 2pt; margin: 16pt 0 6pt; }
.right { text-align: right; margin: 0; }
section { break-inside: avoid; }
</style></head><body>
<h1>職務経歴書</h1>
<p class="right">${y}年${m}月${d}日現在</p>
<p class="right">氏名　${escapeHtml(p.name)}${p.kana ? `（${escapeHtml(p.kana)}）` : ""}</p>
${contact ? `<p class="right">${contact}</p>` : ""}
${(["summary", "history", "skills", "pr"] as ResumeSectionKey[]).map(block).join("\n")}
<p class="right">以上</p>
<div style="page-break-before: always"></div>
${block("motivation")}
</body></html>`;
}
