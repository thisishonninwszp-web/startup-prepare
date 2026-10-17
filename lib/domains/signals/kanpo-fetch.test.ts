import { describe, expect, it } from "vitest";
import { issueLabel, pageUrl, parseIssueIndex, parseSettlementSections } from "./kanpo-fetch";

const INDEX = `
<a href="20261016/20261016h01809/20261016h01809full00010032f.html">1-32頁</a>
<a href="20261016/20261016g00227/20261016g00227full00010104f.html">1-104頁</a>
<a href="20261016/20261016g00228/20261016g00228full00010320f.html">1-320頁</a>
<a href="20261016/20261016g00228/20261016g00228full03210640f.html">321-640頁</a>
<a href="20261016/20261016g00228/20261016g00228full06410680f.html">641-680頁</a>
<a href="20261015/20261015g00226/20261015g00226full00010144f.html">1-144頁</a>`;

const CONTENTS = `
<a href="20261016g00227/20261016g002270072f.html">
  <span class="text">会社その他</span>
  <span class="date">72</span>
</a>
<a href="20261016g00227/20261016g002270080f.html">
  <span class="text">会社決算公告</span>
  <span class="date">80</span>
</a>
<a href="20261016h01809/20261016h018090010f.html">
  <span class="text">会社決算公告</span>
  <span class="date">10</span>
</a>
<a href="20261016h01809/20261016h018090028f.html">
  <span class="text">会社その他</span>
  <span class="date">28</span>
</a>`;

describe("官报首页", () => {
  it("每一份取最后一页（分几段的取最大的结尾）", () => {
    const issues = parseIssueIndex(INDEX);
    expect(issues.find((i) => i.code === "20261016g00228")?.lastPage).toBe(680);
    expect(issues.find((i) => i.code === "20261016g00227")?.lastPage).toBe(104);
    expect(issues.find((i) => i.code === "20261015g00226")?.date).toBe("20261015");
  });
});

describe("全体目次", () => {
  it("会社決算公告到这一份的最后一页；同一份后面还有栏目的，到下一栏之前", () => {
    const sections = parseSettlementSections(CONTENTS, parseIssueIndex(INDEX));
    expect(sections).toEqual([
      { code: "20261016g00227", from: 80, to: 104 },
      { code: "20261016h01809", from: 10, to: 27 },
    ]);
  });
});

describe("地址和名字", () => {
  it("每页 PDF 的地址；份的名字", () => {
    expect(pageUrl("20261016g00227", 80)).toBe("https://www.kanpo.go.jp/20261016/20261016g00227/pdf/20261016g002270080.pdf");
    expect(issueLabel("20261016g00227")).toBe("号外第227号");
    expect(issueLabel("20261016h01809")).toBe("本紙第1809号");
  });
});
