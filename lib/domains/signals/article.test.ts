import { describe, expect, it } from "vitest";
import { decodeHtml, detectCharset } from "./article";

describe("detectCharset", () => {
  it("响应头优先，其次 meta，都没有当 UTF-8", () => {
    expect(detectCharset("text/html; charset=Shift_JIS", "")).toBe("shift_jis");
    expect(detectCharset("text/html", '<meta charset="EUC-JP">')).toBe("euc-jp");
    expect(
      detectCharset("text/html", '<meta http-equiv="Content-Type" content="text/html; charset=shift_jis">')
    ).toBe("shift_jis");
    expect(detectCharset(null, "<html>")).toBe("utf-8");
  });
});

describe("decodeHtml", () => {
  it("Shift_JIS 的页面解出正确的日文", () => {
    // 「日本」的 Shift_JIS 编码是 93 FA 96 7B
    const head = new TextEncoder().encode('<meta charset="Shift_JIS"><p>');
    const body = new Uint8Array([0x93, 0xfa, 0x96, 0x7b]);
    const bytes = new Uint8Array([...head, ...body]);
    expect(decodeHtml(bytes.buffer, "text/html")).toContain("日本");
  });

  it("不认识的编码名退回 UTF-8", () => {
    const bytes = new TextEncoder().encode("<p>你好</p>");
    expect(decodeHtml(bytes.buffer, "text/html; charset=not-a-charset")).toContain("你好");
  });
});
