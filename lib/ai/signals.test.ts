import { describe, expect, it } from "vitest";
import { parseBrief, parseNewsAnalysis } from "./signals";

const ok = {
  background: "日银多年维持零利率，最近物价持续上涨，开始一步步加息。",
  chain: "日银加息 → 银行贷款利率上调 → 靠借款周转的中小企业利息变重",
  forYou: "跟你关系不大。它更影响中小企业的财务。",
  who: "在中小制造业做财务的人",
  question: "这次加息之后，你们找银行续贷的时候，条件变了吗？",
};

describe("parseNewsAnalysis", () => {
  it("五段齐全就原样给出（去掉首尾空白）", () => {
    expect(parseNewsAnalysis({ ...ok, who: `  ${ok.who}  ` })).toEqual(ok);
  });

  it("缺任何一段、或者不是对象，都不收", () => {
    expect(() => parseNewsAnalysis({ ...ok, question: "" })).toThrow("question");
    expect(() => parseNewsAnalysis({ ...ok, background: undefined })).toThrow("background");
    expect(() => parseNewsAnalysis("文本")).toThrow();
  });

  it("出现迎合或投资建议的话就作废", () => {
    expect(() => parseNewsAnalysis({ ...ok, forYou: "这个方向很有潜力" })).toThrow("很有潜力");
    expect(() => parseNewsAnalysis({ ...ok, chain: "利率上调 → 可以考虑买入银行股" })).toThrow("买入");
  });
});

describe("parseBrief", () => {
  const pick = (index: unknown) => ({ index, headline: "h", background: "b", forYou: "f" });

  it("序号越界、重复、不是整数的丢掉，其余保留", () => {
    const picks = parseBrief({ picks: [pick(0), pick(0), pick(9), pick("2"), pick(1.5)] }, 3);
    expect(picks.map((p) => p.index)).toEqual([0, 2]);
  });

  it("一条都对不上、或者没有 picks，就不收", () => {
    expect(() => parseBrief({ picks: [pick(5)] }, 3)).toThrow();
    expect(() => parseBrief({}, 3)).toThrow("picks");
  });

  it("最多 5 条；出现投资建议就作废", () => {
    const many = Array.from({ length: 8 }, (_, i) => pick(i));
    expect(parseBrief({ picks: many }, 8)).toHaveLength(5);
    expect(() =>
      parseBrief({ picks: [{ ...pick(0), forYou: "可以抄底" }] }, 3)
    ).toThrow("抄底");
  });
});
