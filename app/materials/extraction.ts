import ExcelJS from "exceljs";
import JSZip from "jszip";
import { summarizeSpreadsheetRows, type SpreadsheetSheet } from "./domain";

export type RealityMaterialRedactionKind =
  | "email"
  | "phone"
  | "name"
  | "corporate_number"
  | "bank_account";

export type ExtractedMaterialText = {
  text: string;
  is_truncated: boolean;
  unreadable: string[];
  visible_sheets: string[];
  meta: Record<string, unknown>;
};

const DEFAULT_TEXT_LIMIT = 20_000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function summarizeExtractedText(
  text: string,
  limit = DEFAULT_TEXT_LIMIT
): { text: string; is_truncated: boolean } {
  const normalized = text.replace(/\u0000/g, "").trim();
  if (normalized.length <= limit) {
    return { text: normalized, is_truncated: false };
  }
  return { text: normalized.slice(0, limit), is_truncated: true };
}

export function redactRealityMaterialText(input: string): {
  text: string;
  redactions: RealityMaterialRedactionKind[];
} {
  const found = new Set<RealityMaterialRedactionKind>();
  let text = input;

  text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, () => {
    found.add("email");
    return "[已遮蔽邮箱]";
  });

  text = text.replace(
    /(?<!\d)(?:\+?\d{1,3}[-\s]?)?(?:0\d{1,4}[-\s]?\d{2,4}[-\s]?\d{3,4}|1[3-9]\d{9})(?!\d)/g,
    () => {
      found.add("phone");
      return "[已遮蔽电话]";
    }
  );

  text = text.replace(
    /(^|\n)\s*(姓名|名字|name|联系人)\s*[:：]\s*[^\n,，、]{1,40}/gi,
    (_match, prefix: string, label: string) => {
      found.add("name");
      return `${prefix}${label}：[已遮蔽姓名]`;
    }
  );

  text = text.replace(/(?<!\d)\d{13}(?!\d)/g, () => {
    found.add("corporate_number");
    return "[已遮蔽法人编号]";
  });

  text = text.replace(/(?:口座|账号|account)[^\d]{0,8}\d{6,12}/gi, () => {
    found.add("bank_account");
    return "[已遮蔽银行账户]";
  });

  return { text, redactions: Array.from(found) };
}

function assertFileSize(bytes: Uint8Array) {
  if (bytes.byteLength < 1) throw new Error("文件不能为空");
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("文件不能超过 10 MB");
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function extension(fileName: string): string {
  const last = fileName.toLowerCase().split(".").pop();
  return last ? `.${last}` : "";
}

async function extractDocx(bytes: Uint8Array): Promise<ExtractedMaterialText> {
  const zip = await JSZip.loadAsync(bytes);
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("DOCX 中没有可读取正文");
  const xml = await file.async("text");
  const text = xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
  const summarized = summarizeExtractedText(text);
  return {
    ...summarized,
    unreadable: [],
    visible_sheets: [],
    meta: { format: "docx" },
  };
}

function normalizeSheetState(
  state: string | undefined
): SpreadsheetSheet["state"] {
  if (state === "hidden" || state === "veryHidden") return state;
  return "visible";
}

async function extractXlsx(bytes: Uint8Array): Promise<ExtractedMaterialText> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes.buffer as never);
  const sheets: SpreadsheetSheet[] = workbook.worksheets.map((sheet) => {
    const rows: unknown[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      if (row.hidden) return;
      const values: unknown[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (sheet.getColumn(cell.col).hidden) return;
        if (cell.formula) {
          values.push(cell.result ?? "[公式无缓存结果]");
          return;
        }
        values.push(cell.text || cell.value || "");
      });
      if (values.some((value) => String(value ?? "").trim())) rows.push(values);
    });
    return {
      name: sheet.name,
      state: normalizeSheetState(sheet.state),
      rows,
    };
  });
  const summary = summarizeSpreadsheetRows(sheets, DEFAULT_TEXT_LIMIT, 80, 20);
  if (summary.visible_sheet_names.length === 0) {
    throw new Error("没有可读取的可见工作表");
  }
  return {
    text: summary.text,
    is_truncated: summary.is_truncated,
    unreadable:
      summary.hidden_sheet_count > 0
        ? [`跳过 ${summary.hidden_sheet_count} 个隐藏工作表`]
        : [],
    visible_sheets: summary.visible_sheet_names,
    meta: {
      format: "xlsx",
      visible_sheet_names: summary.visible_sheet_names,
      hidden_sheet_count: summary.hidden_sheet_count,
      sheet_count: summary.sheet_count,
    },
  };
}

function extractPdfBestEffort(bytes: Uint8Array): ExtractedMaterialText {
  const raw = Buffer.from(bytes).toString("latin1");
  const strings = Array.from(raw.matchAll(/\(([^()]{2,200})\)/g))
    .map((match) => match[1])
    .filter((value) => /[A-Za-z0-9\u3040-\u30ff\u3400-\u9fff]/.test(value));
  const summarized = summarizeExtractedText(strings.join("\n"));
  return {
    ...summarized,
    unreadable:
      summarized.text.length > 0
        ? ["PDF 使用基础文本层抽取，扫描图片和复杂编码可能无法读取"]
        : ["PDF 没有可读取文本层，请改用复制文本或上传可解析文档"],
    visible_sheets: [],
    meta: { format: "pdf", extraction: "best_effort" },
  };
}

export async function extractTextLikeMaterial(input: {
  fileName: string;
  contentType?: string | null;
  bytes: Uint8Array;
}): Promise<ExtractedMaterialText> {
  assertFileSize(input.bytes);
  const ext = extension(input.fileName);
  if ([".txt", ".md", ".markdown", ".csv"].includes(ext)) {
    const summarized = summarizeExtractedText(decodeText(input.bytes));
    return {
      ...summarized,
      unreadable: [],
      visible_sheets: [],
      meta: {
        format:
          ext === ".md" || ext === ".markdown"
            ? "markdown"
            : ext === ".csv"
              ? "csv"
              : "text",
      },
    };
  }
  if (ext === ".docx") return extractDocx(input.bytes);
  if (ext === ".xlsx") return extractXlsx(input.bytes);
  if (ext === ".pdf") return extractPdfBestEffort(input.bytes);
  throw new Error("第一版支持 TXT / Markdown / CSV / DOCX / XLSX / PDF");
}

export async function extractSpreadsheetMaterial(input: {
  fileName: string;
  sheets: SpreadsheetSheet[];
}): Promise<ExtractedMaterialText> {
  const summary = summarizeSpreadsheetRows(input.sheets);
  return {
    text: summary.text,
    is_truncated: summary.is_truncated,
    unreadable:
      summary.hidden_sheet_count > 0
        ? [`跳过 ${summary.hidden_sheet_count} 个隐藏工作表`]
        : [],
    visible_sheets: summary.visible_sheet_names,
    meta: {
      format: "xlsx",
      file_name: input.fileName,
      visible_sheet_names: summary.visible_sheet_names,
      hidden_sheet_count: summary.hidden_sheet_count,
    },
  };
}
