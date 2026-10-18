import { executeAiImage } from "@/lib/ai-gateway";

// ---------------------------------------------------------------------------
// 外部信号的 AI 示意图（配图用，点了才出）。提示词由代码拼，固定规矩代码加。
// 模型不一定全听：试的时候说了不要任何文字，它还是画了一个「BUY」—— 图下面标明、他看过才用。
// ---------------------------------------------------------------------------

export const IMAGE_MODEL = process.env.AI_IMAGE_MODEL ?? "gemini-2.5-flash-image";

export const IMAGE_RULES =
  "扁平插画风格，暖色纸张底色，竖图。画面里不要出现任何文字、数字、字母、logo、产品界面或截图，不要画真人的脸，不要画国旗。";

/** 出图提示词：那边的这样东西 + 这一类东西的叫法 + 固定规矩。数字一律拿掉（标题里的「4000 亿」不能进图）。 */
export function illustrationPrompt(input: { there: string; headline: string; category?: string }): string {
  const strip = (t: string) => t.replace(/[0-9０-９][0-9０-９.,，%％]*/g, "").replace(/\s+/g, " ").trim();
  return [
    `一张示意插画，画${input.there}的这样东西：${strip(input.headline)}`,
    input.category ? `（这一类东西：${strip(input.category)}）` : "",
    `。${IMAGE_RULES}`,
  ].join("");
}

export async function drawIllustration(prompt: string): Promise<{ mimeType: string; data: Buffer }> {
  return executeAiImage(
    { operation: "signal_illustration", module: "unknown", timeoutMs: 60_000 },
    { model: IMAGE_MODEL, contents: prompt, config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:4" } } }
  );
}
