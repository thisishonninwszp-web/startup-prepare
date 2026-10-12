import type { HistoricalAnalog, KeyFactor, StepEvidence } from "@/lib/ai/signals";
import type { StoredHistory } from "./analysis";
import { QUESTION_BET_PREFIX } from "./practice-shared";
import type { BriefItem } from "./brief";

/**
 * 问题驱动里浏览器端也要用的部分：类型和纯函数，不碰数据库。
 *
 * 流程：他提一个问题（加上"怎么才算"）→ AI 拆成几个小问题分头上网查（GPT Researcher 的做法）
 * → 列出决定答案的关键因素（Metaculus forecasting-tools 的做法）→ 附上历史参照当基准
 * → 他更新自己的看法（旧的保留）→ 可以押进判断账本 → 每周整理成一篇文章。
 */

export type SubQuestionResult = {
  question: string;
  /** 来源和原文摘录由代码核对过。立场是相对"他当时的看法"；当时没写看法就全是背景。 */
  evidence: StepEvidence[];
};

export type QuestionResearch = {
  subQuestions: SubQuestionResult[];
  keyFactors: KeyFactor[];
  /** 历史参照（核实过的）；这一步失败时为 null。 */
  history: StoredHistory | null;
  /** 这一轮是照着哪一版看法查的（证据的支持/反对都是相对它说的）。没写看法时为空。 */
  basedOnView: string;
  /** 他自己想到的类比（AI 展开并核实过）。重查一轮时原样带过去；不进基准率。 */
  userAnalogs?: HistoricalAnalog[];
};

/** 一个问题最多存几条自己想到的类比。 */
export const MAX_USER_ANALOGS = 5;

export type QuestionView = {
  id: string;
  view: string;
  reason: string;
  created_at: string;
};

export type SignalQuestion = {
  id: string;
  question: string;
  criterion: string;
  research: QuestionResearch | null;
  researched_at: string | null;
  created_at: string;
  /** 从新到旧。第一条是现在的看法。 */
  views: QuestionView[];
};

/** 关键因素里引用的证据编号是全局的：按小问题的顺序把证据排成一列，从 1 开始。 */
export function flattenEvidence(research: Pick<QuestionResearch, "subQuestions">): StepEvidence[] {
  return research.subQuestions.flatMap((s) => s.evidence);
}

/** 从问题页押进账本时，存进账本的"问题"。 */
export function questionBetQuestion(question: string): string {
  return `${QUESTION_BET_PREFIX}${question}`;
}

/**
 * 整理成一篇文章的骨架（Markdown）。只搬运他自己写的看法和查到的东西，不让 AI 替他写观点：
 * 写给别人看最能逼自己想清楚，但前提是观点是自己的。
 */
export function articleOutline(q: SignalQuestion): string {
  const current = q.views[0];
  const research = q.research;
  const evidence = research ? flattenEvidence(research) : [];
  const supports = evidence.filter((e) => e.stance === "supports");
  const contradicts = evidence.filter((e) => e.stance === "contradicts");
  const line = (e: StepEvidence) => `- ${e.fact}（[${e.title || "来源"}](${e.url})）`;

  const parts: string[] = [`# ${q.question}`, "", "## 我在追什么问题", "", q.question];
  if (q.criterion) parts.push("", `怎么才算：${q.criterion}`);

  parts.push("", "## 我现在怎么看", "");
  if (current) {
    parts.push(current.view);
    if (current.reason) parts.push("", `为什么：${current.reason}`);
  } else {
    parts.push("（还没写。先写一句自己的看法，哪怕很粗糙。）");
  }
  const earlier = q.views.slice(1);
  if (earlier.length > 0) {
    parts.push("", "之前我是这么看的：", ...earlier.map((v) => `- ${v.view}`));
  }

  parts.push("", "## 最有力的证据", "");
  if (supports.length > 0) parts.push("支持我的：", ...supports.map(line), "");
  if (contradicts.length > 0) parts.push("反对我的：", ...contradicts.map(line), "");
  if (supports.length === 0 && contradicts.length === 0) {
    parts.push(
      evidence.length > 0
        ? "（这一轮查的时候还没写看法，证据都没分支持和反对。写下看法后再查一轮。）"
        : "（还没查到。）",
      ""
    );
  }

  if (research && research.keyFactors.length > 0) {
    parts.push("## 决定答案的几个因素", "", ...research.keyFactors.map((f) => `- ${f.factor}：${f.now}`), "");
    parts.push("## 出现什么情况，我会改主意", "", ...research.keyFactors.map((f) => `- ${f.watch}`), "");
  }

  const analogs = [...(research?.userAnalogs ?? []), ...(research?.history?.analogs ?? [])];
  if (analogs.length > 0) {
    parts.push("## 历史上类似的事", "");
    for (const a of analogs) {
      parts.push(`- ${a.when}：${a.what} 后来：${a.after}`);
      if (a.alike) parts.push(`  - 像的地方：${a.alike}`);
      if (a.unlike) parts.push(`  - 不像的地方：${a.unlike}`);
    }
    parts.push("");
  }

  parts.push("---", "证据由 AI 上网查找，原文摘录已核对出处；看法是我自己的。");
  return parts.join("\n");
}

/** 每日报告里标过"跟这个问题有关"的一条。 */
export type RelatedReportItem = {
  brief_date: string;
  signal_id: string;
  headline: string;
  url: string | null;
  source: string;
  why: string;
};

/** 从最近的报告里挑出标过这个问题的那几条，从新到旧；同一条新闻只留最新的一次。 */
export function relatedReportItems(
  briefs: { brief_date: string; items: BriefItem[] }[],
  questionId: string
): RelatedReportItem[] {
  const out: RelatedReportItem[] = [];
  const sorted = [...briefs].sort((a, b) => b.brief_date.localeCompare(a.brief_date));
  for (const brief of sorted) {
    for (const item of brief.items) {
      if (item.related_question?.id !== questionId) continue;
      if (out.some((o) => o.signal_id === item.signal_id)) continue;
      out.push({
        brief_date: brief.brief_date,
        signal_id: item.signal_id,
        headline: item.headline,
        url: item.url,
        source: item.source,
        why: item.related_question.why,
      });
    }
  }
  return out;
}
