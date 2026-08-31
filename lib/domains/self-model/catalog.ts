// 特性目录：判定逻辑在代码里，规则从数据库读。
//
// 搬进表之后有一条没变：**判定仍然是纯函数**。同一份目录 + 同一个面板，
// 永远算出同样的结果，不碰数据库、不叫 AI。表只是换了个地方放定义，
// 换掉的不是"谁说了算"。
//
// 品级提示由条件难度自动定：条件越多越难同时成立，
// 所以稀有度就是"这几件事同时发生的概率"。

import type { Panel } from "./panel";
import type { TraitModifier } from "./traits";

export const CATALOG_FAMILIES = [
  "dial",
  "combo",
  "absence",
  "tempo",
  "ratio",
] as const;
export type CatalogFamily = (typeof CATALOG_FAMILIES)[number];

export const FAMILY_NAMES: Record<CatalogFamily, string> = {
  dial: "拨杆",
  combo: "组合",
  absence: "缺席",
  tempo: "时序",
  ratio: "比值",
};

export type CatalogCondition = {
  sub: string;
  op: "gte" | "lte";
  value: number;
};

export type CatalogEntry = {
  key: string;
  name: string;
  gloss: string;
  family: CatalogFamily;
  spectrumKey: string | null;
  pole: "negative" | "positive" | null;
  conditions: CatalogCondition[];
  modifiers: TraitModifier[];
  backfire: string | null;
  equipNote: string | null;
  setKey: string | null;
  rarityHint: string;
  alarm: boolean;
  neutral: boolean;
};

/** 条件越多、越靠极值，越难同时成立。 */
export function rarityFromConditions(conditions: CatalogCondition[]): string {
  const extreme = conditions.some(
    (item) =>
      (item.op === "gte" && item.value >= 18) ||
      (item.op === "lte" && item.value <= 3)
  );
  if (conditions.length >= 4 || extreme) return "legend";
  if (conditions.length === 3) return "epic";
  if (conditions.length === 2) return "rare";
  return "magic";
}

export type CatalogScan = {
  grant: CatalogEntry[];
  fade: { key: string; name: string; reason: string }[];
  keep: string[];
};

/** 一条目录条目现在成不成立。任一条件的样本缺失都算不成立。 */
export function qualifies(
  entry: CatalogEntry,
  subs: Map<string, { value: number | null; name: string }>
): boolean {
  return entry.conditions.every((condition) => {
    const sub = subs.get(condition.sub);
    if (!sub || sub.value === null) return false;
    return condition.op === "gte"
      ? sub.value >= condition.value
      : sub.value <= condition.value;
  });
}

/**
 * 扫一遍目录：该发什么、该撤什么。
 * 拨杆受互斥光谱限制（一根光谱同时只能有一条），组合不受限 ——
 * 它们靠条件本身自限。
 */
export function scanCatalog(
  panel: Panel,
  catalog: CatalogEntry[],
  held: { libraryKey: string | null; spectrumKey: string }[]
): CatalogScan {
  const subs = new Map(
    panel.mains.flatMap((main) =>
      main.subs.map(
        (sub) => [sub.key, { value: sub.value, name: sub.name }] as const
      )
    )
  );
  const heldKeys = new Set(
    held.map((item) => item.libraryKey).filter(Boolean) as string[]
  );
  const occupied = new Set(held.map((item) => item.spectrumKey));

  const grant: CatalogEntry[] = [];
  const fade: CatalogScan["fade"] = [];
  const keep: string[] = [];

  for (const entry of catalog) {
    const isHeld = heldKeys.has(entry.key);
    const ok = qualifies(entry, subs);

    if (ok) {
      if (isHeld) keep.push(entry.key);
      else if (!entry.spectrumKey || !occupied.has(entry.spectrumKey)) {
        grant.push(entry);
      }
      continue;
    }
    if (!isHeld) continue;

    // 样本没了和数值回到中间，是两件不同的事，理由要说清楚。
    const missing = entry.conditions.find((condition) => {
      const sub = subs.get(condition.sub);
      return !sub || sub.value === null;
    });
    fade.push({
      key: entry.key,
      name: entry.name,
      reason: missing
        ? `${subs.get(missing.sub)?.name ?? missing.sub} 的样本已经不足`
        : entry.conditions.length > 1
          ? "条件已经不同时成立"
          : "数值回到常人区",
    });
  }

  return { grant, fade, keep };
}

/** 组合类没有光谱，用一个带前缀的假光谱名避开互斥索引。 */
export function spectrumKeyOf(entry: CatalogEntry): string {
  return entry.spectrumKey ?? `${FAMILY_NAMES[entry.family]}·${entry.name}`;
}
