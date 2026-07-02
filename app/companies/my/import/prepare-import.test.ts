import { describe, expect, it } from "vitest";
import {
  buildConfirmedRedactions,
  normalizeManualSupplierNames,
  prepareWorkbookChunks,
  safeStoredWorkbookName,
} from "./prepare-import";
import type { SensitiveCandidate } from "../types";

const candidates: SensitiveCandidate[] = [
  {
    id: "one",
    type: "supplier",
    text: "株式会社山田商事",
    sheet_name: "仕入",
    cell_address: "A2",
  },
  {
    id: "two",
    type: "email",
    text: "owner@example.com",
    sheet_name: "仕入",
    cell_address: "B2",
  },
];

describe("confirmed business plan redaction", () => {
  it("requires a stable alias for every confirmed supplier", () => {
    expect(() => buildConfirmedRedactions(candidates, {})).toThrow(
      "供应商别名"
    );
  });

  it("uses fixed labels for direct identifiers", () => {
    const aliases = buildConfirmedRedactions(candidates, {
      "株式会社山田商事": "供应商A",
    });
    expect(aliases.get("株式会社山田商事")).toBe("供应商A");
    expect(aliases.get("owner@example.com")).toBe("[邮箱]");
  });

  it("normalizes manually supplied names without keeping duplicates", () => {
    expect(
      normalizeManualSupplierNames(
        "山田商事\n 山田商事 \nABC Trading\n\n"
      )
    ).toEqual(["山田商事", "ABC Trading"]);
  });

  it("never persists the local workbook file name", () => {
    expect(safeStoredWorkbookName("极秘_供应商名单.xlsx")).toBe(
      "经营计划.xlsx"
    );
  });

  it("assigns one global ordinal across visible sheets", async () => {
    const chunks = await prepareWorkbookChunks(
      [
        {
          name: "PL",
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
                  value: "项目",
                },
              ],
            },
          ],
        },
        {
          name: "CF",
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
                  value: "项目",
                },
              ],
            },
          ],
        },
      ],
      new Map()
    );

    expect(chunks.map((chunk) => chunk.ordinal)).toEqual([0, 1]);
  });
});
