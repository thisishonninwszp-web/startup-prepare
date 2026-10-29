import { AI_MODEL, executeAiText } from "@/lib/ai-gateway";

/**
 * 所有 AI 调用的统一封装（宪法：AI 调用统一封装在 lib/ai.ts）。
 * 模型名读环境变量 AI_MODEL，便于切换。仅在服务端使用。
 */

export const MODEL = AI_MODEL;

export async function generateContent(request: {
  model?: string;
  contents: unknown;
  config?: Record<string, unknown>;
}): Promise<{ text: string }> {
  const outputMode =
    request.config?.responseMimeType === "application/json" ? "json" : "text";
  const text = await executeAiText(
    {
      operation: "legacy_ai_call",
      module: "unknown",
      outputMode,
      timeoutMs: outputMode === "json" ? 60_000 : 30_000,
    },
    { ...request, model: request.model ?? MODEL }
  );
  return { text };
}

/** 两句话里最长的一段相同的字（去掉空白和标点）。用来认「只是把题目换了个说法」「跟最近出过的题差不多」。 */
export function longestSharedRun(a: string, b: string): number {
  const clean = (t: string) => t.replace(/[\s\p{P}]/gu, "");
  const x = clean(a);
  const y = clean(b);
  let best = 0;
  for (let i = 0; i < x.length; i++) {
    for (let j = 0; j < y.length; j++) {
      let k = 0;
      while (i + k < x.length && j + k < y.length && x[i + k] === y[j + k]) k++;
      if (k > best) best = k;
    }
  }
  return best;
}
