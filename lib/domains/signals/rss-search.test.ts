import { describe, expect, it } from "vitest";
import { extractArticleText, extractSearchText } from "./rss";

describe("extractSearchText（上网查证用的正文）", () => {
  const html = `
    <nav><ul><li>トップページへ戻るリンクがここにあります</li></ul></nav>
    <p>楽天モバイルは2020年4月に本格サービスを開始した移動体通信事業者である。</p>
    <ul><li>2024年6月16日 - 契約数が700万回線を突破したと発表した。</li><li>短い</li></ul>
    <table><tr><td>2023年8月28日：契約数が500万回線を突破したと発表。</td></tr></table>
    <p>楽天モバイルは2020年4月に本格サービスを開始した移動体通信事業者である。</p>`;

  it("列表、表格里的年表也读进来；菜单、太短的、重复的丢掉", () => {
    expect(extractSearchText(html).split("\n")).toEqual([
      "楽天モバイルは2020年4月に本格サービスを開始した移動体通信事業者である。",
      "2024年6月16日 - 契約数が700万回線を突破したと発表した。",
      "2023年8月28日：契約数が500万回線を突破したと発表。",
    ]);
  });

  it("读文章用的那个照旧只读 <p>", () => {
    expect(extractArticleText(html)).not.toContain("700万");
  });
});
