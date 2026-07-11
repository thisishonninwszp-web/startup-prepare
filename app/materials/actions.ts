"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  draftRealityMaterial,
  reviewRealityMaterial,
} from "@/lib/ai";
import {
  MATERIAL_ROUTE_TARGETS,
  buildMaterialSnapshot,
  departmentLabel,
  parseMaterialDraft,
  parseMaterialReview,
  type MaterialDepartment,
  type MaterialRouteTarget,
  type MaterialSourceType,
} from "./domain";
import {
  extractTextLikeMaterial,
  redactRealityMaterialText,
  summarizeExtractedText,
} from "./extraction";
import { getRealityMaterial } from "./queries";

export type CreateMaterialResult = {
  id: string;
  aiError: string | null;
};

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSourceType(value: string): MaterialSourceType {
  const allowed = new Set<MaterialSourceType>([
    "text",
    "url",
    "customer_quote",
    "business_fragment",
    "emotion_fragment",
  ]);
  return allowed.has(value as MaterialSourceType)
    ? (value as MaterialSourceType)
    : "text";
}

function titleFromText(text: string, fallback: string): string {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return (firstLine ?? fallback).slice(0, 60);
}

async function saveExtractedMaterial(input: {
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

export async function createTextMaterial(input: {
  text: string;
  sourceType?: MaterialSourceType;
}): Promise<CreateMaterialResult> {
  const userId = await requireUserId();
  const text = input.text.trim();
  if (!text) throw new Error("材料不能为空");
  const summarized = summarizeExtractedText(text);
  return saveExtractedMaterial({
    userId,
    sourceType: normalizeSourceType(input.sourceType ?? "text"),
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

export async function createRealityMaterial(formData: FormData): Promise<void> {
  const fileValue = formData.get("file");
  const file =
    fileValue instanceof File && fileValue.size > 0 ? fileValue : undefined;
  const text = formText(formData, "text");
  const sourceUrl = formText(formData, "source_url");
  const sourceType = normalizeSourceType(formText(formData, "source_type"));

  let result: CreateMaterialResult;
  if (file) {
    result = await createFileMaterial(formData);
  } else if (sourceUrl) {
    result = await createUrlMaterial(sourceUrl);
  } else if (text) {
    result = await createTextMaterial({ text, sourceType });
  } else {
    throw new Error("材料不能为空");
  }
  redirect(`/materials/${result.id}`);
}

export async function createUrlMaterial(url: string): Promise<CreateMaterialResult> {
  const userId = await requireUserId();
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

  const extracted = `URL：${parsed.toString()}`;
  const unreadable: string[] = [
    "第一版不会由服务器抓取 URL 正文，避免访问内网、localhost 或云元数据地址。请粘贴需要审阅的正文片段。",
  ];

  return saveExtractedMaterial({
    userId,
    sourceType: "url",
    title: parsed.hostname,
    inputText: null,
    sourceUrl: parsed.toString(),
    fileName: null,
    fileType: null,
    fileSize: null,
    extractedText: extracted,
    extractionMeta: { format: "url", url: parsed.toString() },
    visibleSheets: [],
    unreadable,
    isTruncated: false,
  });
}

export async function createFileMaterial(
  formData: FormData
): Promise<CreateMaterialResult> {
  const userId = await requireUserId();
  const fileValue = formData.get("file");
  const file =
    fileValue instanceof File && fileValue.size > 0 ? fileValue : undefined;
  if (!file) throw new Error("文件不能为空");
  const result = await extractTextLikeMaterial({
    fileName: file.name,
    contentType: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
  return saveExtractedMaterial({
    userId,
    sourceType: "file",
    title: file.name,
    inputText: null,
    sourceUrl: null,
    fileName: file.name,
    fileType: file.type || null,
    fileSize: file.size,
    extractedText: result.text,
    extractionMeta: result.meta,
    visibleSheets: result.visible_sheets,
    unreadable: result.unreadable,
    isTruncated: result.is_truncated,
  });
}

export async function retryRealityMaterialAi(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const materialId = formText(formData, "material_id");
  await runMaterialAiPipeline(userId, materialId);
  revalidatePath("/materials");
  revalidatePath(`/materials/${materialId}`);
}

export async function setRealityMaterialDecision(
  formData: FormData
): Promise<void> {
  const userId = await requireUserId();
  const materialId = formText(formData, "material_id");
  const decision = formText(formData, "decision");
  const allowed = new Set([
    "confirmed",
    "parked",
    "rejected",
    "summary_only",
    "deleted",
  ]);
  if (!allowed.has(decision)) throw new Error("朱批结果无效");
  if (decision === "deleted") {
    const { error } = await supabaseAdmin
      .from("reality_materials")
      .update({
        status: "deleted",
        input_text: null,
        sanitized_text: "",
        updated_at: new Date().toISOString(),
      })
      .eq("id", materialId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    revalidatePath("/materials");
    redirect("/materials");
  }
  const { error } = await supabaseAdmin
    .from("reality_materials")
    .update({ status: decision, updated_at: new Date().toISOString() })
    .eq("id", materialId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/materials");
  revalidatePath(`/materials/${materialId}`);
}

export async function createRealityMaterialRoute(
  formData: FormData
): Promise<void> {
  const userId = await requireUserId();
  const materialId = formText(formData, "material_id");
  const target = formText(formData, "target") as MaterialRouteTarget;
  const reason = formText(formData, "reason");
  const outputExpectation = formText(formData, "output_expectation");
  if (!MATERIAL_ROUTE_TARGETS.includes(target)) throw new Error("分流目标无效");
  if (!reason) throw new Error("需要记录分流理由");
  if (!outputExpectation) throw new Error("需要记录分流后期待产出");

  const material = await getRealityMaterial(userId, materialId);
  if (!material) throw new Error("材料不存在或无权访问");
  if (!["confirmed", "summary_only"].includes(material.status)) {
    throw new Error("材料需要先朱批确认，才能分流");
  }
  const departments =
    material.latest_draft?.suggested_departments.length
      ? material.latest_draft.suggested_departments
      : (["judgment"] as MaterialDepartment[]);
  const snapshot = buildMaterialSnapshot({
    materialId,
    title: material.title,
    sourceType: material.source_type,
    sanitizedText: material.sanitized_text,
    extraction: material.extraction
      ? {
          extracted_text: material.extraction.extracted_text,
          unreadable: material.extraction.unreadable,
          is_truncated: material.extraction.is_truncated,
        }
      : null,
    draft: material.latest_draft,
    review: material.latest_review,
  });
  const { error } = await supabaseAdmin.from("reality_material_routes").insert({
    user_id: userId,
    material_id: materialId,
    target,
    reason,
    output_expectation: outputExpectation,
    source_snapshot: {
      ...snapshot,
      departments,
      department_labels: departments.map(departmentLabel),
    },
  });
  if (error) throw new Error(error.message);
  revalidatePath("/materials");
  revalidatePath(`/materials/${materialId}`);
}

async function runMaterialAiPipeline(
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
