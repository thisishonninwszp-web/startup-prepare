import { describe, expect, it } from "vitest";
import { clipBookmarklet, parseClipMessage } from "./clip-shared";

describe("书签小工具", () => {
  it("parseClipMessage：类型对、网址是 http(s)、有正文或选中的那段才收；超长的截断", () => {
    const ok = parseClipMessage({ type: "ideaos-clip", url: "https://note.com/a/n/1", title: " 标题 ", text: " 正文 ", selection: "" });
    expect(ok).toEqual({ url: "https://note.com/a/n/1", title: "标题", text: "正文", selection: "" });
    expect(parseClipMessage({ type: "other", url: "https://a.jp", text: "x" })).toBeNull();
    expect(parseClipMessage({ type: "ideaos-clip", url: "javascript:alert(1)", text: "x" })).toBeNull();
    expect(parseClipMessage({ type: "ideaos-clip", url: "https://a.jp", text: "", selection: "" })).toBeNull();
    expect(parseClipMessage("ideaos-clip")).toBeNull();
    const long = parseClipMessage({ type: "ideaos-clip", url: "https://a.jp", text: "あ".repeat(70_000) });
    expect(long?.text.length).toBe(60_000);
  });

  it("clipBookmarklet：javascript: 开头、解码后是能跑的脚本，网址开头填进去", () => {
    const href = clipBookmarklet("https://startup-prepare.vercel.app");
    expect(href.startsWith("javascript:")).toBe(true);
    const code = decodeURIComponent(href.slice("javascript:".length));
    expect(code).toContain('"https://startup-prepare.vercel.app"');
    expect(code).toContain("/materials/clip?url=");
    // 语法要对（书签里一个括号写错，点了就什么都不发生）
    expect(() => new Function(code)).not.toThrow();
  });
});
