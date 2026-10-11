import { describe, expect, it } from "vitest";
import { dueJudgments, tallyJudgments, type JudgmentRow } from "./practice-shared";

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
