import { describe, expect, it } from "vitest";
import { relevantExcerpt } from "./web-search";

describe("relevantExcerpt（整篇正文里挑和搜索词最相关的几段）", () => {
  const body = [
    "東京都内の天気は晴れ。週末は気温が上がる見込み。",
    "大手スーパー各社が30分で届けるネットスーパーを相次いで始めた。",
    "広告の後に続きます。関連記事もどうぞ。",
    "即配サービスは都心の若い世帯で利用が伸びている。",
  ].join("\n");

  it("出现搜索词多的段落优先，按原来的顺序拼回去", () => {
    expect(relevantExcerpt(body, "即配 ネットスーパー 30分", 60)).toBe(
      "大手スーパー各社が30分で届けるネットスーパーを相次いで始めた。\n即配サービスは都心の若い世帯で利用が伸びている。"
    );
  });

  it("一个搜索词都没出现就从开头取；不超过上限", () => {
    expect(relevantExcerpt(body, "Usage-based billing", 30)).toBe("東京都内の天気は晴れ。週末は気温が上がる見込み。");
    expect(relevantExcerpt(body, "Usage-based billing", 10)).toBe("東京都内の天気は晴れ");
    expect(relevantExcerpt("", "x y")).toBe("");
  });
});
