import { describe, expect, it } from "vitest";
import {
  pickBalanced,
  tallyAnswerBalance,
  tallyDrillMissReasons,
  tallyDrills,
  tallyReasonJudge,
  tallyReasons,
  type AnsweredDrill,
} from "./drills-shared";

const drill = (guess: boolean, answer: boolean, confidence: number | null): AnsweredDrill => ({
  id: "d",
  topic: null,
  setup: "s",
  question: "q",
  criterion: null,
  deadline: "2024-06-30",
  answer,
  what_happened: "w",
  why_similar: null,
  source_check: { status: "supported", basis: [] },
  guess,
  confidence,
  reasoning: null,
  answered_at: "2026-10-13T00:00:00Z",
  decided_by: null,
  decided_basis: null,
  reason_match: null,
  topic_signal_id: null,
  topic_question_id: null,
  today_question: null,
  reason_judge: null,
  miss_reason: null,
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

describe("会和不会别偏一边", () => {
  it("tallyAnswerBalance：答案和他选的各几次", () => {
    expect(tallyAnswerBalance([drill(true, true, null), drill(true, false, null), drill(false, false, null)])).toEqual({
      answerYes: 1,
      answerNo: 2,
      guessYes: 2,
      guessNo: 1,
    });
  });

  it("pickBalanced：最近答案偏向会，就从答案是不会的题里挑；不偏就随便挑；没有另一边的就照常挑", () => {
    const pool = [
      { id: "y1", answer: true },
      { id: "n1", answer: false },
      { id: "y2", answer: true },
    ];
    expect(pickBalanced(pool, [true, true, true, false], () => 0.99)?.id).toBe("n1");
    expect(pickBalanced(pool, [false, false], () => 0.99)?.id).toBe("y2");
    expect(pickBalanced(pool, [true, false], () => 0)?.id).toBe("y1");
    expect(pickBalanced([{ id: "y1", answer: true }], [true, true, true], () => 0)?.id).toBe("y1");
    expect(pickBalanced([], [true])).toBeNull();
  });
});

describe("tallyReasons（结论和理由放一起数）", () => {
  it("只数标过的；猜对理由没对上的算运气", () => {
    const mark = (guess: boolean, answer: boolean, reason_match: boolean | null) => ({ ...drill(guess, answer, null), reason_match });
    expect(
      tallyReasons([mark(true, true, true), mark(true, true, false), mark(false, true, true), mark(false, true, false), mark(true, true, null)])
    ).toEqual({ bothRight: 1, luckyRight: 1, unluckyWrong: 1, bothWrong: 1 });
  });
});

describe("裁判和你标的不一样的次数", () => {
  it("只数两边都判过的", () => {
    const d = (reason_match: boolean | null, reason_judge: boolean | null) => ({ ...drill(true, true, null), reason_match, reason_judge });
    expect(tallyReasonJudge([d(true, false), d(true, true), d(false, true), d(true, null), d(null, false)])).toEqual({
      judged: 3,
      selfYesJudgeNo: 1,
      selfNoJudgeYes: 1,
    });
  });
});

describe("历史题猜错的原因", () => {
  it("只数猜错的；猜对了却选了原因的不算", () => {
    const d = (guess: boolean, miss_reason: AnsweredDrill["miss_reason"]) => ({ ...drill(guess, true, null), miss_reason });
    expect(tallyDrillMissReasons([d(false, "info"), d(false, "info"), d(false, "timing"), d(true, "luck"), d(false, null)])).toEqual({
      info: 2,
      reasoning: 0,
      timing: 1,
      emotion: 0,
      luck: 0,
    });
  });
});
