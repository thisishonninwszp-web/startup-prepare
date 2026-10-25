/** 阅读层的来源边界和前后摘录对照。只比较文本，不把措辞差异认定为现实变化。 */
export type ReadingEvidence = {
  background: string;
  grounded?: boolean;
  basis?: string[];
  url?: string | null;
};

export type SourceEvidence = {
  status: "verified_excerpt" | "unread_body" | "no_excerpt";
  excerpts: string[];
  url: string | null;
  notice: string;
};

function sourceUrl(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export function sourceEvidence(item: ReadingEvidence): SourceEvidence {
  const excerpts = item.grounded === true
    ? Array.from(new Set((item.basis ?? []).filter((s): s is string => typeof s === "string").map((s) => s.trim()).filter(Boolean)))
    : [];
  const status = excerpts.length > 0 ? "verified_excerpt" : item.grounded === false ? "unread_body" : "no_excerpt";
  const notice = status === "verified_excerpt"
    ? "这些摘录已与抓到的正文逐字核验；它们是来源的说法，尚不代表事件已经独立证实。"
    : status === "unread_body"
      ? "未读到正文。下面的 AI 背景仅依据标题或简介，数字、日期和解释仍需核验。"
      : "这份报告没有可展示的已核验原文摘录；下面的 AI 整理与推断需要回原文核验。";
  return { status, excerpts, url: sourceUrl(item.url), notice };
}

export type ReadingComparison = {
  status: "insufficient" | "same" | "different_excerpts";
  differentExcerpts: string[];
  previousBackground: string | null;
  notice: string;
};

const normalizeExcerpt = (text: string) => text.normalize("NFKC").replace(/[\p{P}\p{S}\s]/gu, "");

export function compareReadingEvidence(current: ReadingEvidence, previous?: ReadingEvidence): ReadingComparison {
  const previousBackground = previous?.background?.trim() || null;
  const now = sourceEvidence(current);
  const before = previous ? sourceEvidence(previous) : null;
  if (!before || now.excerpts.length === 0 || before.excerpts.length === 0) {
    return {
      status: "insufficient",
      differentExcerpts: [],
      previousBackground,
      notice: "前后报道缺少可比较的已核验依据，尚不能判断新增了什么；背景文字只供对照。",
    };
  }
  const past = before.excerpts.map(normalizeExcerpt);
  const differentExcerpts = now.excerpts.filter((excerpt) => {
    const text = normalizeExcerpt(excerpt);
    return text.length > 0 && !past.some((old) => old && (old.includes(text) || text.includes(old)));
  });
  return {
    status: differentExcerpts.length > 0 ? "different_excerpts" : "same",
    differentExcerpts,
    previousBackground,
    notice: differentExcerpts.length > 0
      ? "这里只找到了原文摘录的措辞差异，尚未核验是否表达了新事实，也不能据此认定事情刚发生变化。"
      : "本次摘录没有显示明确的文字增量；这不代表事件没有新变化，仍需核对完整报道。",
  };
}
