import { describe, expect, it } from "vitest";
import { authorKey, isLiteratureNdc, mainTitle, normalizeTitle } from "./books";
import { balanceBySource, isChinaSource, isGithubSource, kindSourceFilter, newsSourceLabel, RSS_FEEDS, rssSource, signalKindOf } from "./feeds";
import { contactPerson } from "./format";

describe("signalKindOf", () => {
  it("按前缀认出四类", () => {
    expect(signalKindOf("news:yahoo_it")).toBe("news");
    expect(signalKindOf("voice:hatena_it")).toBe("voices");
    expect(signalKindOf("plan:egov_comment")).toBe("calendar");
    expect(signalKindOf("github:new")).toBe("tools");
    expect(signalKindOf("able:gnews_dereg")).toBe("tools");
    expect(signalKindOf("money:gnews_funding")).toBe("money");
  });

  it("每个源都有不重复的 source 和标签", () => {
    const sources = RSS_FEEDS.map(rssSource);
    expect(new Set(sources).size).toBe(sources.length);
    for (const s of sources) expect(newsSourceLabel(s)).not.toBe(s);
  });
});

describe("balanceBySource", () => {
  it("各源轮流取，发稿多的源挤不掉发稿少的", () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => ({ source: "news:yahoo_domestic", id: `y${i}` })),
      { source: "news:tmtpost", id: "t0" },
      { source: "voice:tsr", id: "s0" },
    ];
    expect(balanceBySource(rows, 4).map((r) => r.id)).toEqual(["y0", "t0", "s0", "y1"]);
  });

  it("不够 max 就全给，不重复", () => {
    const rows = [
      { source: "a", id: "a0" },
      { source: "b", id: "b0" },
      { source: "a", id: "a1" },
    ];
    expect(balanceBySource(rows, 10).map((r) => r.id)).toEqual(["a0", "b0", "a1"]);
  });
});

describe("isChinaSource", () => {
  it("只认中文媒体", () => {
    expect(isChinaSource("news:tmtpost")).toBe(true);
    expect(isChinaSource("news:gnews_36kr")).toBe(true);
    expect(isChinaSource("news:yahoo_domestic")).toBe(false);
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

describe("一节可以收几个前缀", () => {
  it("新工具一节收 GitHub 和 able；RSS 的 tools 源落库用 able:", () => {
    expect(kindSourceFilter("tools")).toBe("source.like.github:%,source.like.able:%");
    expect(kindSourceFilter("money")).toBe("source.like.money:%");
    const able = RSS_FEEDS.find((f) => f.kind === "tools")!;
    expect(rssSource(able).startsWith("able:")).toBe(true);
    expect(isGithubSource("github:new")).toBe(true);
    expect(isGithubSource("able:gnews_dereg")).toBe(false);
  });
});
