// 技能节点：点亮，不是打分。
//
// 之前每项技能给 0–100，那是错的：那些数字不参与任何判定，也没有分母。
// 「谈判 55」既算不出来，也说不清 55 是什么意思。
//
// 真正要回答的只有一个问题：**这项手艺我到底会不会用**。
// 所以改成 RPG 的做法 —— 每项技能拆成三个节点，一个个点亮，
// 而点亮的唯一条件是：你能写下什么时候、用它做成了什么。
//
// 两条解锁规则，都指向同一件事：不能跳。
//   同一项技能里，必须先点亮前一档。
//   有前置技能的，前置技能至少要点亮第一档 —— 地基没有就没有上层。

import {
  SKILL_DEFS,
  stagesOf,
  type SkillDef,
  type SkillStage,
} from "./skills";

export type SkillNode = {
  key: string;
  skillKey: string;
  skillName: string;
  /** 第几级：1 入门 2 基础 3 精通 4 专家 */
  tier: number;
  /** 这一级叫什么。 */
  stageName: string;
  /** 过了这一级算什么。 */
  standard: string;
  name: string;
  /** 一句能判真假的现实标准。 */
  test: string;
};

export function nodeKey(
  skillKey: string,
  tier: number,
  slot: string | number = 0
): string {
  return `${skillKey}:${tier}:${slot}`;
}

/**
 * 用户自己收下的拆解，按技能 key 覆盖内置的那份。
 *
 * 树为什么要能被覆盖：一个人说不出「这门手艺由哪些小技能构成」，
 * 那是他没有的知识量。这一层就是让树能长到代码没预先写下的领域去 ——
 * AI 提名、他改过收下、存库，然后这里覆盖默认拆解。
 */
export type StageOverrides = Map<string, SkillStage[]>;

const NO_OVERRIDES: StageOverrides = new Map();

function stagesFor(skillKey: string, overrides: StageOverrides) {
  return overrides.get(skillKey) ?? stagesOf(skillKey);
}

const FALLBACK_STAGE_NAMES = ["入门", "基础", "精通", "专家"];

/**
 * 所有节点。
 * 已拆成阶段的技能：入门/基础/精通/专家，每级挂几个小技能。
 * 还没拆的：退回三档 milestones，每档一个节点 —— 界面上会标出来。
 */
export function buildNodes(
  overrides: StageOverrides = NO_OVERRIDES
): SkillNode[] {
  return SKILL_DEFS.flatMap((def) => {
  const stages = stagesFor(def.key, overrides);
  if (stages) {
    return stages.flatMap((stage) =>
      stage.nodes.map((node, index) => ({
        key: nodeKey(def.key, stage.tier, node.id ?? index),
        skillKey: def.key,
        skillName: def.name,
        tier: stage.tier,
        stageName: stage.name,
        standard: stage.standard,
        name: node.name,
        test: node.test,
      }))
    );
  }
  return (def.milestones ?? []).map((milestone, index) => ({
    key: nodeKey(def.key, index + 1, 0),
    skillKey: def.key,
    skillName: def.name,
    tier: index + 1,
    stageName: FALLBACK_STAGE_NAMES[index] ?? "进阶",
    standard: "这项还没拆成小技能",
    name: milestone.name,
    test: milestone.test,
  }));
  });
}

/** 内置拆解下的全部节点。 */
export const ALL_NODES: SkillNode[] = buildNodes();

/** 某项技能某一级下面的全部节点。 */
function nodesOf(
  nodes: SkillNode[],
  skillKey: string,
  tier: number
): SkillNode[] {
  return nodes.filter(
    (node) => node.skillKey === skillKey && node.tier === tier
  );
}

/** 一级里的小技能全点齐，才算过了这一级。 */
export function stageCleared(
  skillKey: string,
  tier: number,
  unlockedKeys: Set<string>,
  nodes: SkillNode[] = ALL_NODES
): boolean {
  const tierNodes = nodesOf(nodes, skillKey, tier);
  return (
    tierNodes.length > 0 && tierNodes.every((node) => unlockedKeys.has(node.key))
  );
}

export const NODE_TOTAL = ALL_NODES.length;

export type NodeState = {
  node: SkillNode;
  unlocked: boolean;
  proof: string | null;
  unlockedOn: string | null;
  /** 现在能不能点。 */
  available: boolean;
  /** 点不了的原因，一句人话。 */
  blockedBy: string | null;
};

export type StageState = {
  tier: number;
  name: string;
  standard: string;
  nodes: NodeState[];
  cleared: boolean;
  /** 这一级现在能不能开始点。 */
  open: boolean;
  blockedBy: string | null;
};

