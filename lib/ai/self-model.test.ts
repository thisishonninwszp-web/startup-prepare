import { describe, expect, it } from "vitest";
import { parseStages } from "./self-model";

function stage(tier: number, nodes: { name: string; test: string }[]) {
  return { tier, standard: "能独立做成一件事", nodes };
}

const good = [
  { name: "跑通环境", test: "从零搭起环境并跑出第一个结果" },
  { name: "读懂报错", test: "看到报错能定位到是哪一行" },
];

function full(override?: Record<number, unknown>) {
  return {
    stages: [1, 2, 3, 4].map(
      (tier) => override?.[tier] ?? stage(tier, good)
    ),
  };
}

describe("parseStages", () => {
  it("takes a complete four-tier decomposition", () => {
    const stages = parseStages(full());
    expect(stages).toHaveLength(4);
    expect(stages.map((item) => item.name)).toEqual([
      "入门",
      "基础",
      "精通",
      "专家",
    ]);
  });

  it("throws away a decomposition that is missing a tier", () => {
    expect(parseStages({ stages: [stage(1, good), stage(2, good)] })).toEqual(
      []
    );
  });

  it("drops a small skill whose test cannot be judged true or false", () => {
    const vague = [
      ...good,
      { name: "打好基础", test: "熟悉这门语言的常用写法" },
      { name: "有感觉", test: "对性能有意识" },
    ];
    const stages = parseStages(full({ 1: stage(1, vague) }));
    expect(stages[0].nodes.map((node) => node.name)).toEqual([
      "跑通环境",
      "读懂报错",
    ]);
  });

  it("refuses a tier that scores instead of describing", () => {
    const scored = [
      { name: "评估", test: "把自己的水平打到 80 分" },
      { name: "自评", test: "达到 60% 的正确率水平" },
    ];
    // 两条都被挡掉，这一级就少于两个小技能，整份作废。
    expect(parseStages(full({ 2: stage(2, scored) }))).toEqual([]);
  });

  it("caps a tier at four small skills", () => {
    const many = Array.from({ length: 7 }, (_, index) => ({
      name: `动作${"一二三四五六七"[index]}`,
      test: `第 ${index} 次真的做成了一件事`,
    }));
    expect(parseStages(full({ 3: stage(3, many) }))[2].nodes).toHaveLength(4);
  });

  it("returns nothing for junk", () => {
    expect(parseStages(null)).toEqual([]);
    expect(parseStages({ stages: "nope" })).toEqual([]);
  });
});
