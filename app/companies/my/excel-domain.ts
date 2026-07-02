import type {
  NormalizedCell,
  NormalizedRow,
  NormalizedSheet,
  SensitiveCandidate,
  SensitiveCandidateType,
  WorkbookChunk,
  WorksheetState,
} from "./types";

const MAX_WORKBOOK_BYTES = 10 * 1024 * 1024;

export function validateWorkbookFile(
  file: Pick<File, "name" | "size">
): void {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw new Error("第一版只支持 .xlsx 文件");
  }
  if (file.size < 1 || file.size > MAX_WORKBOOK_BYTES) {
    throw new Error("Excel 文件必须小于或等于 10 MB");
  }
}

export function inspectZipEntries(names: string[]): void {
  const normalized = names.map((name) => name.replaceAll("\\", "/").toLowerCase());
  if (normalized.some((name) => name.endsWith("/vbaproject.bin"))) {
    throw new Error("检测到宏内容，不能导入");
  }
  if (normalized.some((name) => name.startsWith("xl/externallinks/"))) {
    throw new Error("检测到外部链接，不能导入");
  }
}

export function selectVisibleSheets<
  T extends { state: WorksheetState }
>(sheets: T[]): T[] {
  return sheets.filter((sheet) => sheet.state === "visible");
}

export function formulaReferencesHiddenSheet(
  formula: string,
  hiddenSheetNames: string[]
): boolean {
  const normalizedFormula = formula.toLocaleLowerCase();
  return hiddenSheetNames.some((name) => {
    const normalizedName = name.toLocaleLowerCase();
    const quoted = `'${normalizedName.replaceAll("'", "''")}'!`;
    return (
      normalizedFormula.includes(quoted) ||
      normalizedFormula.includes(`${normalizedName}!`)
    );
  });
}

const SENSITIVE_PATTERNS: Array<{
  type: SensitiveCandidateType;
  expression: RegExp;
}> = [
  {
    type: "supplier",
    expression:
      /(?:株式会社|有限会社|合同会社)[^\s,，、。;；"'()=+*/!]{2,30}|[^\s,，、。;；"'()=+*/!]{2,30}(?:株式会社|有限会社|合同会社)/g,
  },
  {
    type: "email",
    expression: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  },
  {
    type: "phone",
    expression: /(?:\+81[-\s]?)?0\d{1,4}[-\s]\d{1,4}[-\s]\d{3,4}/g,
  },
  {
    type: "corporate_number",
    expression: /(?<!\d)\d{13}(?!\d)/g,
  },
  {
    type: "bank_account",
    expression: /(?:口座|账号|account)[^\d]{0,8}\d{6,12}/gi,
  },
];

export function detectSensitiveCandidates(
  sheetName: string,
  cells: NormalizedCell[]
): SensitiveCandidate[] {
  const candidates: SensitiveCandidate[] = [];
  const seen = new Set<string>();
  for (const cell of cells) {
    const sources = [cell.value, cell.formula, cell.result].filter(
      (value): value is string => typeof value === "string" && value.length > 0
    );
    for (const source of sources) {
      for (const { type, expression } of SENSITIVE_PATTERNS) {
        expression.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = expression.exec(source)) !== null) {
          const text = match[0]?.trim();
          if (!text) continue;
          const key = `${type}:${text}:${cell.address}`;
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push({
            id: `${sheetName}:${cell.address}:${type}:${candidates.length}`,
            type,
            text,
            sheet_name: sheetName,
            cell_address: cell.address,
          });
        }
      }
    }
  }
  return candidates;
}

function replaceAllLiteral(value: string, search: string, replacement: string) {
  return search ? value.split(search).join(replacement) : value;
}

export function redactCells(
  cells: NormalizedCell[],
  aliases: Map<string, string>
): NormalizedCell[] {
  const replacements = Array.from(aliases.entries()).sort(
    ([left], [right]) => right.length - left.length
  );
  return cells.map((cell) => {
    let value = cell.value;
    let result = cell.result;
    let formula = cell.formula;
    for (const [source, alias] of replacements) {
      value = replaceAllLiteral(value, source, alias);
      if (result) result = replaceAllLiteral(result, source, alias);
      if (formula) formula = replaceAllLiteral(formula, source, alias);
    }
    return {
      ...cell,
      value,
      ...(formula === undefined ? {} : { formula }),
      ...(result === undefined ? {} : { result }),
    };
  });
}

