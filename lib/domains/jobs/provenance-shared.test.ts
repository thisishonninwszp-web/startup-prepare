import { describe, expect, it } from "vitest";
import { checkDraft, checkSentences, entrySourceText, latinTermsIn, numbersIn, quoteIn, unsupported } from "./provenance-shared";

describe("出处核对", () => {
  it("numbersIn：04 和 4 算一个，1,200 算 1200，全角也认", () => {
    expect(numbersIn("2026年04月から、1,200件を３割")).toEqual(["2026", "4", "1200", "3"]);
  });

  it("latinTermsIn：英文词小写、至少两个字符，句末的点去掉", () => {
    expect(latinTermsIn("GA4とTableau、Pythonを使用。Node.js.")).toEqual(["ga4", "tableau", "python", "node.js"]);
  });

  it("unsupported：数字或英文词在出处里找不到就给理由", () => {
    const source = "株式会社Focus\n2026-04〜\nGA4 看广告数据，每周给老板报 3 次";
    expect(unsupported("GA4を用いて週3回報告", source)).toBeNull();
    expect(unsupported("週5回報告", source)).toBe("数字「5」在底稿里找不到");
    expect(unsupported("Tableauで可視化", source)).toBe("「tableau」在底稿里找不到");
  });

  it("checkSentences：没出处、出处不在底稿、对不上的都删掉并写理由", () => {
    const entries = new Map([
      ["E1", "Focus\nGA4 看数据，每周报 3 次"],
      ["E2", "大阪大学 商学部 2026"],
    ]);
    const { kept, dropped } = checkSentences(
      [
        { text: "GA4で週3回報告。", entry_ids: ["E1"] },
        { text: "2026年卒業。", entry_ids: ["E2", "E9"] },
        { text: "売上を20%改善。", entry_ids: ["E1"] },
        { text: "責任感が強い。", entry_ids: [] },
        { text: "Pythonを習得。", entry_ids: ["E7"] },
        { text: "  ", entry_ids: ["E1"] },
        "not an object",
      ],
      entries
    );
    expect(kept).toEqual([
      { text: "GA4で週3回報告。", entry_ids: ["E1"] },
      { text: "2026年卒業。", entry_ids: ["E2"] },
    ]);
    expect(dropped.map((d) => d.reason)).toEqual(["数字「20」在底稿里找不到", "没标出处", "标的出处不在确认过的底稿里"]);
  });

  it("checkSentences：extra 里的词可以用（志望動機提到招聘页上的词），但仍要有出处", () => {
    const entries = new Map([["E1", "数据分析"]]);
    const { kept } = checkSentences([{ text: "貴社のSaaS事業に関心。", entry_ids: ["E1"] }], entries, "SaaS の事業企画");
    expect(kept).toHaveLength(1);
  });

  it("checkDraft：按句切开，原话里没有的数字所在的句子删掉", () => {
    const { text, dropped } = checkDraft("広告データを分析。週3回報告。CVRを15%改善。", "我分析广告数据，每周报 3 次");
    expect(text).toBe("広告データを分析。週3回報告。");
    expect(dropped).toEqual([{ text: "CVRを15%改善。", reason: "数字「15」在你的原话里找不到" }]);
  });

  it("quoteIn：去空白、全半角统一后逐字比；太短的不算", () => {
    const body = "応募資格\n・Excel の実務経験（1年以上）";
    expect(quoteIn("Excelの実務経験（1年以上）", body)).toBe(true);
    expect(quoteIn("Excelの実務経験（3年以上）", body)).toBe(false);
    expect(quoteIn("応募", body)).toBe(false);
  });

  it("entrySourceText：在哪、期间、原话、日文稿都算出处", () => {
    expect(entrySourceText({ org: "Focus", period: "2026-04", raw_text: "原话", draft_ja: null })).toBe("Focus\n2026-04\n原话\n");
  });
});
