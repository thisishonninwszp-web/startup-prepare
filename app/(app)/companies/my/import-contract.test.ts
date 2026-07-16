import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  businessPlanStoragePath,
  normalizeCreateImportInput,
  supplierNameHmac,
} from "./import-validation";

const validInput = {
  profile_id: "11111111-1111-4111-8111-111111111111",
  file_name: "plan.xlsx",
  file_size: 3_000_000,
  workbook_hash: "a".repeat(64),
  visible_sheet_count: 2,
  chunks: [
    {
      sheet_name: "PL",
      cell_range: "A1:M20",
      ordinal: 0,
      content_hash: "b".repeat(64),
      row_count: 20,
      column_count: 13,
      compressed_size: 1000,
    },
  ],
};

describe("business plan import contract", () => {
  it("rejects manifests that exceed the private bucket hard limit", () => {
    expect(() =>
      normalizeCreateImportInput({
        ...validInput,
        chunks: [{ ...validInput.chunks[0], compressed_size: 2_097_153 }],
      })
    ).toThrow("2 MB");
  });

  it("builds owner-prefixed storage paths without using file names", () => {
    expect(
      businessPlanStoragePath(
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        3
      )
    ).toBe(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/3.json.gz"
    );
  });

  it("creates a stable irreversible supplier identifier", () => {
    const key = Buffer.alloc(32, 9).toString("base64");
    const first = supplierNameHmac("株式会社山田商事", key);
    const second = supplierNameHmac("株式会社山田商事", key);

    expect(first).toBe(second);
    expect(first).not.toContain("山田");
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps database and signed upload writes behind authenticated actions", () => {
    const source = readFileSync("app/(app)/companies/my/actions.ts", "utf8");
    expect(source).toContain("await requireUserId()");
    expect(source).toContain('SUPPLIER_BUCKET = "internal-business-plans"');
    expect(source).toContain("createSignedUploadUrl");
    expect(source).not.toContain("console.log");
  });
});