export type SkillTreeEntry = {
  def: SkillDef;
  stages: StageState[];
  unlocked: number;
  total: number;
  /** 走到哪一级了。 */
  reached: number;
  /** 下一个能点的小技能。 */
  next: NodeState | null;
  /** 这项还没拆成小技能。 */
  rough: boolean;
};

const BY_KEY = new Map(SKILL_DEFS.map((def) => [def.key, def]));

/** 一项技能算不算「入了门」：第一级全点齐。 */
function hasFoundation(
  skillKey: string,
  unlockedKeys: Set<string>,
  nodes: SkillNode[]
): boolean {
  return stageCleared(skillKey, 1, unlockedKeys, nodes);
}

function blockReason(
  def: SkillDef,
  tier: number,
  unlockedKeys: Set<string>,
  nodes: SkillNode[]
): string | null {
  if (tier > 1 && !stageCleared(def.key, tier - 1, unlockedKeys, nodes)) {
    const previous = nodesOf(nodes, def.key, tier - 1);
    const left = previous.filter((node) => !unlockedKeys.has(node.key)).length;
    return `先把「${previous[0]?.stageName ?? "上一级"}」点齐，还差 ${left} 个`;
  }
  if (tier === 1) {
    const missing = (def.requires ?? []).filter(
      (required) => !hasFoundation(required, unlockedKeys, nodes)
    );
    if (missing.length > 0) {
      const names = missing
        .map((required) => BY_KEY.get(required)?.name ?? required)
        .join(" · ");
      return `先入门：${names}`;
    }
  }
  return null;
}

/**
 * 铺开整棵树。
 * 纯函数：给同样的已点亮集合，永远算出同样的可点状态。
 */
export function buildSkillTree(
  unlockedMap: Map<string, { proof: string; unlockedOn: string }>,
  overrides: StageOverrides = NO_OVERRIDES
): SkillTreeEntry[] {
  const unlockedKeys = new Set(unlockedMap.keys());
  const all = buildNodes(overrides);

  return SKILL_DEFS.map((def) => {
    const tiers = [...new Set(
      all.filter((node) => node.skillKey === def.key).map((n) => n.tier)
    )].sort((a, b) => a - b);

    const stages: StageState[] = tiers.map((tier) => {
      const blocked = blockReason(def, tier, unlockedKeys, all);
      const nodes: NodeState[] = nodesOf(all, def.key, tier).map((node) => {
        const record = unlockedMap.get(node.key);
        return {
          node,
          unlocked: Boolean(record),
          proof: record?.proof ?? null,
          unlockedOn: record?.unlockedOn ?? null,
          available: !record && blocked === null,
          blockedBy: record ? null : blocked,
        };
      });
      return {
        tier,
        name: nodes[0]?.node.stageName ?? `第 ${tier} 级`,
        standard: nodes[0]?.node.standard ?? "",
        nodes,
        cleared: stageCleared(def.key, tier, unlockedKeys, all),
        open: blocked === null,
        blockedBy: blocked,
      };
    });

    const flat = stages.flatMap((stage) => stage.nodes);
    return {
      def,
      stages,
      unlocked: flat.filter((item) => item.unlocked).length,
      total: flat.length,
      reached: stages.filter((stage) => stage.cleared).length,
      next: flat.find((item) => item.available) ?? null,
      rough: stagesFor(def.key, overrides) === null,
    };
  });
}

/** 服务端的最后一道校验：这个节点现在能不能点。 */
export function canUnlock(
  key: string,
  unlockedKeys: Set<string>,
  overrides: StageOverrides = NO_OVERRIDES
): { ok: boolean; reason?: string } {
  const all = buildNodes(overrides);
  const node = all.find((item) => item.key === key);
  if (!node) return { ok: false, reason: "没有这个节点" };
  if (unlockedKeys.has(key)) return { ok: false, reason: "已经点亮了" };

  const def = BY_KEY.get(node.skillKey);
  if (!def) return { ok: false, reason: "没有这项技能" };
  const blocked = blockReason(def, node.tier, unlockedKeys, all);
  if (blocked) return { ok: false, reason: blocked };
  return { ok: true };
}

/** 入门了多少项技能。 */
export function startedSkills(
  unlockedKeys: Set<string>,
  overrides: StageOverrides = NO_OVERRIDES
): number {
  const all = buildNodes(overrides);
  return SKILL_DEFS.filter((def) => hasFoundation(def.key, unlockedKeys, all))
    .length;
}