export function redactSheet(
  sheet: NormalizedSheet,
  aliases: Map<string, string>
): NormalizedSheet {
  const replacements = Array.from(aliases.entries()).sort(
    ([left], [right]) => right.length - left.length
  );
  let name = sheet.name;
  for (const [source, alias] of replacements) {
    name = replaceAllLiteral(name, source, alias);
  }
  return {
    ...sheet,
    name,
    rows: sheet.rows.map((row) => ({
      ...row,
      cells: redactCells(row.cells, aliases),
    })),
  };
}

function columnName(column: number): string {
  let value = column;
  let output = "";
  while (value > 0) {
    value -= 1;
    output = String.fromCharCode(65 + (value % 26)) + output;
    value = Math.floor(value / 26);
  }
  return output || "A";
}

function cellRange(rows: NormalizedRow[]): string {
  const cells = rows.flatMap((row) => row.cells);
  if (cells.length === 0) throw new Error("分块不能是空表格");
  const minRow = Math.min(...cells.map((cell) => cell.row));
  const maxRow = Math.max(...cells.map((cell) => cell.row));
  const minColumn = Math.min(...cells.map((cell) => cell.column));
  const maxColumn = Math.max(...cells.map((cell) => cell.column));
  return `${columnName(minColumn)}${minRow}:${columnName(maxColumn)}${maxRow}`;
}

export async function sha256Hex(
  value: ArrayBuffer | Uint8Array | string
): Promise<string> {
  const bytes =
    typeof value === "string"
      ? new TextEncoder().encode(value)
      : value instanceof Uint8Array
        ? value
        : new Uint8Array(value);
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestInput.buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function gzipJson(value: unknown): Promise<Uint8Array> {
  const stream = new Blob([JSON.stringify(value)])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function initialBatches(sheet: NormalizedSheet, maxRows: number): NormalizedRow[][] {
  if (sheet.rows.length === 0) throw new Error(`${sheet.name} 没有可导入内容`);
  if (maxRows < 2) throw new Error("每个分块至少需要容纳表头和一行数据");
  const [header, ...dataRows] = sheet.rows;
  if (dataRows.length === 0) return [[header]];
  const batches: NormalizedRow[][] = [];
  const dataLimit = maxRows - 1;
  for (let index = 0; index < dataRows.length; index += dataLimit) {
    batches.push([header, ...dataRows.slice(index, index + dataLimit)]);
  }
  return batches;
}

function columnCount(rows: NormalizedRow[]): number {
  return new Set(rows.flatMap((row) => row.cells.map((cell) => cell.column))).size;
}

type Compressor = (value: unknown) => Promise<Uint8Array>;

export async function chunkSheetBySize(
  sheet: NormalizedSheet,
  limits: { maxRows: number; maxCompressedBytes: number },
  compress: Compressor = gzipJson
): Promise<WorkbookChunk[]> {
  if (sheet.state !== "visible") throw new Error("隐藏工作表不能被分块");
  if (limits.maxCompressedBytes < 1) throw new Error("分块字节限制无效");

  const fittedRows: NormalizedRow[][] = [];

  async function fit(rows: NormalizedRow[]): Promise<void> {
    const compressed = await compress({
      sheet_name: sheet.name,
      rows,
    });
    if (compressed.byteLength <= limits.maxCompressedBytes) {
      fittedRows.push(rows);
      return;
    }
    const [header, ...dataRows] = rows;
    if (dataRows.length <= 1) {
      throw new Error(`${sheet.name} 存在超过分块限制的单行数据`);
    }
    const middle = Math.ceil(dataRows.length / 2);
    await fit([header, ...dataRows.slice(0, middle)]);
    await fit([header, ...dataRows.slice(middle)]);
  }

  for (const rows of initialBatches(sheet, limits.maxRows)) {
    await fit(rows);
  }

  return Promise.all(
    fittedRows.map(async (rows, ordinal) => {
      const body = { sheet_name: sheet.name, rows };
      const compressedData = await compress(body);
      return {
        sheet_name: sheet.name,
        cell_range: cellRange(rows),
        ordinal,
        rows,
        row_count: rows.length,
        column_count: columnCount(rows),
        content_hash: await sha256Hex(JSON.stringify(body)),
        compressed_size: compressedData.byteLength,
        compressed_data: compressedData,
      };
    })
  );
}
