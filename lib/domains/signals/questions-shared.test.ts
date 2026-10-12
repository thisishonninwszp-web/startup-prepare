import { describe, expect, it } from "vitest";
import { normalizeTags, tallyByTag, displayQuestion, type JudgmentRow } from "./practice-shared";
import { articleOutline, flattenEvidence, questionBetQuestion, type SignalQuestion } from "./questions-shared";

const ev = (fact: string, stance: "supports" | "contradicts" | "context") => ({
  url: `https://example.jp/${fact.length}`,
  title: "来源",
  fact,
  excerpt: "原文原文原文原文",
  stance,
});

const question: SignalQuestion = {
  id: "q1",
  question: "中国哪些做法会在五年内来日本",
  criterion: "东京的普通人一年里至少用过一次",
  research: {
    subQuestions: [
      { question: "TikTok Shop 上线一年卖得怎样", evidence: [ev("TikTok Shop 2025 年 6 月在日本上线", "supports")] },
      { question: "以前做直播带货的公司为什么撤了", evidence: [ev("乐天曾经撤出直播带货", "contradicts")] },
    ],
    keyFactors: [{ factor: "日本人信不信主播", now: "还在观望", watch: "TikTok Shop 月成交过百亿日元", evidence: [1] }],
    history: null,
    basedOnView: "直播带货会来",
  },
  researched_at: "2026-10-12T00:00:00Z",
  created_at: "2026-10-12T00:00:00Z",
  views: [
    { id: "v2", view: "直播带货会来", reason: "TikTok 进来了", created_at: "2026-10-12T01:00:00Z" },
    { id: "v1", view: "都不会来", reason: "", created_at: "2026-10-11T01:00:00Z" },
  ],
};

describe("articleOutline", () => {
  it("搬运看法、正反证据、关键因素和改主意的条件；旧看法也留着", () => {
    const md = articleOutline(question);
    expect(md).toContain("# 中国哪些做法会在五年内来日本");
    expect(md).toContain("怎么才算：东京的普通人一年里至少用过一次");
    expect(md).toContain("直播带货会来");
    expect(md).toContain("之前我是这么看的：\n- 都不会来");
    expect(md).toContain("支持我的：\n- TikTok Shop 2025 年 6 月在日本上线");
    expect(md).toContain("反对我的：\n- 乐天曾经撤出直播带货");
    expect(md).toContain("- TikTok Shop 月成交过百亿日元");
  });

  it("还没写看法时提示先写一句", () => {
    expect(articleOutline({ ...question, views: [] })).toContain("还没写");
  });
});

describe("flattenEvidence", () => {
  it("按小问题顺序排成一列，关键因素的编号对着它", () => {
    expect(flattenEvidence(question.research!).map((e) => e.fact)).toEqual([
      "TikTok Shop 2025 年 6 月在日本上线",
      "乐天曾经撤出直播带货",
    ]);
  });
});

describe("标签", () => {
  it("空格逗号都能分，去掉 #、去重、最多 5 个", () => {
    expect(normalizeTags("#中国做法 日本经济，中国做法")).toEqual(["中国做法", "日本经济"]);
    expect(normalizeTags("a b c d e f g")).toHaveLength(5);
    expect(normalizeTags("")).toEqual([]);
  });

  it("按标签数次数，不算比率；写得多的排前面", () => {
    const row = (tags: string[], outcome: JudgmentRow["outcome"]) => ({ tags, outcome }) as JudgmentRow;
    expect(
      tallyByTag([row(["中国做法"], "hit"), row(["中国做法", "日本经济"], "miss"), row([], "hit")])
    ).toEqual([
      { tag: "中国做法", total: 2, hit: 1, miss: 1, pending: 0 },
      { tag: "日本经济", total: 1, hit: 0, miss: 1, pending: 0 },
    ]);
  });
});

describe("押自己的问题", () => {
  it("账本里显示成人话", () => {
    expect(displayQuestion(questionBetQuestion("中国哪些做法会来日本"))).toBe("我在追的问题：中国哪些做法会来日本");
  });
});
