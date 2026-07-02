"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  businessPlanStoragePath,
  normalizeCreateImportInput,
  supplierAlias,
  supplierNameHmac,
  type CreateImportInput,
} from "./import-validation";

const SUPPLIER_BUCKET = "internal-business-plans";
const MAX_SUPPLIER_NAMES = 200;

type ImportUpload = {
  chunkId: string;
  path: string;
  token: string;
};

export type CreateBusinessPlanImportResult = {
  importId: string;
  versionNo: number;
  existing: boolean;
  uploads: ImportUpload[];
};

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

function requireUuid(value: string, label: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  ) {
    throw new Error(`${label}无效`);
  }
  return value;
}

export async function ensureOwnCompanyProfile(
  displayName: string
): Promise<string> {
  const userId = await requireUserId();
  const name = displayName.trim();
  if (!name || name.length > 100) throw new Error("公司名称应为 1–100 个字符");

  const { data: existing, error: readError } = await supabaseAdmin
    .from("own_company_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw new Error("读取内部公司档案失败");

  if (existing) {
    const { error } = await supabaseAdmin
      .from("own_company_profiles")
      .update({ display_name: name, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("user_id", userId);
    if (error) throw new Error("更新内部公司档案失败");
    revalidatePath("/companies/my");
    return existing.id as string;
  }

  const { data, error } = await supabaseAdmin
    .from("own_company_profiles")
    .insert({ user_id: userId, display_name: name })
    .select("id")
    .single();
  if (error || !data) throw new Error("创建内部公司档案失败");
  revalidatePath("/companies");
  revalidatePath("/companies/my");
  return data.id as string;
}

export async function resolveSupplierAliases(
  names: string[]
): Promise<Record<string, string>> {
  const userId = await requireUserId();
  const uniqueNames = Array.from(
    new Set(
      names.map((name) => name.trim()).filter((name) => name.length > 0)
    )
  );
  if (uniqueNames.length > MAX_SUPPLIER_NAMES) {
    throw new Error(`一次最多确认 ${MAX_SUPPLIER_NAMES} 个供应商名称`);
  }
  if (uniqueNames.some((name) => name.length > 200)) {
    throw new Error("供应商名称不能超过 200 个字符");
  }
  if (uniqueNames.length === 0) return {};

  const secret = process.env.BUSINESS_PLAN_HMAC_KEY ?? "";
  const hashes = uniqueNames.map((name) => supplierNameHmac(name, secret));
  const { data: rows, error: readError } = await supabaseAdmin
    .from("business_plan_supplier_aliases")
    .select("name_hmac, alias")
    .eq("user_id", userId)
    .in("name_hmac", hashes);
  if (readError) throw new Error("读取供应商别名失败");

  const aliasByHash = new Map(
    (rows ?? []).map((row) => [row.name_hmac as string, row.alias as string])
  );
  const { data: allAliases, error: aliasError } = await supabaseAdmin
    .from("business_plan_supplier_aliases")
    .select("alias")
    .eq("user_id", userId);
  if (aliasError) throw new Error("读取供应商别名序号失败");

  const used = new Set(
    (allAliases ?? []).map((row) => row.alias as string)
  );
  const inserts: Array<{ user_id: string; name_hmac: string; alias: string }> =
    [];
  let aliasIndex = 0;

  for (const hash of hashes) {
    if (aliasByHash.has(hash)) continue;
    let alias = supplierAlias(aliasIndex++);
    while (used.has(alias)) alias = supplierAlias(aliasIndex++);
    used.add(alias);
    aliasByHash.set(hash, alias);
    inserts.push({ user_id: userId, name_hmac: hash, alias });
  }

  if (inserts.length > 0) {
    const { error } = await supabaseAdmin
      .from("business_plan_supplier_aliases")
      .upsert(inserts, { onConflict: "user_id,name_hmac" });
    if (error) throw new Error("保存供应商别名失败");

    // Another request may have won the race with a different free alias.
    const { data: canonical, error: canonicalError } = await supabaseAdmin
      .from("business_plan_supplier_aliases")
      .select("name_hmac, alias")
      .eq("user_id", userId)
      .in("name_hmac", hashes);
    if (canonicalError) throw new Error("确认供应商别名失败");
    for (const row of canonical ?? []) {
      aliasByHash.set(row.name_hmac as string, row.alias as string);
    }
  }

  return Object.fromEntries(
    uniqueNames.map((name, index) => [name, aliasByHash.get(hashes[index])!])
  );
}

export async function createBusinessPlanImport(
  rawInput: CreateImportInput
): Promise<CreateBusinessPlanImportResult> {
  const userId = await requireUserId();
  const input = normalizeCreateImportInput(rawInput);

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("own_company_profiles")
    .select("id")
    .eq("id", input.profile_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) throw new Error("读取内部公司档案失败");
  if (!profile) throw new Error("无权使用该内部公司档案");

  const { data: duplicate, error: duplicateError } = await supabaseAdmin
    .from("business_plan_imports")
    .select("id, version_no, status")
    .eq("user_id", userId)
    .eq("workbook_hash", input.workbook_hash)
    .maybeSingle();
  if (duplicateError) throw new Error("检查重复经营计划失败");
  if (duplicate) {
    const uploads: ImportUpload[] = [];
    if (duplicate.status === "uploading") {
      const { data: chunks, error: chunksError } = await supabaseAdmin
        .from("business_plan_chunks")
        .select("id, storage_path, ordinal")
        .eq("import_id", duplicate.id)
        .eq("user_id", userId)
        .order("ordinal");
      if (chunksError) throw new Error("读取待续传分块失败");
      for (const chunk of chunks ?? []) {
        const { data, error } = await supabaseAdmin.storage
          .from(SUPPLIER_BUCKET)
          .createSignedUploadUrl(chunk.storage_path as string, {
            upsert: true,
          });
        if (error || !data) throw new Error("创建续传凭证失败");
        uploads.push({
          chunkId: chunk.id as string,
          path: chunk.storage_path as string,
          token: data.token,
        });
      }
    }
    return {
      importId: duplicate.id as string,
      versionNo: duplicate.version_no as number,
      existing: true,
      uploads,
    };
  }

  const { data: previous, error: previousError } = await supabaseAdmin
    .from("business_plan_imports")
    .select("id, version_no")
    .eq("profile_id", input.profile_id)
    .eq("user_id", userId)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousError) throw new Error("读取经营计划版本失败");

  const versionNo = ((previous?.version_no as number | undefined) ?? 0) + 1;
  const { data: created, error: createError } = await supabaseAdmin
    .from("business_plan_imports")
    .insert({
      user_id: userId,
      profile_id: input.profile_id,
      version_no: versionNo,
      status: "uploading",
      file_name: input.file_name,
      file_size: input.file_size,
      workbook_hash: input.workbook_hash,
      visible_sheet_count: input.visible_sheet_count,
      chunk_count: input.chunks.length,
      previous_import_id: previous?.id ?? null,
    })
    .select("id")
    .single();
  if (createError || !created) throw new Error("创建经营计划导入失败");

  const importId = created.id as string;
  try {
    const chunkRows = input.chunks.map((chunk) => ({
      user_id: userId,
      import_id: importId,
      sheet_name: chunk.sheet_name,
      cell_range: chunk.cell_range,
      ordinal: chunk.ordinal,
      storage_path: businessPlanStoragePath(userId, importId, chunk.ordinal),
      content_hash: chunk.content_hash,
      compressed_size: chunk.compressed_size,
      row_count: chunk.row_count,
      column_count: chunk.column_count,
    }));
    const { data: savedChunks, error: chunkError } = await supabaseAdmin
      .from("business_plan_chunks")
      .insert(chunkRows)
      .select("id, storage_path, ordinal");
    if (chunkError || !savedChunks) throw new Error("保存脱敏分块清单失败");

    const uploads: ImportUpload[] = [];
    for (const chunk of savedChunks.sort(
      (a, b) => (a.ordinal as number) - (b.ordinal as number)
    )) {
      const { data, error } = await supabaseAdmin.storage
        .from(SUPPLIER_BUCKET)
        .createSignedUploadUrl(chunk.storage_path as string, { upsert: true });
      if (error || !data) throw new Error("创建私有上传凭证失败");
      uploads.push({
        chunkId: chunk.id as string,
        path: chunk.storage_path as string,
        token: data.token,
      });
    }
    revalidatePath("/companies/my");
    return { importId, versionNo, existing: false, uploads };
  } catch (error) {
    const { error: cleanupError } = await supabaseAdmin
      .from("business_plan_imports")
      .delete()
      .eq("id", importId)
      .eq("user_id", userId);
    if (cleanupError) throw new Error("导入初始化失败，且清理未完成");
    throw error;
  }
}

export async function markBusinessPlanUploadComplete(
  importIdValue: string,
  uploadedChunkIds: string[]
): Promise<void> {
  const userId = await requireUserId();
  const importId = requireUuid(importIdValue, "导入记录");
  const ids = Array.from(
    new Set(uploadedChunkIds.map((id) => requireUuid(id, "分块记录")))
  );

  const { data: planImport, error: importError } = await supabaseAdmin
    .from("business_plan_imports")
    .select("id, status, chunk_count")
    .eq("id", importId)
    .eq("user_id", userId)
    .maybeSingle();
  if (importError) throw new Error("读取导入记录失败");
  if (!planImport || planImport.status !== "uploading") {
    throw new Error("导入记录不存在或状态已变化");
  }

  const { data: chunks, error: chunksError } = await supabaseAdmin
    .from("business_plan_chunks")
    .select("id, storage_path, compressed_size")
    .eq("import_id", importId)
    .eq("user_id", userId);
  if (chunksError) throw new Error("读取分块清单失败");
  if (
    ids.length !== planImport.chunk_count ||
    chunks?.length !== planImport.chunk_count ||
    chunks.some((chunk) => !ids.includes(chunk.id as string))
  ) {
    throw new Error("上传完成清单不完整");
  }

  for (const chunk of chunks) {
    const { data, error } = await supabaseAdmin.storage
      .from(SUPPLIER_BUCKET)
      .info(chunk.storage_path as string);
    if (error || !data) throw new Error("私有分块尚未全部上传");
    if (
      typeof data.size === "number" &&
      data.size !== (chunk.compressed_size as number)
    ) {
      throw new Error("私有分块大小与确认清单不一致");
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from("business_plan_imports")
    .update({ status: "extracting", error_code: null })
    .eq("id", importId)
    .eq("user_id", userId)
    .eq("status", "uploading");
  if (updateError) throw new Error("更新导入状态失败");
  revalidatePath("/companies/my");
}

export async function deleteBusinessPlanImport(
  importIdValue: string
): Promise<void> {
  const userId = await requireUserId();
  const importId = requireUuid(importIdValue, "导入记录");
  const { data: chunks, error: chunkError } = await supabaseAdmin
    .from("business_plan_chunks")
    .select("storage_path")
    .eq("import_id", importId)
    .eq("user_id", userId);
  if (chunkError) throw new Error("读取待删除分块失败");

  const paths = (chunks ?? []).map((chunk) => chunk.storage_path as string);
  if (paths.length > 0) {
    const { error } = await supabaseAdmin.storage
      .from(SUPPLIER_BUCKET)
      .remove(paths);
    if (error) throw new Error("删除私有分块失败");
  }

  const { error } = await supabaseAdmin
    .from("business_plan_imports")
    .delete()
    .eq("id", importId)
    .eq("user_id", userId);
  if (error) throw new Error("删除经营计划导入失败");
  revalidatePath("/companies/my");
}
