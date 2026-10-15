import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { draftRealityMaterial, reviewRealityMaterial } from "@/lib/ai";
import {
  parseMaterialDraft,
  parseMaterialReview,
  type MaterialDepartment,
  type MaterialSourceType,
} from "./domain";
import { redactRealityMaterialText, summarizeExtractedText } from "./extraction";
import { fetchPublicPage } from "./fetch-page";
import { getRealityMaterial } from "./queries";

/**
 * 材料进库的管道：存原文和脱敏版 → AI 起草、审阅。
 * 不是 server action（没有 "use server"）：这里的函数都要显式传 userId，
 * 给 actions.ts（从登录态拿 userId）和手机分享的接口（用口令认人）共用。
 * 千万别把它们放进 "use server" 文件 —— 那样浏览器就能拿任意 userId 调用。
 */

export type CreateMaterialResult = {
  id: string;
  aiError: string | null;
};

function titleFromText(text: string, fallback: string): string {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return (firstLine ?? fallback).slice(0, 60);
}

export async function saveExtractedMaterial(input: {
  userId: string;
  sourceType: MaterialSourceType;
  title: string | null;
  inputText: string | null;
  sourceUrl: string | null;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  extractedText: string;
  extractionMeta: Record<string, unknown>;
  visibleSheets: string[];
  unreadable: string[];
  isTruncated: boolean;
}): Promise<CreateMaterialResult> {
  const redacted = redactRealityMaterialText(input.extractedText);
  const { data, error } = await supabaseAdmin
    .from("reality_materials")
    .insert({
      user_id: input.userId,
      source_type: input.sourceType,
      title: input.title,
      input_text: input.inputText,
      sanitized_text: redacted.text,
      source_url: input.sourceUrl,
      file_name: input.fileName,
      file_type: input.fileType,
      file_size: input.fileSize,
      status: "extracted",
      redactions: redacted.redactions,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const materialId = data.id as string;
  const { error: extractionError } = await supabaseAdmin
    .from("reality_material_extractions")
    .insert({
      user_id: input.userId,
      material_id: materialId,
      extracted_text: redacted.text,
      extraction_meta: input.extractionMeta,
      visible_sheets: input.visibleSheets,
      unreadable: input.unreadable,
      is_truncated: input.isTruncated || input.unreadable.length > 0,
    });
  if (extractionError) throw new Error(extractionError.message);

  let aiError: string | null = null;
  try {
    await runMaterialAiPipeline(input.userId, materialId);
  } catch (error) {
    aiError = error instanceof Error ? error.message : "AI 审阅失败";
    await supabaseAdmin
      .from("reality_materials")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", materialId)
      .eq("user_id", input.userId);
    console.error("material AI pipeline failed", error);
  }

  revalidatePath("/materials");
  revalidatePath(`/materials/${materialId}`);
  return { id: materialId, aiError };
}

/** 一段文字存成材料。 */
export async function saveTextMaterial(
  userId: string,
  rawText: string,
  sourceType: MaterialSourceType = "text"
): Promise<CreateMaterialResult> {
  const text = rawText.trim();
  if (!text) throw new Error("材料不能为空");
  const summarized = summarizeExtractedText(text);
  return saveExtractedMaterial({
    userId,
    sourceType,
    title: titleFromText(text, "现实材料"),
    inputText: text,
    sourceUrl: null,
    fileName: null,
    fileType: null,
    fileSize: null,
    extractedText: summarized.text,
    extractionMeta: { format: "text" },
    visibleSheets: [],
    unreadable: summarized.is_truncated ? ["内容已截断"] : [],
    isTruncated: summarized.is_truncated,
  });
}

/**
 * 一个网址存成材料：去读网页正文（只读公网地址，见 fetch-page.ts）。
 * 读到了就把标题和正文存进去，AI 才有东西可审；读不到（要登录、被拦、不是网页）就只存地址，并说明为什么。
 * note：分享时顺手写的一句话（"为什么存这个"），放在正文最前面。
 */
/** 分享来的文字里常常就是一个网址（有时前面带着标题）：挑出第一个网址。 */
export function pickUrl(text: string): string | null {
  return text.match(/https?:\/\/[^\s<>"'「」]+/)?.[0] ?? null;
}

export async function saveUrlMaterial(
  userId: string,
  url: string,
  note = ""
): Promise<CreateMaterialResult & { read: boolean; title: string }> {
  const raw = url.trim();
  if (!raw) throw new Error("URL 不能为空");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("URL 格式无效");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("只支持 http / https URL");
  }

  const page = await fetchPublicPage(parsed.toString());
  const noteLine = note.trim() ? `我为什么存这个：${note.trim()}\n\n` : "";
  if (page.ok) {
    const summarized = summarizeExtractedText(`${noteLine}${page.title ? `${page.title}\n\n` : ""}${page.body}`);
    const title = (page.title || parsed.hostname).slice(0, 60);
    const saved = await saveExtractedMaterial({
      userId,
      sourceType: "url",
      title,
      inputText: note.trim() || null,
      sourceUrl: page.finalUrl,
      fileName: null,
      fileType: null,
      fileSize: null,
      extractedText: summarized.text,
      extractionMeta: { format: "url", url: page.finalUrl },
      visibleSheets: [],
      unreadable: summarized.is_truncated ? ["正文太长，只存了前面一部分"] : [],
      isTruncated: summarized.is_truncated,
    });
    return { ...saved, read: true, title };
  }

  const saved = await saveExtractedMaterial({
    userId,
    sourceType: "url",
    title: parsed.hostname,
    inputText: note.trim() || null,
    sourceUrl: parsed.toString(),
    fileName: null,
    fileType: null,
    fileSize: null,
    extractedText: `${noteLine}URL：${parsed.toString()}`,
    extractionMeta: { format: "url", url: parsed.toString() },
    visibleSheets: [],
    unreadable: [`没读到正文：${page.reason}。需要的话把正文贴进来。`],
    isTruncated: false,
  });
  return { ...saved, read: false, title: parsed.hostname };
}

export async function runMaterialAiPipeline(
  userId: string,
  materialId: string
): Promise<void> {
  const material = await getRealityMaterial(userId, materialId);
  if (!material) throw new Error("材料不存在或无权访问");
  const text = material.sanitized_text.trim();
  if (!text) throw new Error("没有可供 AI 审阅的脱敏文本");

  const draft = await draftRealityMaterial({
    source_type: material.source_type,
    title: material.title,
    sanitized_text: text,
    extraction_meta: material.extraction?.extraction_meta ?? null,
  });
  const parsedDraft = parseMaterialDraft(draft);
  const { error: draftError } = await supabaseAdmin
    .from("reality_material_drafts")
    .insert({ user_id: userId, material_id: materialId, draft: parsedDraft });
  if (draftError) throw new Error(draftError.message);

  await replaceDepartments(
    userId,
    materialId,
    parsedDraft.suggested_departments
  );

  const review = await reviewRealityMaterial({
    source_type: material.source_type,
    title: material.title,
    sanitized_text: text,
    draft: parsedDraft,
    extraction_meta: material.extraction?.extraction_meta ?? null,
  });
  const parsedReview = parseMaterialReview(review);
  const { error: reviewError } = await supabaseAdmin
    .from("reality_material_reviews")
    .insert({ user_id: userId, material_id: materialId, review: parsedReview });
  if (reviewError) throw new Error(reviewError.message);

  const { error: statusError } = await supabaseAdmin
    .from("reality_materials")
    .update({ status: "reviewed", updated_at: new Date().toISOString() })
    .eq("id", materialId)
    .eq("user_id", userId);
  if (statusError) throw new Error(statusError.message);
}

async function replaceDepartments(
  userId: string,
  materialId: string,
  departments: MaterialDepartment[]
) {
  await supabaseAdmin
    .from("reality_material_departments")
    .delete()
    .eq("user_id", userId)
    .eq("material_id", materialId);
  if (departments.length === 0) return;
  const { error } = await supabaseAdmin
    .from("reality_material_departments")
    .insert(
      departments.map((department) => ({
        user_id: userId,
        material_id: materialId,
        department,
      }))
    );
  if (error) throw new Error(error.message);
}

/**
 * 书签小工具送来的那一页（浏览器里已经有的正文，要登录的、脚本画出来的页面也行）。
 * 和读网址一样存成 url 类材料，正文用送来的这份，不再让服务器去读。
 */
export async function saveClippedMaterial(
  userId: string,
  input: { url: string; title: string; text: string; note: string }
): Promise<CreateMaterialResult & { title: string }> {
  let parsed: URL;
  try {
    parsed = new URL(input.url.trim());
  } catch {
    throw new Error("URL 格式无效");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("只支持 http / https URL");
  const text = input.text.trim();
  if (text.length < 20) throw new Error("没收到正文");
  const note = input.note.trim().slice(0, 500);
  const title = (input.title.trim() || parsed.hostname).slice(0, 60);
  const noteLine = note ? `我为什么存这个：${note}\n\n` : "";
  const summarized = summarizeExtractedText(`${noteLine}${input.title.trim() ? `${input.title.trim()}\n\n` : ""}${text}`);
  const saved = await saveExtractedMaterial({
    userId,
    sourceType: "url",
    title,
    inputText: note || null,
    sourceUrl: parsed.toString(),
    fileName: null,
    fileType: null,
    fileSize: null,
    extractedText: summarized.text,
    extractionMeta: { format: "clip", url: parsed.toString() },
    visibleSheets: [],
    unreadable: summarized.is_truncated ? ["正文太长，只存了前面一部分"] : [],
    isTruncated: summarized.is_truncated,
  });
  return { ...saved, title };
}

