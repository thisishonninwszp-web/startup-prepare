import { describe, expect, it } from "vitest";
import { extractPageDescription } from "./rss";
import { usableSummary, worthFetchingPage } from "./summary";

describe("usableSummary", () => {
  it("正常摘要原样给出，太长的截断", () => {
    const s = "10月1日から、楽天モバイルユーザーに対するKDDIのエリアローミングが大幅に縮小された。";
    expect(usableSummary("楽天モバイル", s)).toBe(s);
    expect(usableSummary("t", "あ".repeat(500))).toHaveLength(401);
  });

  it("Hacker News 的 Comments、Google News 重复标题、空的，都不显示", () => {
    expect(usableSummary("LineageOS 24.0", "Comments")).toBe("");
    expect(
      usableSummary(
        "転職スカウトと希望条件の相性分析 ウォンテッドリーが新アプリ - 日本経済新聞",
        "転職スカウトと希望条件の相性分析 ウォンテッドリーが新アプリ - 日本経済新聞 日本経済新聞"
      )
    ).toBe("");
    // 真实样本：RSS 里是 &amp;nbsp;，解一次实体后剩下 &nbsp;
    expect(
      usableSummary(
        "転職スカウトと希望条件の相性分析 ウォンテッドリーが新アプリ - 日本経済新聞",
        "転職スカウトと希望条件の相性分析 ウォンテッドリーが新アプリ &nbsp;&nbsp; 日本経済新聞"
      )
    ).toBe("");
    expect(usableSummary("x", null)).toBe("");
  });
});

describe("worthFetchingPage", () => {
  it("Google News 的跳转页不去，其余去", () => {
    expect(worthFetchingPage("https://news.google.com/rss/articles/abc")).toBe(false);
    expect(worthFetchingPage("https://news.yahoo.co.jp/pickup/1")).toBe(true);
    expect(worthFetchingPage("not a url")).toBe(false);
  });
});

describe("extractPageDescription", () => {
  it("og:description 优先，属性顺序不限，实体解开", () => {
    const html = `<head>
      <meta name="description" content="普通描述">
      <meta content="会員の情報&amp;1464万件が流出" property="og:description"/>
    </head>`;
    expect(extractPageDescription(html)).toBe("会員の情報&1464万件が流出");
  });

  it("没有 og 就用 meta description，都没有给空", () => {
    expect(extractPageDescription(`<meta name="description" content='只有这个'>`)).toBe("只有这个");
    expect(extractPageDescription("<html></html>")).toBe("");
  });
});
