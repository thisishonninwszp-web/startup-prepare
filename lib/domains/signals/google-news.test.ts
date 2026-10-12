import { describe, expect, it } from "vitest";
import { googleNewsArticleId, isGoogleNewsUrl, parseDecodedUrl, parseSignature } from "./google-news";

describe("Google News 原文还原", () => {
  it("认得跳转链接、取出文章编号", () => {
    const url = "https://news.google.com/rss/articles/CBMiW0FVX3lx?oc=5&hl=ja";
    expect(isGoogleNewsUrl(url)).toBe(true);
    expect(isGoogleNewsUrl("https://www.nikkei.com/article/1")).toBe(false);
    expect(googleNewsArticleId(url)).toBe("CBMiW0FVX3lx");
    expect(googleNewsArticleId("https://news.google.com/articles/ABC")).toBe("ABC");
    expect(googleNewsArticleId("https://www.nikkei.com/")).toBeNull();
  });

  it("跳转页里的签名和时间戳；缺一个就当没拿到", () => {
    expect(parseSignature('<c-wiz data-n-a-sg="AbIaSL_x" data-n-a-ts="1791777321">')).toEqual({ signature: "AbIaSL_x", timestamp: "1791777321" });
    expect(parseSignature('<c-wiz data-n-a-sg="AbIaSL_x">')).toBeNull();
  });

  it("从返回里取原文地址；不是 http 链接、还是 Google 的都不算", () => {
    expect(parseDecodedUrl(')]}\'\n[["wrb.fr","Fbv4je","[\\"garturlres\\",\\"https://www.sanyonews.jp/article/2002369\\",1]"]]')).toBe("https://www.sanyonews.jp/article/2002369");
    expect(parseDecodedUrl('[\\"garturlres\\",\\"https://news.google.com/x\\"')).toBeNull();
    expect(parseDecodedUrl("error")).toBeNull();
  });
});
