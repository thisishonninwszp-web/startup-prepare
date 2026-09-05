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

import { parseSkillNominations } from "./self-model";

const okMilestones = [
  { name: "做过一次", test: "真的做成过一次，说得出是哪一次" },
  { name: "做得稳", test: "连续三次都做成了" },
  { name: "别人也行", test: "别人照你的做法也做成了" },
];

function skill(patch: Record<string, unknown> = {}) {
  return {
    key: "sourcing",
    name: "布阵",
    gloss: "判断一份资料该不该信",
    group: "info",
    main: "WIS",
    layer: "circuit",
    requires: ["trace", "skim"],
    milestones: okMilestones,
    because: "他的方向要判断材料",
    ...patch,
  };
}

describe("parseSkillNominations", () => {
  it("takes a well-formed nomination", () => {
    const [item] = parseSkillNominations({ skills: [skill()] });
    expect(item).toMatchObject({ key: "sourcing", name: "布阵", layer: "circuit" });
    expect(item.requires).toEqual(["trace", "skim"]);
  });

  it("refuses a name that is a phrase rather than a word", () => {
    expect(parseSkillNominations({ skills: [skill({ name: "主动沟通能力" })] })).toEqual(
      []
    );
  });

  it("refuses a skill that already exists, or one a hair away from it", () => {
    expect(parseSkillNominations({ skills: [skill({ key: "listening" })] })).toEqual(
      []
    );
    expect(parseSkillNominations({ skills: [skill({ name: "倾听" })] })).toEqual([]);
    // 「带人」离已有的「带教」只差一个字：同一门手艺不该占两格。
    expect(
      parseSkillNominations({
        skills: [skill({ name: "带人", group: "relate", main: "CHA" })],
      })
    ).toEqual([]);
    // 跨领域撞字是巧合，不拦。
    expect(
      parseSkillNominations({ skills: [skill({ name: "带钩", group: "make", main: "DEX" })] })
    ).toHaveLength(1);
  });

  it("refuses a test that only claims a capability", () => {
    expect(
      parseSkillNominations({
        skills: [
          skill({
            milestones: [
              { name: "看得出", test: "能识别出团队成员的成长需求" },
              ...okMilestones.slice(0, 2),
            ],
          }),
        ],
      })
    ).toEqual([]);
  });

  it("drops a prerequisite that does not exist, and one that sits higher", () => {
    const [item] = parseSkillNominations({
      skills: [skill({ requires: ["trace", "nosuchskill", "judgement"] })],
    });
    // judgement 是印记层，比 circuit 高 —— 收进来树就会出环。
    expect(item.requires).toEqual(["trace"]);
  });

  it("refuses a skill with no usable milestones — that is a shell you cannot light", () => {
    expect(
      parseSkillNominations({
        skills: [
          skill({
            milestones: [
              { name: "打基础", test: "熟悉这门手艺的常用做法" },
              ...okMilestones.slice(0, 2),
            ],
          }),
        ],
      })
    ).toEqual([]);
  });

  it("refuses an unknown layer, group or attribute", () => {
    expect(parseSkillNominations({ skills: [skill({ layer: "epic" })] })).toEqual([]);
    expect(parseSkillNominations({ skills: [skill({ group: "combat" })] })).toEqual([]);
    expect(parseSkillNominations({ skills: [skill({ main: "MAG" })] })).toEqual([]);
  });

  it("keeps one of a duplicated key and caps the batch", () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      skill({ key: `made${"abcdefgh"[index]}`, name: `阵${"甲乙丙丁戊己庚辛"[index]}` })
    );
    expect(parseSkillNominations({ skills: [...many, skill()] })).toHaveLength(5);
    expect(
      parseSkillNominations({ skills: [skill(), skill()] })
    ).toHaveLength(1);
  });
});

import { parseSketch } from "./self-model";

const behavior = {
  kind: "behavior",
  text: "没人要求的事，他也会做到底",
  evidence: "2026-09-03｜逆向：把已有的监测数据接到订单和 CVR 上",
};
const gain = {
  kind: "gain",
  text: "因此发现了七月广告数据被对调，推翻了自己的结论",
  evidence: "2026-09-03｜复盘：修正后原来支持的证据消失了",
};

