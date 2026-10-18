import { numbersIn } from "@/lib/domains/jobs/provenance-shared";
import { isCommentSentence } from "./filler";

/**
 * 一图看懂：每条精选四个框 —— 起因 → 发生了什么 → 谁受影响 → 接下来盯什么。
 * 字由 AI 在读正文重写那一步写，代码核对：四个框都要有、每框够短、数字都在正文里、不许下结论或"值得关注"。
 * 有一样不合格整张不画（返回 null），不拦报告。纯函数：报告页、邮件、Edge 画图路由都能引。
 */
export const FLOW_STEPS = { cause: "起因", event: "发生了什么", affected: "谁受影响", watch: "接下来盯什么" } as const;
export type FlowStep = keyof typeof FLOW_STEPS;
export type ItemFlow = Record<FlowStep, string>;

/** 提示词要每框 18 个字以内；核对放宽到 24 个字，免得多两个字就整张丢掉。 */
export const FLOW_PROMPT_CHARS = 18;
export const FLOW_MAX_CHARS = 24;

const VAGUE = /值得关注|值得注意|持续观察|持续关注|有待观察|拭目以待|密切关注|进一步观察/;

export function checkFlow(raw: unknown, body: string): ItemFlow | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const allowed = new Set(numbersIn(body));
  const out = {} as ItemFlow;
  for (const step of Object.keys(FLOW_STEPS) as FlowStep[]) {
    const text = typeof v[step] === "string" ? (v[step] as string).trim().replace(/[。！？]+$/, "") : "";
    if (!text || Array.from(text).length > FLOW_MAX_CHARS) return null;
    if (isCommentSentence(text) || VAGUE.test(text)) return null;
    if (numbersIn(text).some((n) => !allowed.has(n))) return null;
    out[step] = text;
  }
  return out;
}
