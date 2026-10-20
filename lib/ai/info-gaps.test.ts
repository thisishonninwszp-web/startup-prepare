import { describe, expect, it } from "vitest";
import { parseInfoGaps } from "./info-gaps";

const input = {
  title: "在日华人家庭的家政代办",
  hypothesis: [{ label: "目标用户", text: "在东京的双职工华人家庭" }],
  exitCriteria: ["两个月内找不到 3 个愿意付钱的家庭"],
  validations: 0,
  founderFacts: "一个人做，每周能用 15 小时；中日双语；住在东京；没做过家政",
};

const gap = (over: Record<string, unknown> = {}) => ({
  question: "在日华人家庭里有没有人现在在花钱请人做家务",
  matters: "几乎没人在花钱就 Kill；有人在花就开假门",
  disconfirm: "问了十个家庭没有一个在花钱",
  routes: [
    { kind: "contact", how: "在东京华人妈妈群里问一句谁在请家政" },
    { kind: "trace", how: "看ココナラ上中文家政代行的成交数和价格" },
  ],
  days: 7,
  ...over,
});

describe("想法的信息缺口", () => {
  it("四样都写、去哪拿至少两条的才收；种类不认识的那条丢掉；天数夹在 3 到 30", () => {
    const out = parseInfoGaps(
      {
        gaps: [
          gap(),
          gap({ question: "第二个", days: 90, routes: [{ kind: "contact", how: "a" }, { kind: "magic", how: "b" }, { kind: "voices", how: "c" }] }),
          gap({ question: "去哪拿只有一条", routes: [{ kind: "contact", how: "a" }] }),
          gap({ disconfirm: "" }),
        ],
        fit: null,
      },
      input
    );
    expect(out.gaps.map((g) => g.question)).toEqual(["在日华人家庭里有没有人现在在花钱请人做家务", "第二个"]);
    expect(out.gaps[1].days).toBe(30);
    expect(out.gaps[1].routes.map((r) => r.kind)).toEqual(["contact", "voices"]);
  });

  it("「是不是你的机会」只认照抄他原话的；他没写约束优势就没有", () => {
    const out = parseInfoGaps(
      {
        gaps: [gap(), gap({ question: "二" })],
        fit: {
          uses: [
            { fact: "中日双语", how: "能直接和华人家庭、日本的家政公司两边说话" },
            { fact: "擅长沟通", how: "他没写过这句" },
          ],
          hits: [{ fact: "每周能用 15 小时", how: "上门服务要排班，时间不够" }],
        },
      },
      input
    );
    expect(out.fit?.uses.map((u) => u.fact)).toEqual(["中日双语"]);
    expect(out.fit?.hits.map((h) => h.fact)).toEqual(["每周能用 15 小时"]);
    const none = parseInfoGaps({ gaps: [gap(), gap({ question: "二" })], fit: { uses: [{ fact: "中日双语", how: "x" }], hits: [] } }, { ...input, founderFacts: "" });
    expect(none.fit).toBeNull();
  });

  it("不够两个缺口、写了可能性数字、写了空话：作废", () => {
    expect(() => parseInfoGaps({ gaps: [gap()] }, input)).toThrow();
    expect(() => parseInfoGaps({ gaps: [gap(), gap({ matters: "有 70% 的可能没人付钱" })] }, input)).toThrow();
    expect(() => parseInfoGaps({ gaps: [gap(), gap({ matters: "这个方向很有潜力" })] }, input)).toThrow();
  });
});
