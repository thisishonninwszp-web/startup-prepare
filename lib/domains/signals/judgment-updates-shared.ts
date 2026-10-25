import type { InferenceEvidence } from "./inference-shared";

export type JudgmentUpdate = {
  id: string;
  judgment_id: string;
  judgment: string;
  reason: string;
  source_url: string | null;
  created_at: string;
};

export type JudgmentUpdateInput = { judgment: string; reason: string; sourceUrl?: string };

export function sourceUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 2000) throw new Error("来源链接太长或格式不对");
  const text = value.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    if (!/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password) throw new Error();
    return url.toString();
  } catch {
    throw new Error("来源链接请填写完整的 http 或 https 网页地址");
  }
}

export function parseJudgmentUpdate(input: unknown): { judgment: string; reason: string; source_url: string | null } {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const judgment = typeof value.judgment === "string" ? value.judgment.trim() : "";
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  if (judgment.length < 4 || judgment.length > 500) throw new Error("新判断请写 4 到 500 个字");
  if (reason.length < 4 || reason.length > 1000) throw new Error("修改原因请写 4 到 1000 个字，说明什么信息改变了判断");
  return { judgment, reason, source_url: sourceUrl(value.sourceUrl) };
}

/** Only source-backed findings from the evidence pipeline belong in the counter-evidence section. */
export function opposingEvidence(evidence: InferenceEvidence[]): InferenceEvidence[] {
  return evidence.filter((item) => {
    if (item.stance !== "contradicts" || !item.fact.trim() || !item.excerpt.trim()) return false;
    try {
      return sourceUrl(item.url) !== null;
    } catch {
      return false;
    }
  });
}
