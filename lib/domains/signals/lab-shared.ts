/**
 * 挑法盲测里浏览器端也要用的部分：几种挑法的名字、展示用的字、只数次数的统计。不碰数据库。
 */

export const LAB_VARIANTS = ["current", "thinking", "two_round", "strong"] as const;
export type LabVariantKey = (typeof LAB_VARIANTS)[number];

export const LAB_VARIANT_LABELS: Record<LabVariantKey, { name: string; how: string }> = {
  current: { name: "现在的挑法", how: "只看标题和一两句简介，不先想，直接挑。" },
  thinking: { name: "先想再挑", how: "同样只看标题和简介，让它先想一想再挑。" },
  two_round: { name: "两轮，读了正文再挑", how: "先按标题粗选 15 条，把这 15 条的正文读下来，再从里面挑 5 条。" },
  strong: { name: "换更强的模型", how: "只看标题和简介，换一个更贵、更强的模型先想再挑。" },
};

/** 揭晓之前，几组只用这几个字叫。 */
export const DISPLAY_LETTERS = ["甲", "乙", "丙", "丁"];

export type LabPick = { signal_id: string; title: string; url: string | null; source: string };
export type LabVariant = { key: LabVariantKey; picks: LabPick[]; error?: string };
export type LabRun = {
  id: string;
  kind: string;
  variants: LabVariant[];
  /** 展示顺序（打乱过）。 */
  display: LabVariantKey[];
  chosen: LabVariantKey | null;
  created_at: string;
};

/** 打乱展示顺序，免得他记住"第一组总是现在的挑法"。random 可以换掉，方便测试。 */
export function shuffledDisplay(random: () => number = Math.random): LabVariantKey[] {
  const out = [...LAB_VARIANTS];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 每种挑法被选中几次。只数次数（原则 1）；没挑完的那几次不算。 */
export function tallyLab(runs: LabRun[]): { key: LabVariantKey; chosen: number }[] {
  return LAB_VARIANTS.map((key) => ({ key, chosen: runs.filter((r) => r.chosen === key).length }));
}

/** 每条被几组挑中：几组都挑了的是共识，只有一组挑了的才是分歧所在。 */
export function pickOverlap(variants: LabVariant[]): Map<string, number> {
  const count = new Map<string, number>();
  for (const v of variants) for (const p of v.picks) count.set(p.signal_id, (count.get(p.signal_id) ?? 0) + 1);
  return count;
}
