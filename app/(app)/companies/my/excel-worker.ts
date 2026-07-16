/// <reference lib="webworker" />

import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  detectSensitiveCandidates,
  formulaReferencesHiddenSheet,
  inspectZipEntries,
  selectVisibleSheets,
  sha256Hex,
  validateWorkbookFile,
} from "./excel-domain";
import type {
  NormalizedCell,
  NormalizedRow,
  NormalizedSheet,
  WorkbookParseResult,
  WorksheetState,
} from "./types";

type ParseRequest = {
  type: "parse";
  fileName: string;
  fileSize: number;
  buffer: ArrayBuffer;
};

type ParseResponse =
  | { type: "parsed"; result: WorkbookParseResult }
  | { type: "error"; code: string; message: string };

function cellValue(
  cell: ExcelJS.Cell,
  hiddenSheetNames: string[]
): NormalizedCell | null {
  if (cell.value === null || cell.value === undefined || cell.text === "") {
    return null;
  }
  if (cell.formula) {
    if (cell.result === null || cell.result === undefined) {
      throw new Error(`公式 ${cell.address} 没有可读取的缓存结果`);
    }
    if (/[[\]]/.test(cell.formula)) {
      throw new Error(`公式 ${cell.address} 包含外部工作簿引用`);
    }
    if (formulaReferencesHiddenSheet(cell.formula, hiddenSheetNames)) {
      throw new Error(`公式 ${cell.address} 引用了隐藏工作表`);
    }
    return {
      address: cell.address,
      row: Number(cell.row),
      column: Number(cell.col),
      type: "formula",
      value: String(cell.result),
      formula: cell.formula,
      result: String(cell.result),
    };
  }
  if (cell.value instanceof Date) {
    return {
      address: cell.address,
      row: Number(cell.row),
      column: Number(cell.col),
      type: "date",
      value: cell.value.toISOString(),
    };
  }
  const type =
    typeof cell.value === "number"
      ? "number"
      : typeof cell.value === "boolean"
        ? "boolean"
        : typeof cell.value === "object" && "error" in cell.value
          ? "error"
          : "string";
  return {
    address: cell.address,
    row: Number(cell.row),
    column: Number(cell.col),
    type,
    value: cell.text || String(cell.value),
  };
}

function normalizeSheet(
  worksheet: ExcelJS.Worksheet,
  hiddenSheetNames: string[]
): NormalizedSheet {
  const rows: NormalizedRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    if (row.hidden) return;
    const cells: NormalizedCell[] = [];
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (worksheet.getColumn(cell.col).hidden) return;
      const normalized = cellValue(cell, hiddenSheetNames);
      if (normalized) cells.push(normalized);
    });
    if (cells.length > 0) rows.push({ index: row.number, cells });
  });
  return {
    name: worksheet.name,
    state: (worksheet.state ?? "visible") as WorksheetState,
    rows,
  };
}

async function parseWorkbook(input: ParseRequest): Promise<WorkbookParseResult> {
  validateWorkbookFile({ name: input.fileName, size: input.fileSize });

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(input.buffer);
  } catch {
    throw new Error("Excel 文件无效、损坏或受密码保护");
  }
  inspectZipEntries(Object.keys(zip.files));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(input.buffer as never);
  const selected = selectVisibleSheets(
    workbook.worksheets.map((worksheet) => ({
      worksheet,
      state: (worksheet.state ?? "visible") as WorksheetState,
    }))
  );
  if (selected.length === 0) throw new Error("没有可分析的可见工作表");

  const hiddenSheetNames = workbook.worksheets
    .filter((worksheet) => (worksheet.state ?? "visible") !== "visible")
    .map((worksheet) => worksheet.name);
  const sheets = selected.map(({ worksheet }) =>
    normalizeSheet(worksheet, hiddenSheetNames)
  );
  const candidates = sheets.flatMap((sheet) => [
    ...detectSensitiveCandidates(sheet.name, [
      {
        address: "$SHEET",
        row: 0,
        column: 0,
        type: "string" as const,
        value: sheet.name,
      },
    ]),
    ...detectSensitiveCandidates(
      sheet.name,
      sheet.rows.flatMap((row) => row.cells)
    ),
  ]);

  return {
    workbook_hash: await sha256Hex(input.buffer),
    sheets,
    candidates,
  };
}

self.onmessage = async (event: MessageEvent<ParseRequest>) => {
  if (event.data.type !== "parse") return;
  try {
    const result = await parseWorkbook(event.data);
    self.postMessage({ type: "parsed", result } satisfies ParseResponse);
  } catch (error) {
    self.postMessage({
      type: "error",
      code: "workbook_parse_failed",
      message: error instanceof Error ? error.message : "Excel 解析失败",
    } satisfies ParseResponse);
  }
};

export {};
