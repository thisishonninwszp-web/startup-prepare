import { chunkSheetBySize, redactSheet } from "../excel-domain";
import type {
  NormalizedSheet,
  SensitiveCandidate,
  WorkbookChunk,
} from "../types";

const REDACTION_LABELS = {
  email: "[邮箱]",
  phone: "[电话]",
  bank_account: "[银行账户]",
  corporate_number: "[法人编号]",
  person: "[姓名]",
} as const;

export const CLIENT_CHUNK_TARGET_BYTES = 1_887_436;

export function normalizeManualSupplierNames(value: string): string[] {
  const names = Array.from(
    new Set(
      value
        .split(/\r?\n/)
        .map((name) => name.trim())
        .filter(Boolean)
    )
  );
  if (names.length > 200) throw new Error("手动供应商名称不能超过 200 个");
  if (names.some((name) => name.length > 200)) {
    throw new Error("单个供应商名称不能超过 200 个字符");
  }
  return names;
}

export function safeStoredWorkbookName(localName: string): string {
  void localName;
  return "经营计划.xlsx";
}

export function buildConfirmedRedactions(
  candidates: SensitiveCandidate[],
  supplierAliases: Record<string, string>
): Map<string, string> {
  const replacements = new Map<string, string>();
  for (const candidate of candidates) {
    if (candidate.type === "supplier") {
      const alias = supplierAliases[candidate.text];
      if (!alias) throw new Error("供应商别名尚未全部确认");
      replacements.set(candidate.text, alias);
      continue;
    }
    replacements.set(candidate.text, REDACTION_LABELS[candidate.type]);
  }
  return replacements;
}

export async function prepareWorkbookChunks(
  sheets: NormalizedSheet[],
  replacements: Map<string, string>
): Promise<WorkbookChunk[]> {
  const output: WorkbookChunk[] = [];
  for (const sheet of sheets) {
    const chunks = await chunkSheetBySize(redactSheet(sheet, replacements), {
      maxRows: 500,
      maxCompressedBytes: CLIENT_CHUNK_TARGET_BYTES,
    });
    output.push(...chunks);
  }
  return output.map((chunk, ordinal) => ({ ...chunk, ordinal }));
}
