import { supabaseAdmin } from "@/lib/supabase";
import { drawIllustration, illustrationPrompt, IMAGE_MODEL } from "@/lib/ai";
import { loadGapDeep } from "./deep";
import { findJapanGap } from "./gaps";
import { gapPlaces, type GapSide } from "./gaps-shared";

/**
 * 差距的 AI 示意图：出图、存进 Storage（signal-images，不公开）、记一行（signal_images），页面拿签过名的临时链接显示。
 * 出不来时把提示词给他，自己贴进网页版 GPT（不替他操作网页版）。
 */

export const IMAGE_BUCKET = "signal-images";
export const MISSING_IMAGE_MIGRATION =
  "还差一步：迁移 085 没跑。在 Supabase 的 SQL Editor 里执行 supabase/migrations/085_signal_images.sql 之后再来。";
/** 临时链接管一个小时：够他看、够下载。 */
const SIGNED_SECONDS = 60 * 60;

export type GapImage = { url: string; created_at: string };

function isMissing(message: string): boolean {
  return /signal_images|bucket/i.test(message);
}

/** 这一条最新的一张（没有为 null）；表没建返回 "missing-schema"。 */
export async function latestGapImage(userId: string, side: GapSide, signalId: string): Promise<GapImage | null | "missing-schema"> {
  const { data, error } = await supabaseAdmin
    .from("signal_images")
    .select("storage_path, created_at")
    .eq("user_id", userId)
    .eq("side", side)
    .eq("signal_id", signalId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissing(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  if (!data) return null;
  const { data: signed, error: signError } = await supabaseAdmin.storage.from(IMAGE_BUCKET).createSignedUrl(data.storage_path as string, SIGNED_SECONDS);
  if (signError || !signed) return null;
  return { url: signed.signedUrl, created_at: data.created_at as string };
}

/** 出图提示词（出不来时页面给他复制）。 */
export async function gapImagePrompt(userId: string, side: GapSide, signalId: string): Promise<string> {
  const gap = await findJapanGap(userId, signalId, side);
  if (!gap) throw new Error("清单里找不到这一条了");
  const deep = await loadGapDeep(userId, side, signalId).catch(() => null);
  const category = deep && deep !== "missing-schema" ? deep.there?.category : undefined;
  return illustrationPrompt({ there: gapPlaces(side).there, headline: gap.headline, category });
}

/** 出一张、存进 Storage、记一行，返回签过名的临时链接。 */
export async function drawGapImage(userId: string, side: GapSide, signalId: string): Promise<GapImage> {
  const prompt = await gapImagePrompt(userId, side, signalId);
  const image = await drawIllustration(prompt);
  const ext = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType === "image/webp" ? "webp" : "png";
  const path = `${userId}/${side}/${signalId}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabaseAdmin.storage.from(IMAGE_BUCKET).upload(path, image.data, { contentType: image.mimeType });
  if (uploadError) throw new Error(isMissing(uploadError.message) ? MISSING_IMAGE_MIGRATION : uploadError.message);
  const { error } = await supabaseAdmin
    .from("signal_images")
    .insert({ user_id: userId, side, signal_id: signalId, storage_path: path, prompt, model: IMAGE_MODEL });
  if (error) throw new Error(isMissing(error.message) ? MISSING_IMAGE_MIGRATION : error.message);
  const latest = await latestGapImage(userId, side, signalId);
  if (!latest || latest === "missing-schema") throw new Error("存上了，但取不到链接，刷新一下");
  return latest;
}
