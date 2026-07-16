import { describe, expect, it } from "vitest";
import {
  extractSpreadsheetMaterial,
  extractTextLikeMaterial,
  redactRealityMaterialText,
  summarizeExtractedText,
} from "./extraction";

describe("material extraction", () => {
  it("redacts email, phone and labeled names before AI review", () => {
    const result = redactRealityMaterialText(
      "姓名：山田太郎\nmail: test@example.com\n電話 090-1234-5678"
    );
    expect(result.text).not.toContain("test@example.com");
    expect(result.text).not.toContain("090-1234-5678");
    expect(result.redactions).toEqual(
      expect.arrayContaining(["email", "phone", "name"])
    );
  });

  it("extracts plain text and markdown as text-like input", async () => {
    const result = await extractTextLikeMaterial({
      fileName: "note.md",
      contentType: "text/markdown",
      bytes: new TextEncoder().encode("# 现实\n供应商说价格下不来"),
    });
    expect(result.text).toContain("供应商说价格下不来");
    expect(result.is_truncated).toBe(false);
    expect(result.meta.format).toBe("markdown");
  });

  it("summarizes long extracted text with truncation metadata", () => {
    const result = summarizeExtractedText("a".repeat(25_000), 10_000);
    expect(result.text).toHaveLength(10_000);
    expect(result.is_truncated).toBe(true);
  });

  it("extracts only visible workbook sheets for material review", async () => {
    const result = await extractSpreadsheetMaterial({
      fileName: "plan.xlsx",
      sheets: [
        {
          name: "销售预测",
          state: "visible",
          rows: [
            ["月份", "销售额"],
            ["7月", "100000"],
          ],
        },
        {
          name: "隐藏供应商",
          state: "hidden",
          rows: [["A供应商"]],
        },
      ],
    });
    expect(result.text).toContain("销售预测");
    expect(result.text).not.toContain("A供应商");
    expect(result.meta.visible_sheet_names).toEqual(["销售预测"]);
    expect(result.meta.hidden_sheet_count).toBe(1);
  });
});
