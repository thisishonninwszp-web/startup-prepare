import { describe, expect, it } from "vitest";
import { parseBattleRecap, parseDemonTurn } from "./types";

const validTurn = {
  content: "我觉得这个市场肯定有需求，我身边好几个朋友都说想要这个东西。",
  fallacies: [
    { type: "polite_yes", quote: "我身边好几个朋友都说想要这个东西" },
  ],
  out_of_excuses: false,
};

describe("parseDemonTurn", () => {
  it("接受合法回合", () => {
    const turn = parseDemonTurn(validTurn);
    expect(turn.content).toContain("市场");
    expect(turn.fallacies[0].type).toBe("polite_yes");
    expect(turn.out_of_excuses).toBe(false);
  });

  it("out_of_excuses 缺失时默认为 false", () => {
    const turn = parseDemonTurn({ ...validTurn, out_of_excuses: undefined });
    expect(turn.out_of_excuses).toBe(false);
  });

  it("允许 fallacies 为空数组（词穷台词可以不带新谬误）", () => {
    const turn = parseDemonTurn({ ...validTurn, fallacies: [], out_of_excuses: true });
    expect(turn.fallacies).toEqual([]);
    expect(turn.out_of_excuses).toBe(true);
  });

  it("拒绝空 content", () => {
    expect(() => parseDemonTurn({ ...validTurn, content: " " })).toThrow();
  });

  it("拒绝分类学之外的谬误类型", () => {
    expect(() =>
      parseDemonTurn({
        ...validTurn,
        fallacies: [{ type: "not_a_type", quote: "我身边好几个朋友都说想要这个东西" }],
      })
    ).toThrow();
  });

  it("拒绝 quote 不是 content 逐字子串的谬误", () => {
    expect(() =>
      parseDemonTurn({
        ...validTurn,
        fallacies: [{ type: "polite_yes", quote: "content 里不存在的句子" }],
      })
    ).toThrow();
  });
});

describe("parseBattleRecap", () => {
  it("接受合法复盘并容忍空数组", () => {
    const recap = parseBattleRecap({
      caught: [
        {
          quote: "我身边好几个朋友都说想要这个东西",
          type: "polite_yes",
          matched_attack: "朋友说想要是客套，不是证据。",
        },
      ],
      missed: [
        {
          quote: "现在正是这个赛道的风口",
          type: "trend_surfing",
          how_it_fooled_you: "宏观趋势听起来像论据，其实和你的方案能不能成无关。",
        },
      ],
      bonus: [],
    });
    expect(recap.caught).toHaveLength(1);
    expect(recap.missed[0].type).toBe("trend_surfing");
    expect(recap.bonus).toEqual([]);
  });

  it("拒绝缺 missed 字段的输出", () => {
    expect(() => parseBattleRecap({ caught: [], bonus: [] })).toThrow();
  });

  it("拒绝 missed 里的未知谬误类型", () => {
    expect(() =>
      parseBattleRecap({
        caught: [],
        missed: [{ quote: "x", type: "nope", how_it_fooled_you: "y" }],
        bonus: [],
      })
    ).toThrow();
  });
});
