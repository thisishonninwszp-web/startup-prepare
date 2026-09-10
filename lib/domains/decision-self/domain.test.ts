import { describe, expect, it } from "vitest";
import { parseTarget, parseSource, renderSelfContext, parseSelfChallenge, turnsForSelfContext, type SelfRecord } from "./domain";

const id = "11111111-1111-4111-8111-111111111111";
const record: SelfRecord = {
  type: "self_hypotheses", id, title: "在陌生客户面前会回避报价", date: "2026-09-01",
  text: "适用范围：第一次沟通\n已推翻：已经主动报价两次", href: `/self/records/self_hypotheses/${id}`,
};

describe("decision self context", () => {
  it("rejects unknown objects, declarations and malformed ids", () => {
    expect(() => parseTarget("self", id)).toThrow();
    expect(() => parseSource("self_declarations", id)).toThrow();
    expect(() => parseSource("self_deeds", "../other")).toThrow();
    expect(parseTarget("idea", id)).toEqual({ type: "idea", id });
  });
  it("includes the selected original record, date and refutation without inferring a personality", () => {
    const context = renderSelfContext([record]);
    expect(context).toContain(record.title);
    expect(context).toContain("已推翻");
    expect(context).toContain("2026-09-01");
    expect(context).toContain(record.href);
    expect(renderSelfContext([])).not.toContain(record.title);
  });
  it("rejects fabricated or missing citations", () => {
    const question = { question: "这两次报价的情境是否相同？", sourceIds: ["unknown"], wouldChange: "在同类客户面前再实际报价" };
    expect(() => parseSelfChallenge({ questions: [question] }, [record])).toThrow();
    expect(() => parseSelfChallenge({ questions: [{ ...question, sourceIds: [] }] }, [record])).toThrow();
    expect(parseSelfChallenge({ questions: [{ ...question, sourceIds: [`${record.type}:${id}`] }] }, [record]).questions).toHaveLength(1);
  });
  it("rejects suitability scoring and flattering answers", () => {
    for (const question of ["适合度评分 8 分", "你的想法很有潜力"]) {
      expect(() => parseSelfChallenge({ questions: [{ question, sourceIds: [`${record.type}:${id}`], wouldChange: "实际接触" }] }, [record])).toThrow();
    }
  });
  it("removes earlier context from the AI conversation when selection changes", () => {
    const turns = [
      { role: "user" as const, content: "开始" },
      { role: "assistant" as const, content: "已移除记录里的私密内容", selfContextKey: "old" },
      { role: "user" as const, content: "重新问" },
    ];
    expect(turnsForSelfContext(turns, "new")).toEqual([turns[2]]);
    expect(turnsForSelfContext(turns, "old")).toEqual(turns);
    expect(turns).toHaveLength(3);
  });
  it("rejects a fabricated URL hidden in a question even with valid structured citations", () => {
    expect(() => parseSelfChallenge({ questions: [{ question: "看 /self/records/self_deeds/unknown", sourceIds: [`${record.type}:${id}`], wouldChange: "实际接触" }] }, [record])).toThrow();
  });
});
