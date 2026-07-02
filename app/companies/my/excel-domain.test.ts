import { describe, expect, it } from "vitest";
import {
  chunkSheetBySize,
  detectSensitiveCandidates,
  formulaReferencesHiddenSheet,
  inspectZipEntries,
  redactCells,
  redactSheet,
  selectVisibleSheets,
  validateWorkbookFile,
} from "./excel-domain";
import type { NormalizedRow, NormalizedSheet } from "./types";

function makeSheet(rowCount: number, value = "普通内容"): NormalizedSheet {
  const rows: NormalizedRow[] = Array.from({ length: rowCount }, (_, index) => ({
    index: index + 1,
    cells: [
      {
        address: `A${index + 1}`,
        row: index + 1,
        column: 1,
        type: "string",
        value: index === 0 ? "项目" : value,
      },
    ],
  }));
  return { name: "PL", state: "visible", rows };
}

describe("business plan workbook safety", () => {
  it("accepts only xlsx files up to ten megabytes", () => {
    expect(() =>
      validateWorkbookFile({ name: "plan.xlsx", size: 3_000_000 })
    ).not.toThrow();
    expect(() =>
      validateWorkbookFile({ name: "plan.xlsm", size: 3_000_000 })
    ).toThrow("只支持 .xlsx");
    expect(() =>
      validateWorkbookFile({ name: "plan.xlsx", size: 10_485_761 })
    ).toThrow("10 MB");
  });

  it("rejects macros and external workbook links in the zip package", () => {
    expect(() =>
      inspectZipEntries(["xl/workbook.xml", "xl/vbaProject.bin"])
    ).toThrow("宏");
    expect(() =>
      inspectZipEntries([
        "xl/workbook.xml",
        "xl/externalLinks/externalLink1.xml",
      ])
    ).toThrow("外部链接");
  });

  it("keeps visible sheets and excludes hidden sheets", () => {
    expect(
      selectVisibleSheets([
        { name: "PL", state: "visible" as const },
        { name: "内部メモ", state: "hidden" as const },
        { name: "秘密", state: "veryHidden" as const },
      ])
    ).toEqual([{ name: "PL", state: "visible" }]);
  });

  it("replaces confirmed supplier names before chunking", () => {
    const [cell] = redactCells(
      [
        {
          address: "B4",
          row: 4,
          column: 2,
          type: "string",
          value: "株式会社山田商事 仕入",
        },
      ],
      new Map([["株式会社山田商事", "供应商A"]])
    );

    expect(cell.value).toBe("供应商A 仕入");
  });

  it("redacts supplier names inside formulas and cached results", () => {
    const [cell] = redactCells(
      [
        {
          address: "B4",
          row: 4,
          column: 2,
          type: "formula",
          value: "株式会社山田商事",
          formula: "'株式会社山田商事'!B2",
          result: "株式会社山田商事",
        },
      ],
      new Map([["株式会社山田商事", "供应商A"]])
    );

    expect(cell.formula).toBe("'供应商A'!B2");
    expect(cell.result).toBe("供应商A");
  });

  it("detects formulas that expose a hidden worksheet name", () => {
    expect(
      formulaReferencesHiddenSheet("'内部メモ'!B2+PL!B2", ["内部メモ"])
    ).toBe(true);
    expect(formulaReferencesHiddenSheet("PL!B2", ["内部メモ"])).toBe(false);
  });

  it("redacts a sensitive visible sheet name as well as its cells", () => {
    const redacted = redactSheet(
      {
        name: "株式会社山田商事_仕入",
        state: "visible",
        rows: [
          {
            index: 1,
            cells: [
              {
                address: "A1",
                row: 1,
                column: 1,
                type: "string",
                value: "株式会社山田商事",
              },
            ],
          },
        ],
      },
      new Map([["株式会社山田商事", "供应商A"]])
    );

    expect(redacted.name).toBe("供应商A_仕入");
    expect(redacted.rows[0].cells[0].value).toBe("供应商A");
  });

  it("finds supplier names and direct contact details locally", () => {
    const candidates = detectSensitiveCandidates("仕入", [
      {
        address: "B4",
        row: 4,
        column: 2,
        type: "string",
        value: "株式会社山田商事 contact@example.com 03-1234-5678",
      },
    ]);

    expect(candidates.map((candidate) => candidate.type)).toEqual([
      "supplier",
      "email",
      "phone",
    ]);
    expect(candidates.every((candidate) => candidate.sheet_name === "仕入")).toBe(
      true
    );
  });

  it("finds sensitive names embedded in a formula before upload", () => {
    const candidates = detectSensitiveCandidates("PL", [
      {
        address: "B4",
        row: 4,
        column: 2,
        type: "formula",
        value: "100",
        formula: 'IF(A1="株式会社山田商事",100,0)',
        result: "100",
      },
    ]);

    expect(candidates.map((candidate) => candidate.text)).toContain(
      "株式会社山田商事"
    );
  });

  it("repeats the header when row limits split a sheet", async () => {
    const chunks = await chunkSheetBySize(makeSheet(501), {
      maxRows: 500,
      maxCompressedBytes: 1_887_436,
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[1].rows[0]).toEqual(chunks[0].rows[0]);
  });

  it("splits again when compressed JSON exceeds the byte target", async () => {
    const chunks = await chunkSheetBySize(
      makeSheet(8, "很长的经营数据".repeat(8)),
      {
        maxRows: 500,
        maxCompressedBytes: 600,
      },
      async (value) => new TextEncoder().encode(JSON.stringify(value))
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.compressed_size <= 600)).toBe(true);
  });
});
