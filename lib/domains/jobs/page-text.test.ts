import { describe, expect, it } from "vitest";
import { decodeEntities, extractJobText, jobPostingJsonLd } from "./page-text";

describe("招聘页正文", () => {
  it("decodeEntities", () => {
    expect(decodeEntities("A&amp;B &#12354;&#x3042; &nbsp;x")).toBe("A&B ああ  x");
  });

  it("jobPostingJsonLd：取 JobPosting（含 @graph、@type 是数组的）", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":["JobPosting"],"title":"データアナリスト","hiringOrganization":{"name":"株式会社ABC"},"jobLocation":{"address":{"addressRegion":"大阪府","addressLocality":"大阪市"}},"baseSalary":{"currency":"JPY","value":{"minValue":4500000,"maxValue":6000000,"unitText":"YEAR"}},"description":"<p>分析業務</p>"}]}</script>`;
    expect(jobPostingJsonLd(html)).toEqual([
      "職種：データアナリスト",
      "会社：株式会社ABC",
      "勤務地：大阪府大阪市",
      "給与：4500000〜6000000 JPY YEAR",
      "仕事内容：分析業務",
    ]);
    expect(jobPostingJsonLd(`<script type="application/ld+json">{oops</script>`)).toEqual([]);
  });

  it("extractJobText：短格子也留，表头和值并成一行；脚本、导航不要；重复的去掉", () => {
    const html = `
      <nav><li>トップ</li></nav>
      <h1>データアナリスト</h1>
      <table><tr><th>勤務地</th><td>大阪府大阪市</td></tr><tr><th>年収</th><td>450万円〜</td></tr></table>
      <dl><dt>応募資格</dt><dd>Excel の実務経験</dd></dl>
      <p>一緒に働きましょう</p><p>一緒に働きましょう</p>
      <script>var x = "<p>no</p>";</script>`;
    expect(extractJobText(html)).toBe(
      ["データアナリスト", "勤務地：大阪府大阪市", "年収：450万円〜", "応募資格：Excel の実務経験", "一緒に働きましょう"].join("\n")
    );
  });
});
