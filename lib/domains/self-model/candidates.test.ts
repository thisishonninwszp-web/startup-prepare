import { describe, expect, it } from "vitest";
import {
  fromCommitment,
  fromDecision,
  fromValidation,
  pendingCandidates,
  type Candidate,
} from "./candidates";

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    source: "validation",
    sourceId: "v1",
    occurredOn: "2026-09-01",
    text: "接触了一个人",
    contextKey: "和人接触",
    ...over,
  };
}

describe("候选从哪来", () => {
  it("一次接触写成一句能读的话，不是三个字段", () => {
    const out = fromValidation({
      id: "v1",
      idea_title: "给小店做排班",
      has_pain: "yes",
      will_pay: "no",
      note: "老板说现在用微信群就够了",
      contacted_at: "2026-09-03T10:00:00Z",
    });
    expect(out.text).toContain("给小店做排班");
    expect(out.text).toContain("痛有");
    expect(out.text).toContain("付钱没有");
    expect(out.text).toContain("微信群");
    expect(out.occurredOn).toBe("2026-09-03");
  });

  it("决定写成推进还是结束", () => {
    expect(
      fromDecision({
        id: "d1",
        idea_title: "X",
        verdict: "kill",
        reason: null,
        decided_at: "2026-09-02T00:00:00Z",
      }).text
    ).toContain("结束");
  });

  it("没到期也没完成的承诺不问 —— 结果还悬着", () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);
    expect(
      fromCommitment({
        id: "c1",
        text: "这周约两个人",
        due_at: future.toISOString(),
        completed_at: null,
        created_at: "2026-09-01T00:00:00Z",
      })
    ).toBeNull();
  });

  it("到期没完成的承诺要问，而且写明没标完成", () => {
    const out = fromCommitment({
      id: "c1",
      text: "这周约两个人",
      due_at: "2026-08-20T00:00:00Z",
      completed_at: null,
      created_at: "2026-08-13T00:00:00Z",
    });
    expect(out?.text).toContain("没标完成");
    expect(out?.occurredOn).toBe("2026-08-20");
  });
});

describe("减掉回答过的", () => {
  it("已经成了窗口的不再问", () => {
    const out = pendingCandidates(
      [candidate({ sourceId: "v1" }), candidate({ sourceId: "v2" })],
      [{ type: "validation", id: "v1" }],
      []
    );
    expect(out.map((item) => item.sourceId)).toEqual(["v2"]);
  });

  it("标了不算的也不再问", () => {
    const out = pendingCandidates(
      [candidate({ sourceId: "v1" })],
      [],
      [{ type: "validation", id: "v1" }]
    );
    expect(out).toHaveLength(0);
  });

  it("同一个 id 不同来源不会互相误伤", () => {
    const out = pendingCandidates(
      [candidate({ source: "decision", sourceId: "same" })],
      [{ type: "validation", id: "same" }],
      []
    );
    expect(out).toHaveLength(1);
  });

  it("最近的先问", () => {
    const out = pendingCandidates(
      [
        candidate({ sourceId: "old", occurredOn: "2026-08-01" }),
        candidate({ sourceId: "new", occurredOn: "2026-09-05" }),
      ],
      [],
      []
    );
    expect(out[0].sourceId).toBe("new");
  });
});
