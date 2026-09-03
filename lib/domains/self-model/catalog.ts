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
  /**
   * gte / lte 看**数值**：这一格算得出来，而且高于/低于某个线。
   * dark 看**样本**：这一格一条记录都没有 —— 这是缺席，不是低分。
   * thin 也看样本：动过，但只动过一两次就停了。
   *
   * 为什么必须分开：数值算不出来（样本不足）和数值确实很低，
   * 是完全不同的两件事。前者是"你还没开始"，后者是"你试过而且不行"。
   * 用同一个 lte 表达它们，就是拿沉默冒充证据。
   */
  op: "gte" | "lte" | "dark" | "thin";
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
  // 全靠"这一格是黑的"成立的条目最不稀有 —— 刚开始用的时候满盘皆黑。
  if (conditions.length > 0 && conditions.every((item) => item.op === "dark")) {
    return conditions.length >= 3 ? "rare" : "magic";
  }
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
  subs: Map<string, { value: number | null; name: string; sample: number }>
): boolean {
  return entry.conditions.every((condition) => {
    const sub = subs.get(condition.sub);
    if (!sub) return false;
    // 缺席类只看样本，不看数值 —— 它们问的就是"这里有没有发生过事"。
    if (condition.op === "dark") return sub.sample === 0;
    if (condition.op === "thin") {
      return sub.sample >= 1 && sub.sample <= condition.value;
    }
    if (sub.value === null) return false;
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
        (sub) =>
          [
            sub.key,
            { value: sub.value, name: sub.name, sample: sub.sample },
          ] as const
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
      if (condition.op === "dark" || condition.op === "thin") return false;
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

  return { grant: capAbsence(grant), fade, keep };
}

/** 一次最多发几条缺席类。 */
export const ABSENCE_GRANT_CAP = 3;

/**
 * 第一天满盘皆黑，几十条缺席同时成立 ——
 * 一次性糊你一脸「还没接触过」「还没露出过」「还没押注过」，
 * 那不是画像，那是把空表读了一遍。
 *
 * 所以缺席类一次只发最具体的几条：条件多的排前面，
 * 「不接触 + 不露出 + 无人 + 不出门」比单独一条「还没接触过」有话说得多。
 */
function capAbsence(grant: CatalogEntry[]): CatalogEntry[] {
  const absence = grant
    .filter((entry) => entry.conditions.every((item) => item.op === "dark"))
    .sort((a, b) => b.conditions.length - a.conditions.length);
  if (absence.length <= ABSENCE_GRANT_CAP) return grant;

  const dropped = new Set(absence.slice(ABSENCE_GRANT_CAP).map((e) => e.key));
  return grant.filter((entry) => !dropped.has(entry.key));
}

/** 组合类没有光谱，用一个带前缀的假光谱名避开互斥索引。 */
export function spectrumKeyOf(entry: CatalogEntry): string {
  return entry.spectrumKey ?? `${FAMILY_NAMES[entry.family]}·${entry.name}`;
}
