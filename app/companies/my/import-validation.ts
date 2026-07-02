import { createHmac } from "node:crypto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const MAX_CHUNK_BYTES = 2 * 1024 * 1024;

export type CreateImportChunkInput = {
  sheet_name: string;
  cell_range: string;
  ordinal: number;
  content_hash: string;
  row_count: number;
  column_count: number;
  compressed_size: number;
};

export type CreateImportInput = {
  profile_id: string;
  file_name: string;
  file_size: number;
  workbook_hash: string;
  visible_sheet_count: number;
  chunks: CreateImportChunkInput[];
};

function requiredText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label}不能为空`);
  }
  const normalized = value.trim();
  if (normalized.length > max) throw new Error(`${label}过长`);
  return normalized;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error(`${label}无效`);
  }
  return Number(value);
}

export function normalizeCreateImportInput(
  value: CreateImportInput
): CreateImportInput {
  if (!UUID_PATTERN.test(value.profile_id)) throw new Error("内部公司档案无效");
  const fileName = requiredText(value.file_name, "文件名", 255);
  if (!fileName.toLowerCase().endsWith(".xlsx")) {
    throw new Error("只支持 .xlsx 文件");
  }
  const fileSize = positiveInteger(value.file_size, "文件大小");
  if (fileSize > 10 * 1024 * 1024) throw new Error("文件不能超过 10 MB");
  if (!HASH_PATTERN.test(value.workbook_hash)) throw new Error("工作簿哈希无效");
  const visibleSheetCount = positiveInteger(
    value.visible_sheet_count,
    "可见工作表数量"
  );
  if (!Array.isArray(value.chunks) || value.chunks.length < 1) {
    throw new Error("至少需要一个脱敏分块");
  }
  if (value.chunks.length > 500) throw new Error("分块数量过多");

  const chunks = value.chunks.map((chunk, index) => {
    if (chunk.ordinal !== index) throw new Error("分块顺序无效");
    const compressedSize = positiveInteger(
      chunk.compressed_size,
      "压缩分块大小"
    );
    if (compressedSize > MAX_CHUNK_BYTES) {
      throw new Error("单个压缩分块不能超过 2 MB");
    }
    if (!HASH_PATTERN.test(chunk.content_hash)) {
      throw new Error("分块哈希无效");
    }
    return {
      sheet_name: requiredText(chunk.sheet_name, "工作表名称", 128),
      cell_range: requiredText(chunk.cell_range, "单元格范围", 64),
      ordinal: chunk.ordinal,
      content_hash: chunk.content_hash,
      row_count: positiveInteger(chunk.row_count, "分块行数"),
      column_count: positiveInteger(chunk.column_count, "分块列数"),
      compressed_size: compressedSize,
    };
  });

  return {
    profile_id: value.profile_id,
    file_name: fileName,
    file_size: fileSize,
    workbook_hash: value.workbook_hash,
    visible_sheet_count: visibleSheetCount,
    chunks,
  };
}

export function businessPlanStoragePath(
  userId: string,
  importId: string,
  ordinal: number
): string {
  if (!UUID_PATTERN.test(userId) || !UUID_PATTERN.test(importId)) {
    throw new Error("Storage 路径归属无效");
  }
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new Error("Storage 分块顺序无效");
  }
  return `${userId}/${importId}/${ordinal}.json.gz`;
}

export function supplierNameHmac(name: string, base64Key: string): string {
  const normalized = requiredText(name, "供应商名称", 200);
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new Error("BUSINESS_PLAN_HMAC_KEY 必须是32字节base64密钥");
  }
  return createHmac("sha256", key).update(normalized, "utf8").digest("hex");
}

export function supplierAlias(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0) throw new Error("别名序号无效");
  let value = index + 1;
  let letters = "";
  while (value > 0) {
    value -= 1;
    letters = String.fromCharCode(65 + (value % 26)) + letters;
    value = Math.floor(value / 26);
  }
  return `供应商${letters}`;
}
