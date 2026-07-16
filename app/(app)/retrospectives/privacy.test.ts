import { describe, expect, it } from "vitest";
import { redactJournal } from "./privacy";

describe("journal privacy", () => {
  it("redacts contact details and user-defined names before AI use", () => {
    const result = redactJournal(
      "和田中さん在 tanaka@example.com 确认，电话 090-1234-5678。",
      ["田中さん"]
    );
    expect(result.text).not.toContain("tanaka@example.com");
    expect(result.text).not.toContain("090-1234-5678");
    expect(result.text).not.toContain("田中さん");
    expect(result.redactions).toEqual(
      expect.arrayContaining(["邮箱", "电话", "自定义词"])
    );
  });

  it("ignores empty redaction dictionary entries", () => {
    expect(redactJournal("今天完成访谈", ["", "  "]).text).toBe(
      "今天完成访谈"
    );
  });
});
