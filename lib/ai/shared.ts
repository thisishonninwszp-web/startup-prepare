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