describe("parseSketch", () => {
  it("takes three lines that each point at a record", () => {
    const lines = parseSketch({
      lines: [
        behavior,
        gain,
        { kind: "cost", text: "但那些事本来没人要", evidence: "四个自主项目 0 采纳" },
      ],
    });
    expect(lines.map((line) => line.kind)).toEqual(["behavior", "gain", "cost"]);
  });

  it("allows the third line to be an admitted gap, and only that one", () => {
    const gap = { kind: "gap", text: "还没有记录到它的另一面，时间太短", evidence: "" };
    expect(parseSketch({ lines: [behavior, gain, gap] })).toHaveLength(3);
    // 但前两句没有证据就是编的。
    expect(
      parseSketch({ lines: [{ ...behavior, evidence: "" }, gain, gap] })
    ).toEqual([]);
  });

  it("refuses a third line that is neither cost, limit nor gap", () => {
    expect(
      parseSketch({
        lines: [behavior, gain, { ...gain, kind: "gain" }],
      })
    ).toEqual([]);
  });

  it("refuses praise and type names", () => {
    expect(
      parseSketch({
        lines: [
          { ...behavior, text: "他很擅长做这件事" },
          gain,
          { kind: "gap", text: "还没有记录到另一面", evidence: "" },
        ],
      })
    ).toEqual([]);
    expect(
      parseSketch({
        lines: [
          { ...behavior, text: "典型的 INTP，喜欢想清楚再动" },
          gain,
          { kind: "gap", text: "还没有记录到另一面", evidence: "" },
        ],
      })
    ).toEqual([]);
  });

  it("refuses anything that is not exactly three lines, in order", () => {
    expect(parseSketch({ lines: [behavior, gain] })).toEqual([]);
    expect(parseSketch({ lines: [gain, behavior, { kind: "gap", text: "还没有记录到另一面", evidence: "" }] })).toEqual([]);
    expect(parseSketch(null)).toEqual([]);
  });
});

import { groundSketch } from "./self-model";

describe("groundSketch", () => {
  const material =
    "- 2026-09-03｜逆向：把已有的监测数据接到订单和 CVR 上\n" +
    "- 2026-09-03｜复盘：修正后原来支持的证据消失了\n" +
    "- 2026-08-20｜社长之旅｜没被采纳";
  const negatives = ["2026-08-20｜社长之旅｜没被采纳"];
  const base = [
    { kind: "behavior" as const, text: "没人要求的事他也做到底", evidence: "逆向：把已有的监测数据接到订单和 CVR 上" },
    { kind: "gain" as const, text: "因此推翻了自己的结论", evidence: "复盘：修正后原来支持的证据消失了" },
  ];

  it("keeps a cost that stands on a real negative record", () => {
    const out = groundSketch(
      [...base, { kind: "cost", text: "但那些事本来没人要", evidence: "社长之旅｜没被采纳" }],
      material,
      negatives
    );
    expect(out[2].kind).toBe("cost");
  });

  it("demotes a cost that quotes an unrelated line — that is a guess dressed as a record", () => {
    const out = groundSketch(
      [
        ...base,
        {
          kind: "cost",
          text: "这种做法会延长周期",
          evidence: "复盘：修正后原来支持的证据消失了",
        },
      ],
      material,
      negatives
    );
    expect(out[2].kind).toBe("gap");
    expect(out[2].text).toContain("还没有记录到");
    expect(out[2].evidence).toBe("");
  });

  it("throws the whole sketch away when a quote is not in the material at all", () => {
    expect(
      groundSketch(
        [
          { ...base[0], evidence: "他一向很拼" },
          base[1],
          { kind: "gap", text: "还没有记录到另一面", evidence: "" },
        ],
        material,
        negatives
      )
    ).toEqual([]);
  });

  it("leaves an honest gap alone", () => {
    const out = groundSketch(
      [...base, { kind: "gap", text: "还没有记录到另一面，时间太短", evidence: "" }],
      material,
      negatives
    );
    expect(out[2].text).toContain("时间太短");
  });
});
