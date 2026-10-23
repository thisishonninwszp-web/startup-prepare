import { describe, expect, it } from "vitest";
import {
  confidenceFor,
  displayQuestion,
  draftVerdict,
  dueJudgments,
  isBlindPracticeDate,
  isNodeBet,
  nodeBetQuestion,
  overrideReasoning,
  tallyEvidenceDisagreement,
  tallyJudgments,
  tallyModes,
  type JudgmentRow,
} from "./practice-shared";

const row = (over: Partial<JudgmentRow>): JudgmentRow => ({
  id: "j",
  signal_id: null,
  prediction_id: "p",
  news_title: "日银加息",
  news_url: null,
  question: "q",
  judgment: "广告预算会先被砍",
  feedback: null,
  created_at: "2026-10-01T00:00:00Z",
  tags: [],
  question_id: null,
  due_at: "2026-11-01T00:00:00Z",
  outcome: "pending",
  confidence: null,
  resolved_at: null,
  note: null,
  ...over,
});

describe("dueJudgments", () => {
  it("只要到期且没对账的，早到期的在前", () => {
    const now = new Date("2026-12-01T00:00:00Z").getTime();
    const rows = [
      row({ id: "late", due_at: "2026-11-20T00:00:00Z" }),
      row({ id: "early", due_at: "2026-11-02T00:00:00Z" }),
      row({ id: "future", due_at: "2027-01-01T00:00:00Z" }),
      row({ id: "done", due_at: "2026-11-01T00:00:00Z", outcome: "hit" }),
    ];
    expect(dueJudgments(rows, now).map((r) => r.id)).toEqual(["early", "late"]);
  });
});

describe("tallyJudgments", () => {
  it("只数次数", () => {
    const rows = [row({ outcome: "hit" }), row({ outcome: "miss" }), row({ outcome: "miss" }), row({})];
    expect(tallyJudgments(rows)).toEqual({ hit: 1, miss: 2, pending: 1 });
  });
});

describe("押推论（往下推的某一步）", () => {
  it("问题带前缀，和这条新闻本身的判断分得开；显示时换成人话", () => {
    const q = nodeBetQuestion("大银行三个月内上调房贷利率");
    expect(isNodeBet(q)).toBe(true);
    expect(isNodeBet("这件事接下来会怎样？")).toBe(false);
    expect(displayQuestion(q)).toBe("往下推的一步会不会发生：大银行三个月内上调房贷利率");
    expect(displayQuestion("三个月后定存利率会过 1.5% 吗？")).toBe("三个月后定存利率会过 1.5% 吗？");
  });
});

describe("tallyEvidenceDisagreement（自己判卷手松不松）", () => {
  const ev = (...stances: ("supports" | "contradicts" | "context")[]) => ({
    checked_at: "2026-11-01T00:00:00Z",
    evidence: stances.map((stance) => ({ url: "u", title: "t", fact: "f", excerpt: "e", stance })),
  });

  it("标了看对了、反对比支持多的，和标了看错了、支持比反对多的，各数一次；没对账、没证据的不算", () => {
    const rows = [
      row({ outcome: "hit", outcome_evidence: ev("contradicts", "contradicts", "supports") }),
      row({ outcome: "hit", outcome_evidence: ev("supports", "contradicts") }),
      row({ outcome: "miss", outcome_evidence: ev("supports", "context") }),
      row({ outcome: "miss", outcome_evidence: ev("contradicts") }),
      row({ outcome: "pending", outcome_evidence: ev("contradicts") }),
      row({ outcome: "hit", outcome_evidence: ev() }),
      row({ outcome: "hit" }),
    ];
    expect(tallyEvidenceDisagreement(rows)).toEqual({ checked: 4, hitButAgainst: 1, missButFor: 1 });
  });
});

describe("练习的 AI 先判", () => {
  it("把握按离五成多远分三档", () => {
    expect(confidenceFor(0.55)).toBe("low");
    expect(confidenceFor(0.3)).toBe("mid");
    expect(confidenceFor(0.1)).toBe("high");
  });

  it("那一句由代码拼：会 / 不会 + 题目；反过来就是改判预填的那句", () => {
    expect(draftVerdict(0.3, "日银会不会在 2027 年 3 月底前加息？")).toEqual({ will: false, sentence: "不会：日银会不会在 2027 年 3 月底前加息？", confidence: "mid" });
    expect(draftVerdict(0.3, "X？", true).sentence).toBe("会：X？");
    expect(draftVerdict(0.5, "X？").will).toBe(true);
  });

  it("周一的练习是先判题", () => {
    expect(isBlindPracticeDate("2026-10-26")).toBe(true);
    expect(isBlindPracticeDate("2026-10-27")).toBe(false);
  });

  it("按来路数，迁移前的算先判", () => {
    const t = tallyModes([
      { mode: "agree", outcome: "hit" },
      { mode: "override", outcome: "miss" },
      { mode: null, outcome: "pending" },
      { mode: undefined, outcome: "hit" },
    ]);
    expect(t.agree).toEqual({ n: 1, hit: 1, miss: 0 });
    expect(t.override).toEqual({ n: 1, hit: 0, miss: 1 });
    expect(t.blind).toEqual({ n: 2, hit: 1, miss: 0 });
  });

  it("改判时告诉挑刺 AI 原来判的哪边、为什么", () => {
    const r = overrideReasoning({ probability: 0.3, perspectives: [{ source: "ai_outside", probability: 0.3, reason: "这类事一般不发生" }], made_at: "" }, "X？");
    expect(r).toContain("AI 先判的是「不会」");
    expect(r).toContain("这类事一般不发生");
  });
});
