import { describe, expect, it } from "vitest";
import { hiringFocus, hiringQueries, isDiagnosis, looksJapanese, parseHiring, roleKeyword, stripRefs, type HiringContext } from "./hiring-shared";
import { matchCounts, requiredAnyOf } from "./shared";
import { parseTailored } from "@/lib/ai/jobs";

const posting = "■ 対象となる方 下記いずれかのご経験をお持ちの方 ・顧客または自組織における課題整理や施策立案の経験 ・提案書や企画書の作成およびプレゼンテーションの経験";
const sources = new Map([
  ["S0", posting],
  ["S1", "中長期経営ビジョン2035\n個別開発からオファリングビジネスへ転換し、従来型ITサービスの比率を2035年度に20%まで下げる。"],
  ["S2", "コンサル人材を2025年度までにグループ全体で1万人に拡充する。"],
]);

describe("招聘页写着「いずれか」：必须条件满足一条就够", () => {
  it("认得出几种写法，普通的必须条件不算", () => {
    expect(requiredAnyOf(posting)).toBe(true);
    expect(requiredAnyOf("以下のいずれかに該当する方")).toBe(true);
    expect(requiredAnyOf("次のいずれか1つ以上の経験")).toBe(true);
    expect(requiredAnyOf("【必須】経営企画の経験3年以上")).toBe(false);
  });

  it("matchCounts 带上 anyOf，数法不变", () => {
    const conditions = [
      { text: "a", quote: "a", required: true },
      { text: "b", quote: "b", required: true },
    ];
    const c = matchCounts(conditions, { entry_ids: [["e1"], []], blocker: { index: 0, text: "x" } }, true);
    expect(c.anyOf).toBe(true);
    expect(c.required).toEqual({ have: 1, missing: 1 });
  });
});

describe("这家为什么现在招：核对 AI 的输出", () => {
  const good = {
    facts: [
      { key: "F1", source: "S1", quote: "個別開発からオファリングビジネスへ転換し", point: "要从按客户要求开发转向标准化服务" },
      { key: "F2", source: "S2", quote: "コンサル人材を2025年度までにグループ全体で1万人に拡充する", point: "在大量扩招咨询人员" },
      { key: "F3", source: "S1", quote: "这句网页上没有", point: "编的" },
    ],
    needs: [
      {
        need: "可能在大量扩招，条件放得宽，要能把客户问题讲清楚的人",
        facts: ["F1", "F2"],
        posting_quote: "顧客または自組織における課題整理や施策立案の経験",
        show: "把课题整理、向社长提方案的经历放第一条",
        ask: "今回の募集は、オファリングの提案段階を担う位置づけでしょうか。",
      },
      { need: "引了编出来的那件", facts: ["F3"], posting_quote: "", show: "x", ask: "これは？" },
      { need: "需要 300 人规模的团队经验", facts: ["F2"], posting_quote: "", show: "强调带过 300 人", ask: "何人規模ですか？" },
    ],
  };

  it("原话对不上的事丢掉，编号按留下来的重排", () => {
    const r = parseHiring(good, sources, posting);
    expect(r.facts.map((f) => f.key)).toEqual(["F1", "F2"]);
    expect(r.needs[0].facts).toEqual(["F1", "F2"]);
  });

  it("只引了编出来的事、数字在依据里找不到的推测都丢掉", () => {
    const r = parseHiring(good, sources, posting);
    expect(r.needs).toHaveLength(1);
    expect(r.needs[0].posting_quote).toBe("顧客または自組織における課題整理や施策立案の経験");
  });

  it("招聘页原话对不上的整条丢掉；验证问题不是日文、或者在替对方诊断，就不给", () => {
    const r = parseHiring(
      {
        facts: [good.facts[0]],
        needs: [
          { need: "要懂业务的人", facts: ["F1"], posting_quote: "顧客または自組織における課題整理", show: "放前面", ask: "Why now?" },
          { need: "要能提案的人", facts: ["F1"], posting_quote: "提案書や企画書の作成", show: "放前面", ask: "御社の課題は人材不足でしょうか？" },
          { need: "要会写的人", facts: ["F1"], posting_quote: "招聘页上没有这句", show: "放前面", ask: "どうですか？" },
        ],
      },
      sources,
      posting
    );
    expect(r.needs).toHaveLength(2);
    expect(r.needs[0].ask).toBe("");
    expect(r.needs[1].ask).toBe("");
  });

  it("问题里编传闻（伺いました）、太长的不给；夹着的编号删掉", () => {
    const r = parseHiring(
      {
        facts: [good.facts[0]],
        needs: [
          { need: "要懂业务的人", facts: ["F1"], posting_quote: "顧客または自組織における課題整理", show: "放前面", ask: "大手顧客からの相談が多いと伺いました。どう支援されていますか。" },
          { need: "要能提案的人", facts: ["F1"], posting_quote: "提案書や企画書の作成", show: "放前面", ask: "S1のコラムを拝見しました。提案の段階はどなたが担いますか。" },
        ],
      },
      sources,
      posting
    );
    expect(r.needs[0].ask).toBe("");
    expect(r.needs[1].ask).toBe("を拝見しました。提案の段階はどなたが担いますか。");
  });

  it("一条有依据的推测都没有就报错（让上游重写）", () => {
    expect(() => parseHiring({ facts: [], needs: [{ need: "x", facts: ["F1"], show: "y", ask: "" }] }, sources, posting)).toThrow();
  });

  it("搜索词由代码拼，去掉株式会社，按职位名加一个扩招的", () => {
    expect(hiringQueries("富士通株式会社", 2026, "ITコンサルタント／システムコンサルタント（業務系）")).toEqual([
      "富士通 中期経営計画",
      "富士通 プレスリリース 2026",
      "富士通 新規事業 組織 新設 2026",
      "富士通 ITコンサルタント 採用 強化",
    ]);
    expect(roleKeyword("【経営戦略コンサルタント】大企業の顧客が中心/日本初の経営コンサルティング")).toBe("経営戦略コンサルタント");
    expect(roleKeyword("【リモート可】Webマーケター（BtoB）")).toBe("Webマーケター");
  });

  it("正文里夹的编号删掉；日文写的推测丢掉", () => {
    expect(stripRefs("可能在扩招（F1, F3）所以要人(S6)")).toBe("可能在扩招所以要人");
    expect(looksJapanese("新規事業の経験を冒頭に置き、具体的に記述する。")).toBe(true);
    expect(looksJapanese("把课题整理的经历放第一条，提到 SAP 也行")).toBe(false);
  });

  it("招聘页上对不上一句原话的推测丢掉（只是在讲公司，不是在讲这个岗位）", () => {
    expect(() =>
      parseHiring(
        { facts: [good.facts[0]], needs: [{ need: "需要懂业务的人", facts: ["F1"], posting_quote: "", show: "放前面", ask: "" }] },
        sources,
        posting
      )
    ).toThrow();
  });
});

