// 一项技能到底通向哪里。
//
// 「记录」「检索」「复述」这些名字看着像基础能力，不像一门专业 ——
// 光看名字，你不知道点亮它最后会到哪儿，也就不知道它值不值得点。
//
// 但树本身知道：前置关系是一张有向图，反过来走就是**下游**。
// 所以这里全部是算出来的，没有一句是写死的判断：
//   · 通向哪些更深的技能（沿着前置边反向走）
//   · 出现在哪几个职业的路径上
//   · 最后落到哪几个印记
//
// 还有一件事这里也算：**远交组合**。
// 比较优势不来自单项强，来自罕见的组合 —— 而"罕见"在这里不靠人口统计
// （那需要一个我们没有的分母），靠结构：两项技能在树上没有共同祖先、
// 也不在同一条职业路径上，那它们同时出现在一个人身上就是结构性的少见。

import { CLASS_DEFS } from "./classes";
import { SKILL_DEFS, SKILL_LAYERS, type SkillDef } from "./skills";

const BY_KEY = new Map(SKILL_DEFS.map((def) => [def.key, def]));

/** key → 直接建立在它之上的技能。前置边反过来。 */
const DOWNSTREAM = (() => {
  const map = new Map<string, string[]>();
  for (const def of SKILL_DEFS) {
    for (const required of def.requires ?? []) {
      map.set(required, [...(map.get(required) ?? []), def.key]);
    }
  }
  return map;
})();

/** key → 它踩着的所有祖先（递归展开前置）。 */
function ancestorsOf(key: string, seen = new Set<string>()): Set<string> {
  for (const required of BY_KEY.get(key)?.requires ?? []) {
    if (seen.has(required)) continue;
    seen.add(required);
    ancestorsOf(required, seen);
  }
  return seen;
}

/** key → 所有直接或间接建立在它之上的技能。 */
export function descendantsOf(key: string): string[] {
  const out = new Set<string>();
  const queue = [...(DOWNSTREAM.get(key) ?? [])];
  while (queue.length > 0) {
    const next = queue.shift()!;
    if (out.has(next)) continue;
    out.add(next);
    queue.push(...(DOWNSTREAM.get(next) ?? []));
  }
  return [...out];
}

export type SkillDestination = {
  /** 直接建在它上面的那几项。 */
  next: SkillDef[];
  /** 一路往上最后能到的印记。 */
  signatures: SkillDef[];
  /** 哪几个职业的路径经过它。 */
  classes: { key: string; name: string }[];
  /** 它是不是某个职业的必经之路（那个职业的每条路都要过它）。 */
  gateFor: { key: string; name: string }[];
};

/**
 * 这一项通向哪里。
 * 全部由前置图算出 —— 改一条前置，这里跟着变，不存在写死的说明过期。
 */
export function destinationOf(key: string): SkillDestination {
  const down = descendantsOf(key);
  const downSet = new Set(down);

  const classes = CLASS_DEFS.filter(
    (klass) =>
      klass.skills.includes(key) ||
      klass.signature === key ||
      klass.skills.some((item) => downSet.has(item)) ||
      downSet.has(klass.signature)
  ).map((klass) => ({ key: klass.key, name: klass.name }));

  // 必经之路：这个职业的印记，其所有祖先里包含它。
  const gateFor = CLASS_DEFS.filter((klass) => {
    if (klass.signature === key) return false;
    return ancestorsOf(klass.signature).has(key);
  }).map((klass) => ({ key: klass.key, name: klass.name }));

  return {
    next: (DOWNSTREAM.get(key) ?? [])
      .map((item) => BY_KEY.get(item))
      .filter((def): def is SkillDef => Boolean(def)),
    signatures: down
      .map((item) => BY_KEY.get(item))
      .filter(
        (def): def is SkillDef => Boolean(def) && def!.layer === "signature"
      ),
    classes,
    gateFor,
  };
}

export type Crossover = {
  a: SkillDef;
  b: SkillDef;
  /** 为什么这两项凑在一起少见。 */
  why: string;
  /** 同时需要这两项的职业。 */
  classes: { key: string; name: string }[];
};

const LAYER_RANK = (def: SkillDef) => SKILL_LAYERS.indexOf(def.layer);

/**
 * 远交组合：你已经走出来的技能里，哪两项凑在一起是结构性少见的。
 *
 * 判定只看结构，不编统计：
 *   · 分属不同领域；
 *   · 在树上没有共同祖先 —— 它们是两条独立长起来的线；
 *   · 至少一项在模组层以上，否则只是两个基本功撞在一起。
 *
 * 这就是比较优势的来源：一条线上再深，也有人比你深；
 * 两条不相交的线同时有一定深度，能同时做这两件事的人才真的少。
 */
export function crossovers(
  reached: Map<string, number>,
  limit = 6
): Crossover[] {
  const walked = [...reached.entries()]
    .filter(([, tier]) => tier >= 1)
    .map(([key]) => BY_KEY.get(key))
    .filter((def): def is SkillDef => Boolean(def))
    .sort((a, b) => LAYER_RANK(b) - LAYER_RANK(a));

  const out: Crossover[] = [];
  for (let i = 0; i < walked.length; i += 1) {
    for (let j = i + 1; j < walked.length; j += 1) {
      const a = walked[i];
      const b = walked[j];
      if (a.group === b.group) continue;
      if (LAYER_RANK(a) < 2 && LAYER_RANK(b) < 2) continue;

      const ancestorsA = ancestorsOf(a.key);
      const ancestorsB = ancestorsOf(b.key);
      // 一项踩在另一项上，那是同一条线的深浅，不是两条线。
      if (ancestorsA.has(b.key) || ancestorsB.has(a.key)) continue;
      // 共用元件层不算"同源"：记录、倾听、观察这些谁都踩着。
      // 真正说明是同一条线的，是共用一个回路层以上的地基。
      const shared = [...ancestorsA].filter(
        (item) =>
          ancestorsB.has(item) &&
          LAYER_RANK(BY_KEY.get(item)!) > 0
      );
      if (shared.length > 0) continue;

      const both = CLASS_DEFS.filter(
        (klass) =>
          [...klass.skills, klass.signature].includes(a.key) &&
          [...klass.skills, klass.signature].includes(b.key)
      ).map((klass) => ({ key: klass.key, name: klass.name }));

      out.push({
        a,
        b,
        why: `除了最底下的基本功，${a.name}和${b.name}没有共用任何地基 —— 两条各自长起来的线`,
        classes: both,
      });
      if (out.length >= limit * 3) break;
    }
    if (out.length >= limit * 3) break;
  }

  // 两边都越深越少见。
  return out
    .sort(
      (x, y) =>
        LAYER_RANK(y.a) + LAYER_RANK(y.b) - (LAYER_RANK(x.a) + LAYER_RANK(x.b))
    )
    .slice(0, limit);
}
