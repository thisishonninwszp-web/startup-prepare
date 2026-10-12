"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  MATERIAL_ROUTE_TARGETS,
  buildMaterialSnapshot,
  departmentLabel,
  type MaterialDepartment,
  type MaterialRouteTarget,
  type MaterialSourceType,
} from "./domain";
import { extractTextLikeMaterial } from "./extraction";
import { getRealityMaterial } from "./queries";
import {
  runMaterialAiPipeline,
  saveExtractedMaterial,
  saveTextMaterial,
  saveUrlMaterial,
  type CreateMaterialResult,
} from "./ingest";

export type { CreateMaterialResult };

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

export async function createTextMaterial(input: {
  text: string;
  sourceType?: MaterialSourceType;
}): Promise<CreateMaterialResult> {
  const userId = await requireUserId();
  return saveTextMaterial(userId, input.text, normalizeSourceType(input.sourceType ?? "text"));
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
  return saveUrlMaterial(userId, url);
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
  revalidatePath("/materials/review");
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
