import { describe, expect, it } from "vitest";
import { parseMonthlyDigest } from "./signals";

const weekOf = new Map([
  ["w1.t1", 0],
  ["w2.t1", 1],
  ["w3.t1", 2],
]);
const related = new Map([
  ["G1", "美国演员创立一个经济实惠的健身房品牌"],
  ["I1", "中国语家事代行"],
]);
const material = "第 1 周 第 2 周 第 3 周 融资 30 亿日元";

describe("月报解析", () => {
  it("keeps lines spanning two weeks, verifies related titles and next steps", () => {
    const out = parseMonthlyDigest(
      {
        summary: "低价健身房的消息从第 1 周一直走到第 3 周。这说明市场很大。",
        lines: [
          {
            title: "低价健身房在美国扩张",
            note: "第 1 周开了第一家，到第 3 周融资 30 亿日元。",
            threadIds: ["w1.t1", "w3.t1", "w9.t9"],
            related: [
              { id: "G1", title: "美国演员创立一个经济实惠的健身房品牌" },
              { id: "I1", title: "完全不同的标题" },
              { id: "G9", title: "不存在" },
            ],
            next: "door",
            why: "写上价格才看得出这边有没有人愿意付钱。",
          },
          { title: "只出现了一周", note: "第 2 周。", threadIds: ["w2.t1"], related: [], next: "judge", why: "x" },
        ],
      },
      weekOf,
      related,
      material
    );
    expect(out.summary).toBe("低价健身房的消息从第 1 周一直走到第 3 周。");
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0].threadIds).toEqual(["w1.t1", "w3.t1"]);
    expect(out.lines[0].related).toEqual(["G1"]);
    expect(out.lines[0].next).toBe("door");
  });

  it("without related items only judge or issue is allowed", () => {
    const out = parseMonthlyDigest(
      {
        summary: "这个月主要是两件事。",
        lines: [{ title: "某事", note: "第 1 周到第 2 周都有。", threadIds: ["w1.t1", "w2.t1"], related: [], next: "door", why: "开假门。" }],
      },
      weekOf,
      related,
      material
    );
    expect(out.lines[0].next).toBeNull();
    expect(out.lines[0].why).toBe("");
  });

  it("rejects numbers over ten that are not in the weekly reports, and talk about the user", () => {
    expect(() => parseMonthlyDigest({ summary: "融资 500 亿日元。", lines: [] }, weekOf, related, material)).toThrow();
    expect(() => parseMonthlyDigest({ summary: "跟你的工作有关。", lines: [] }, weekOf, related, material)).toThrow();
  });
});