describe("改简历时用上他认同的那条", () => {
  const ctx: HiringContext = {
    posting_id: "p",
    queries: [],
    sources: [],
    facts: [{ key: "F1", source: "S1", quote: "中長期経営ビジョン2035で個別開発からオファリングへ", point: "x" }],
    needs: [{ need: "要能提案的人", facts: ["F1"], posting_quote: "提案書や企画書の作成", show: "x", ask: "" }],
    picked: null,
    updated_at: "2026-10-18T00:00:00Z",
  };

  it("没认同就是 null；认同了给推测和依据原话", () => {
    expect(hiringFocus(ctx)).toBeNull();
    expect(hiringFocus({ ...ctx, picked: 0 })).toEqual({ need: "要能提案的人", quotes: ["中長期経営ビジョン2035で個別開発からオファリングへ", "提案書や企画書の作成"] });
  });

  it("志望動機可以引依据里的名称和数字；替对方诊断的句子丢掉", () => {
    const entries = new Map([["E1", "社長に指名検索広告を約50%削減する案を出した。"]]);
    const r = parseTailored(
      {
        summary: [{ text: "社長に広告削減案を出しました。", entry_ids: ["E1"] }],
        history: [],
        skills: [],
        pr: [],
        motivation: [
          { text: "中長期経営ビジョン2035を拝見し、社長に約50%削減の案を出した経験を生かしたいと考えました。", entry_ids: ["E1"] },
          { text: "御社の課題は提案力だと考えます。", entry_ids: ["E1"] },
        ],
        probes: [],
      },
      entries,
      "",
      "中長期経営ビジョン2035で個別開発からオファリングへ"
    );
    expect(r.sections.motivation.sentences.map((s) => s.text)).toEqual([
      "中長期経営ビジョン2035を拝見し、社長に約50%削減の案を出した経験を生かしたいと考えました。",
    ]);
    expect(r.dropped.some((d) => d.reason.includes("诊断"))).toBe(true);
    expect(isDiagnosis("貴社の課題を解決")).toBe(true);
  });
});
