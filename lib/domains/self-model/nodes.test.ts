import { describe, expect, it } from "vitest";
import {
  ALL_NODES,
  NODE_TOTAL,
  buildSkillTree,
  canUnlock,
  nodeKey,
  stageCleared,
  startedSkills,
} from "./nodes";
import { SKILL_DEFS, SKILL_STAGES } from "./skills";

function unlocked(...keys: string[]) {
  return new Map(
    keys.map((key) => [key, { proof: "做过", unlockedOn: "2026-08-01" }])
  );
}

/** listening 第一级的全部小技能。 */
const LISTEN_1 = SKILL_STAGES.listening[0].nodes.map((_, index) =>
  nodeKey("listening", 1, index)
);
const LISTEN_2 = SKILL_STAGES.listening[1].nodes.map((_, index) =>
  nodeKey("listening", 2, index)
);

describe("node catalogue", () => {
  it("keeps every node key unique", () => {
    expect(new Set(ALL_NODES.map((node) => node.key)).size).toBe(NODE_TOTAL);
  });

  it("gives an authored skill four tiers of small skills", () => {
    const nodes = ALL_NODES.filter((node) => node.skillKey === "listening");
    expect(new Set(nodes.map((node) => node.tier))).toEqual(
      new Set([1, 2, 3, 4])
    );
    expect(nodes.length).toBeGreaterThan(4);
  });

  it("falls back to three nodes for a skill nobody has broken down yet", () => {
    const rough = SKILL_DEFS.find((def) => !SKILL_STAGES[def.key])!;
    const nodes = ALL_NODES.filter((node) => node.skillKey === rough.key);
    expect(nodes.length).toBe(3);
  });

  it("carries the checkable test onto every node", () => {
    for (const node of ALL_NODES) {
      expect(node.test.length, node.key).toBeGreaterThan(4);
    }
  });
});

describe("buildSkillTree", () => {
  it("opens the whole first tier and shuts the second", () => {
    const tree = buildSkillTree(unlocked());
    const listening = tree.find((entry) => entry.def.key === "listening")!;
    expect(listening.stages[0].nodes.every((item) => item.available)).toBe(true);
    expect(listening.stages[1].open).toBe(false);
    expect(listening.stages[1].blockedBy).toContain("点齐");
  });

  it("keeps an advanced skill shut until its foundation is complete", () => {
    const tree = buildSkillTree(unlocked());
    const asking = tree.find((entry) => entry.def.key === "asking")!;
    expect(asking.stages[0].open).toBe(false);
    expect(asking.stages[0].blockedBy).toContain("听风");
  });

  it("needs the whole foundation tier, not just one node, to open the next", () => {
    const partial = buildSkillTree(unlocked(LISTEN_1[0]));
    expect(
      partial.find((entry) => entry.def.key === "asking")!.stages[0].open
    ).toBe(false);

    const full = buildSkillTree(unlocked(...LISTEN_1));
    expect(
      full.find((entry) => entry.def.key === "asking")!.stages[0].open
    ).toBe(true);
  });

  it("walks a skill one tier at a time", () => {
    const tree = buildSkillTree(unlocked(...LISTEN_1, ...LISTEN_2));
    const listening = tree.find((entry) => entry.def.key === "listening")!;
    expect(listening.reached).toBe(2);
    expect(listening.next?.node.tier).toBe(3);
  });

  it("carries the proof back so the claim stays checkable", () => {
    const tree = buildSkillTree(
      new Map([
        [
          LISTEN_1[0],
          { proof: "上周三整场没打断对方", unlockedOn: "2026-08-20" },
        ],
      ])
    );
    const first = tree.find((entry) => entry.def.key === "listening")!.stages[0]
      .nodes[0];
    expect(first.proof).toContain("上周三");
    expect(first.unlockedOn).toBe("2026-08-20");
  });

  it("marks a skill that has not been broken down", () => {
    const tree = buildSkillTree(unlocked());
    expect(tree.find((entry) => entry.def.key === "listening")!.rough).toBe(
      false
    );
    const rough = SKILL_DEFS.find((def) => !SKILL_STAGES[def.key])!;
    expect(tree.find((entry) => entry.def.key === rough.key)!.rough).toBe(true);
  });
});

describe("stageCleared", () => {
  it("wants every small skill in the tier", () => {
    expect(stageCleared("listening", 1, new Set([LISTEN_1[0]]))).toBe(false);
    expect(stageCleared("listening", 1, new Set(LISTEN_1))).toBe(true);
  });
});

describe("canUnlock", () => {
  it("refuses an unknown node", () => {
    expect(canUnlock("nope:1:0", new Set()).ok).toBe(false);
  });

  it("refuses one that is already lit", () => {
    const result = canUnlock(LISTEN_1[0], new Set([LISTEN_1[0]]));
    expect(result).toMatchObject({ ok: false, reason: "已经点亮了" });
  });

  it("refuses skipping a tier", () => {
    expect(canUnlock(LISTEN_2[0], new Set()).reason).toContain("点齐");
  });

  it("refuses an advanced skill with no foundation, and names what is missing", () => {
    const result = canUnlock(nodeKey("asking", 1, 0), new Set());
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("听风");
  });

  it("allows it once the path is clear", () => {
    expect(canUnlock(LISTEN_1[0], new Set()).ok).toBe(true);
    expect(canUnlock(nodeKey("asking", 1, 0), new Set(LISTEN_1)).ok).toBe(true);
  });
});

describe("startedSkills", () => {
  it("counts a skill as started once its first tier is complete", () => {
    expect(startedSkills(new Set())).toBe(0);
    expect(startedSkills(new Set([LISTEN_1[0]]))).toBe(0);
    expect(startedSkills(new Set(LISTEN_1))).toBe(1);
  });
});

describe("stage overrides", () => {
  const custom = new Map([
    [
      "finance",
      [1, 2, 3, 4].map((tier) => ({
        tier,
        name: ["入门", "基础", "精通", "专家"][tier - 1],
        standard: `第 ${tier} 级的标准`,
        nodes: [
          { id: `n${tier}1`, name: `动作${tier}A`, test: "做成过一次" },
          { id: `n${tier}2`, name: `动作${tier}B`, test: "做成过一次" },
        ],
      })),
    ],
  ]);

  it("replaces the built-in decomposition for that skill only", () => {
    const tree = buildSkillTree(unlocked(), custom);
    const finance = tree.find((entry) => entry.def.key === "finance")!;
    expect(finance.total).toBe(8);
    expect(finance.rough).toBe(false);
    expect(finance.stages[0].nodes[0].node.name).toBe("动作1A");

    const listening = tree.find((entry) => entry.def.key === "listening")!;
    expect(listening.stages[0].nodes[0].node.name).toBe(
      SKILL_STAGES.listening[0].nodes[0].name
    );
  });

  it("keys a custom node by its stable id, not its position", () => {
    expect(nodeKey("finance", 2, "n21")).toBe("finance:2:n21");
    expect(canUnlock("finance:1:n11", new Set(), custom).ok).toBe(true);
    expect(canUnlock("finance:2:n21", new Set(), custom).reason).toContain(
      "点齐"
    );
  });

  it("does not know a custom node without the override", () => {
    expect(canUnlock("finance:1:n11", new Set()).ok).toBe(false);
  });
});
