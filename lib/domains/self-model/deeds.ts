// 事迹与参照类。
//
// 这一层唯一的存在理由是**基准率**。
//
// 要预想"做一个能养活自己的产品要多久"，可靠的做法不是想象，
// 是看你自己过去同类事情的真实分布。这就是外部视角，
// 而它需要的东西只有一样：足够多的同类历史。
//
// 所以这里没有"精彩程度"，没有"重要性打分"。一条事迹只回答四件事：
// 属于哪一类、做完了没有、有没有人用、花了多久。
// 答不上这四件事的事迹，进不了任何参照类，也就不该记。

export type DeedOutcome = "done" | "abandoned" | "ongoing";

export type Deed = {
  id: string;
  occurredOn: string;
  title: string;
  classKey: string;
  outcome: DeedOutcome;
  /** 有没有人真的用了 / 接受了。null = 不适用。 */
  adopted: boolean | null;
  durationDays: number | null;
  cost: string | null;
};

/** 建议的参照类。用户可以自己写别的，这只是给个起点。 */
export const SUGGESTED_CLASSES = [
  "自发项目",
  "外部委托",
  "学一门新手艺",
  "换环境",
  "开口求助",
  "身体计划",
] as const;

export type ReferenceClass = {
  key: string;
  n: number;
  done: number;
  abandoned: number;
  ongoing: number;
  /** 完成率。样本 <3 时为 null —— 两件事算不出基准率。 */
  doneRate: number | null;
  /** 有人用的比例，只在已结束且 adopted 有值的那些里算。 */
  adoptedRate: number | null;
  adoptedSample: number;
  /** 已结束事情的时长中位数。 */
  medianDays: number | null;
};

export const MIN_CLASS_SAMPLE = 3;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function referenceClasses(deeds: Deed[]): ReferenceClass[] {
  const byKey = new Map<string, Deed[]>();
  for (const deed of deeds) {
    const key = deed.classKey.trim();
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), deed]);
  }

  return [...byKey.entries()]
    .map(([key, own]) => {
      const done = own.filter((deed) => deed.outcome === "done").length;
      const abandoned = own.filter((deed) => deed.outcome === "abandoned").length;
      const ongoing = own.filter((deed) => deed.outcome === "ongoing").length;
      const settled = own.filter((deed) => deed.outcome !== "ongoing");
      const withAdoption = settled.filter((deed) => deed.adopted !== null);
      const durations = settled
        .map((deed) => deed.durationDays)
        .filter((value): value is number => value !== null);

      return {
        key,
        n: own.length,
        done,
        abandoned,
        ongoing,
        doneRate:
          settled.length >= MIN_CLASS_SAMPLE
            ? Math.round((done / settled.length) * 100)
            : null,
        adoptedRate:
          withAdoption.length >= MIN_CLASS_SAMPLE
            ? Math.round(
                (withAdoption.filter((deed) => deed.adopted).length /
                  withAdoption.length) *
                  100
              )
            : null,
        adoptedSample: withAdoption.length,
        medianDays: durations.length >= MIN_CLASS_SAMPLE ? median(durations) : null,
      };
    })
    .sort((a, b) => b.n - a.n);
}

export type Prior = {
  classKey: string;
  n: number;
  /** 这类事情你做完的比例。 */
  doneRate: number | null;
  adoptedRate: number | null;
  medianDays: number | null;
  /** 你的估计 ÷ 历史中位数。>1 说明你这次估得比历史更乐观。 */
  optimismFactor: number | null;
  /** 一句可以直接读的先验。 */
  sentence: string;
};

/**
 * 拿一个参照类给新计划一个先验。
 *
 * 这不是预测，是把你自己的历史摆在你估计的旁边 ——
 * "你说三个月，同类的中位数是 5.4 个月"。要不要改由你决定，
 * 但至少那个数字不再是凭空来的。
 */
export function priorFor(
  reference: ReferenceClass,
  estimateDays?: number | null
): Prior {
  const optimismFactor =
    estimateDays && estimateDays > 0 && reference.medianDays
      ? Math.round((reference.medianDays / estimateDays) * 100) / 100
      : null;

  const parts: string[] = [`同类 ${reference.n} 件`];
  if (reference.doneRate !== null) parts.push(`做完 ${reference.doneRate}%`);
  if (reference.adoptedRate !== null)
    parts.push(`有人用 ${reference.adoptedRate}%`);
  if (reference.medianDays !== null)
    parts.push(`中位 ${Math.round(reference.medianDays)} 天`);
  if (parts.length === 1) {
    parts.push(`样本不足 ${MIN_CLASS_SAMPLE} 件，还给不出基准率`);
  }

  return {
    classKey: reference.key,
    n: reference.n,
    doneRate: reference.doneRate,
    adoptedRate: reference.adoptedRate,
    medianDays: reference.medianDays,
    optimismFactor,
    sentence: parts.join(" · "),
  };
}
