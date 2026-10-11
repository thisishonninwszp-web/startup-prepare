import { describe, expect, it } from "vitest";
import { authorKey, isLiteratureNdc, mainTitle, normalizeTitle } from "./books";
import { newsSourceLabel, RSS_FEEDS, rssSource, signalKindOf } from "./feeds";
import { contactPerson } from "./format";

describe("signalKindOf", () => {
  it("按前缀认出四类", () => {
    expect(signalKindOf("news:yahoo_it")).toBe("news");
    expect(signalKindOf("voice:hatena_it")).toBe("voices");
    expect(signalKindOf("plan:egov_comment")).toBe("calendar");
    expect(signalKindOf("github:new")).toBe("tools");
  });

  it("每个源都有不重复的 source 和标签", () => {
    const sources = RSS_FEEDS.map(rssSource);
    expect(new Set(sources).size).toBe(sources.length);
    for (const s of sources) expect(newsSourceLabel(s)).not.toBe(s);
  });
});

describe("authorKey", () => {
  it("英文取姓，日文取前两个字", () => {
    expect(authorKey("Philip E. Tetlock")).toBe("Tetlock");
    expect(authorKey("Philip E. Tetlock, Dan Gardner")).toBe("Tetlock");
    expect(authorKey("戸部 良一")).toBe("戸部");
  });
});

describe("isLiteratureNdc", () => {
  it("9 开头是文学（小说），其余不是", () => {
    expect(isLiteratureNdc("913.6")).toBe(true);
    expect(isLiteratureNdc("391.2")).toBe(false);
    expect(isLiteratureNdc("338.3")).toBe(false);
  });
});

describe("书名处理", () => {
  it("主书名去掉副标题；比较时忽略大小写、空格和标点", () => {
    expect(mainTitle("The Great Demographic Reversal: Ageing Societies")).toBe("The Great Demographic Reversal");
    expect(mainTitle("失敗の本質：日本軍の組織論的研究")).toBe("失敗の本質");
    expect(normalizeTitle("1587, a Year of No Significance")).toBe(normalizeTitle("1587 A Year of No Significance"));
  });
});

describe("contactPerson", () => {
  it("只留找谁那一段", () => {
    expect(contactPerson("可以找物流公司负责招聘或运营的高管聊聊，了解他们如何应对人手短缺。")).toBe("物流公司负责招聘或运营的高管");
    expect(contactPerson("你可以和在中小制造业做财务的人聊")).toBe("在中小制造业做财务的人");
    expect(contactPerson("在中小制造业做财务的人")).toBe("在中小制造业做财务的人");
  });
});
