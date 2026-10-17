import { describe, expect, it } from "vitest";
import { parseThereFacts, parseThereQueries } from "./signals-deep";

const sources = [{ title: "美团无人机", url: "https://example.cn/a", content: "美团无人机已在深圳、上海等地开通 53 条航线，2021 年开始试运营。" }];
const excerpt = "美团无人机已在深圳、上海等地开通 53 条航线";

describe("那边查一查", () => {
  it("搜索词最多两个、去掉空的；一个都没有就重来", () => {
    expect(parseThereQueries({ queries: [" 美团 无人机 配送 规模 ", "", "美团 无人机 收费", "多余"] })).toEqual(["美团 无人机 配送 规模", "美团 无人机 收费"]);
    expect(() => parseThereQueries({ queries: [] })).toThrow();
  });

  it("对不上原文的丢掉，对得上的留下；一条都没有不算错", () => {
    const facts = parseThereFacts(
      {
        facts: [
          { source: 1, fact: "美团无人机开通了 53 条航线。", company: "美团", excerpt },
          { source: 1, fact: "美团无人机开通了 99 条航线。", company: "美团", excerpt: "美团无人机已在深圳、上海等地开通 99 条航线" },
        ],
      },
      sources
    );
    expect(facts.map((f) => f.text)).toEqual(["美团无人机开通了 53 条航线。"]);
    expect(parseThereFacts({ facts: [] }, sources)).toEqual([]);
  });

  it("夸的话、用日文写的不收（整次重来）", () => {
    expect(() => parseThereFacts({ facts: [{ source: 1, fact: "美团无人机很有潜力，开通了 53 条航线。", excerpt }] }, sources)).toThrow();
    expect(() => parseThereFacts({ facts: [{ source: 1, fact: "美団のドローンは53路線を開設しています。", excerpt }] }, sources)).toThrow();
  });
});
