/**
 * 面试演示「御社の商売、中国ではどうなっている？」的类型和纯规则（不碰数据库、不调 AI，可测）。
 * 界面给面试官看，是日文；AI 写的日文字段由这里查：要有平假名、不许有吹捧和"有机会"的词（宪法原则 1、2）。
 */

/** 一句带出处的原文：逐字在那篇网页的正文里（代码核对过）。 */
export type SourcedQuote = { url: string; title: string; excerpt: string };

export type ChinaPlan = {
  /** 这门生意在中国的说法（中文一句）。 */
  zh_business: string;
  /** 2–3 个中文搜索词。 */
  queries: string[];
};

export type ChinaCompany = {
  name: string;
  /** 它做什么（日文一句，AI 写的；数字和英文词在那篇资料里）。 */
  what_ja: string;
  /** 原文（中文，逐字在资料里）。 */
  excerpt: string;
  /** 原文的日文翻译（AI 写的；数字和英文词在原文里）。 */
  excerpt_ja: string;
  url: string;
  title: string;
  /** 另一个模型（Jev）判它是不是在做同一门生意：true = 判了"是"；null = 裁判没调通。判"不是"的不留。 */
  same: boolean | null;
};

export type ChinaCompanies = {
  companies: ChinaCompany[];
  /** 一共读到几篇资料。 */
  read: number;
};

export type Holds = "yes" | "no" | "unclear";

export const HOLDS_LABELS: Record<Holds, string> = { yes: "ある", no: "ない", unclear: "資料なし" };

export type JapanCondition = {
  name: string;
  /** 中国那边的情况：AI 写的、没有出处，所以不许有数字。 */
  there_ja: string;
  here_ja: string;
  /** 拿不出逐字对得上的日本资料原文时一律 unclear。 */
  holds: Holds;
  basis: SourcedQuote[];
};

/** 有原文但 AI 判"说不清"的，和根本没查到原文的，说法分开（后者才是"資料なし"）。 */
export function holdsLabel(c: Pick<JapanCondition, "holds" | "basis">): string {
  if (c.holds === "unclear" && c.basis.length > 0) return "はっきりしない";
  return HOLDS_LABELS[c.holds];
}

export type JapanEntrant = { text_ja: string; basis: SourcedQuote[] };

export type ChinaJapan = { conditions: JapanCondition[]; entrants: JapanEntrant[] };

export const CHINA_RUN_STATUSES = ["planned", "companies", "done", "none_found", "failed"] as const;
export type ChinaRunStatus = (typeof CHINA_RUN_STATUSES)[number];

export type ChinaRun = {
  id: string;
  business: string;
  status: ChinaRunStatus;
  plan: ChinaPlan | null;
  companies: ChinaCompanies | null;
  japan: ChinaJapan | null;
  error: string | null;
  created_at: string;
};

export type ChinaRunSummary = Pick<ChinaRun, "id" | "business" | "status" | "created_at">;

export type ChinaStep = "plan" | "companies" | "japan";

/** 页面上说"停在哪一步"用的（日文，给面试官看）。 */
export const STEP_LABELS: Record<ChinaStep, string> = { plan: "検索語", companies: "中国の会社", japan: "日本の状況" };

/** /jobs 上列记录用的（中文，只有他自己看）。 */
export const RUN_STATUS_LABELS: Record<ChinaRunStatus, string> = {
  planned: "还没跑完",
  companies: "还没跑完",
  done: "跑完了",
  none_found: "没找到",
  failed: "停在半路",
};

/** 下一步该跑哪一步。跑完了（done）、没找到（none_found）返回 null；失败的按哪几列是空的接着跑。 */
export function nextChinaStep(run: Pick<ChinaRun, "status" | "plan" | "companies" | "japan">): ChinaStep | null {
  if (run.status === "done" || run.status === "none_found") return null;
  if (!run.plan) return "plan";
  if (!run.companies) return "companies";
  if (run.companies.companies.length === 0) return null;
  if (!run.japan) return "japan";
  return null;
}

const HIRAGANA = /[぀-ゟ]/;
const KANA = /[぀-ヿ]/;

/** AI 写的日文字段：每一段都要有平假名（模型会跟着中文资料写成中文）。 */
export function assertJapanese(texts: string[]): void {
  const bad = texts.find((t) => t.trim() && !HIRAGANA.test(t));
  if (bad) throw new Error(`没用日文：${bad.slice(0, 20)}`);
}

/** 不许吹捧、不许下"有机会"的结论。 */
export const JA_HYPE = [
  "有望",
  "チャンス",
  "ポテンシャル",
  "期待でき",
  "注目すべき",
  "注目の",
  "参考になる",
  "素晴らしい",
  "すばらしい",
  "大きな可能性",
  "間違いな",
];

export function assertNoHype(texts: string[]): void {
  const all = texts.join("\n");
  const hit = JA_HYPE.find((w) => all.includes(w));
  if (hit) throw new Error(`出现了不该出现的话：${hit}`);
}

/** 他输入的那一句：去掉多余空白，最多 100 字；太短的搜不出东西。报错是日文（显示在演示页上）。 */
export function cleanBusiness(input: string): string {
  const text = input.replace(/\s+/g, " ").trim().slice(0, 100);
  if (text.length < 4) throw new Error("もう少し具体的に書いてください（誰に・何を売っているか）。");
  return text;
}

/** 原文是日文还是中文：有假名就是日文。用来给原文标 lang，汉字才会用对的字形显示。 */
export function quoteLang(text: string): "ja" | "zh-CN" {
  return KANA.test(text) ? "ja" : "zh-CN";
}
