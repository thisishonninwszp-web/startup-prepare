import { describe, expect, it } from "vitest";
import { checkThereFacts, mentionedNames, missingSteps, thereLanguage, validCategory, validDeepStance } from "./deep-shared";

const page = {
  title: "美团无人机配送",
  url: "https://example.cn/a",
  content: "美团无人机已在深圳、上海等地开通 53 条航线，2021 年开始试运营，累计完成订单超过 45 万单。每单收取配送费。",
};
const excerpt = "美团无人机已在深圳、上海等地开通 53 条航线，2021 年开始试运营，累计完成订单超过 45 万单";

describe("那边查一查：只收对得上原文的事实", () => {
  it("原文在页上、数字和公司名都在原文里的收下", () => {
    const facts = checkThereFacts([{ source: 1, fact: "美团无人机开通了 53 条航线，累计完成订单超过 45 万单。", company: "美团", excerpt }], [page]);
    expect(facts).toEqual([
      { text: "美团无人机开通了 53 条航线，累计完成订单超过 45 万单。", company: "美团", excerpt, url: page.url, title: page.title },
    ]);
  });

  it("原文不在页上、数字不在原文里、公司不在原文里、资料编号不对的都丢掉", () => {
    expect(checkThereFacts([{ source: 1, fact: "美团开通了 100 条航线。", excerpt: "美团无人机已开通 100 条航线" }], [page])).toEqual([]);
    expect(checkThereFacts([{ source: 1, fact: "美团无人机开通了 60 条航线。", excerpt }], [page])).toEqual([]);
    expect(checkThereFacts([{ source: 1, fact: "饿了么开通了 53 条航线。", company: "饿了么", excerpt }], [page])).toEqual([]);
    expect(checkThereFacts([{ source: 2, fact: "美团无人机开通了 53 条航线。", excerpt }], [page])).toEqual([]);
  });

  it("「这说明……」式的结论不收；全角数字也认", () => {
    expect(checkThereFacts([{ source: 1, fact: "这说明无人机配送前景广阔。", excerpt }], [page])).toEqual([]);
    expect(checkThereFacts([{ source: 1, fact: "美团无人机开通了 ５３ 条航线。", excerpt }], [page])).toHaveLength(1);
  });

  it("同一句原文只收一次，最多 6 条", () => {
    const content = Array.from({ length: 8 }, (_, i) => `第${i}句：美团在城市${i}开通了航线。`).join("");
    const many = Array.from({ length: 8 }, (_, i) => ({ source: 1, fact: `美团在城市${i}开通了航线。`, excerpt: `第${i}句：美团在城市${i}开通了航线` }));
    expect(checkThereFacts(many, [{ ...page, content }])).toHaveLength(6);
    expect(checkThereFacts([many[0], many[0]], [{ ...page, content }])).toHaveLength(1);
  });

  it("那边用什么语言搜", () => {
    expect([thereLanguage("japan"), thereLanguage("us"), thereLanguage("china")]).toEqual(["中文", "英文", "日文"]);
  });
});

describe("官报名单：名字原样出现在这条里才算", () => {
  it("两个字以下的名字不认", () => {
    expect(mentionedNames(["谭仔国际在日本开了新店"], ["谭仔", "蜜雪冰城", "a", " "])).toEqual(["谭仔"]);
  });
});

describe("浏览器传来的只认合法的", () => {
  it("类别", () => {
    expect(validCategory("food")).toBe("food");
    expect(validCategory("toString")).toBeNull();
    expect(validCategory(3)).toBeNull();
  });

  it("判断：第一问必点，补的那句去掉首尾空白、最多 200 字", () => {
    expect(validDeepStance({ will: "will", blocker: "law" }, " 先在离岛 ")).toEqual({ stance: { will: "will", blocker: "law" }, note: "先在离岛" });
    expect(validDeepStance({ blocker: "law" }, "")).toBeNull();
    expect(validDeepStance({ will: "wont" }, "长".repeat(201))).toBeNull();
  });

  it("「把缺的都查一遍」按顺序跑没查过的", () => {
    expect(missingSteps({ there: true, transfer: false, voices: false })).toEqual(["transfer", "voices"]);
    expect(missingSteps({ there: true, transfer: true, voices: true })).toEqual([]);
  });
});
