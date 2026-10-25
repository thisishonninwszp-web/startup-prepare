import { describe, expect, it } from "vitest";
import { compareReadingEvidence, sourceEvidence, type ReadingEvidence } from "./reading-insight-shared";

const verified = (basis: string[]): ReadingEvidence => ({
  background: "AI 整理的背景",
  grounded: true,
  basis,
  url: "https://example.com/article",
});

describe("阅读时的来源边界", () => {
  it("只把正文逐字核验过的摘录放入原文依据，去空和重复", () => {
    expect(sourceEvidence(verified([" 利率维持不变 ", "", "利率维持不变"]))).toMatchObject({
      excerpts: ["利率维持不变"],
      url: "https://example.com/article",
      status: "verified_excerpt",
    });
    expect(sourceEvidence({ ...verified(["没有核实的话"]), grounded: false }).excerpts).toEqual([]);
    expect(sourceEvidence({ ...verified(["旧数据"]), grounded: undefined }).excerpts).toEqual([]);
  });

  it("缺少正文依据时说明边界，不把 AI 背景冒充事实", () => {
    expect(sourceEvidence({ background: "AI 背景", grounded: false, url: null })).toMatchObject({ status: "unread_body", url: null });
    expect(sourceEvidence({ background: "AI 背景", grounded: true, basis: [] }).status).toBe("no_excerpt");
    expect(sourceEvidence({ background: "AI 背景" }).notice).toContain("核验");
  });

  it("只给真实 HTTP 地址生成来源链接", () => {
    for (const url of ["javascript:alert(1)", "/signals/old", "https://", "", "mailto:x@example.com"]) {
      expect(sourceEvidence({ ...verified(["原话"]), url }).url).toBeNull();
    }
    expect(sourceEvidence({ ...verified(["原话"]), url: "http://example.com/a" }).url).toBe("http://example.com/a");
  });
});

describe("前后报道对照", () => {
  it("忽略标点、空白差异和摘录范围差异，不报成新增", () => {
    expect(compareReadingEvidence(verified(["政策利率，维持不变。"]), verified(["政策利率维持不变"]))).toMatchObject({
      status: "same", differentExcerpts: [],
    });
    expect(compareReadingEvidence(verified(["利率维持不变"]), verified(["政策利率维持不变，会议结束"])).status).toBe("same");
  });

  it("不同原文只称摘录差异，不认定语义或现实发生新变化", () => {
    const result = compareReadingEvidence(verified(["该行下调了政策利率"]), verified(["政策利率维持不变"]));
    expect(result.status).toBe("different_excerpts");
    expect(result.differentExcerpts).toEqual(["该行下调了政策利率"]);
    expect(result.notice).toContain("措辞");
    expect(result.notice).toContain("事实");
  });

  it("任意一侧没有核验依据时只对照背景，不生成摘录增量", () => {
    const previous = { background: "上次 AI 背景", grounded: false };
    expect(compareReadingEvidence(verified(["本次原话"]), previous)).toMatchObject({
      status: "insufficient", differentExcerpts: [], previousBackground: previous.background,
    });
    expect(compareReadingEvidence(verified(["本次原话"]))).toMatchObject({ status: "insufficient", previousBackground: null });
  });
});
