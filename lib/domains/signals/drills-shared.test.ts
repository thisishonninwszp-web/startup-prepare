import { describe, expect, it } from "vitest";
import { tallyDrills, type AnsweredDrill } from "./drills-shared";

const drill = (guess: boolean, answer: boolean, confidence: number | null): AnsweredDrill => ({
  id: "d",
  topic: null,
  setup: "s",
  question: "q",
  deadline: "2024-06-30",
  answer,
  what_happened: "w",
  why_similar: null,
  source_check: { status: "supported", basis: [] },
  guess,
  confidence,
  reasoning: null,
  answered_at: "2026-10-13T00:00:00Z",
});

describe("tallyDrills", () => {
  it("做了几道、对了几道，按把握分开数；没选把握的只算进总数", () => {
    const t = tallyDrills([drill(true, true, 90), drill(true, false, 90), drill(false, false, 55), drill(true, true, null)]);
    expect(t.total).toBe(4);
    expect(t.hit).toBe(3);
    expect(t.byConfidence).toEqual([
      { key: "low", label: "没什么把握", total: 1, hit: 1 },
      { key: "mid", label: "有点把握", total: 0, hit: 0 },
      { key: "high", label: "很有把握", total: 2, hit: 1 },
    ]);
  });
});
