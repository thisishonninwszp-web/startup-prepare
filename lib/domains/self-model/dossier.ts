// 三份档案：兑现了 / 欠着 / 看情况。
//
// 这一层唯一的存在理由是**把证据切开**。
//
// 三份档案不是三种语气，是同一批记录的三个切片。让 AI 用三种口吻
// 把同一堆事讲三遍，得到的只是三倍的胡话 —— 夸你的那份和骂你的那份
// 一样不可证伪。所以切分必须由代码完成，AI 只在最后负责给簇起名字。
//
// 什么算一条证据：**你事先说过会怎样，后来事实对得上或对不上**。
// 它需要两个时间点。没有事先那个说法，就谈不上兑不兑现，也就进不了档案 ——
// 这正是档案和「AI 给你列缺点」的全部区别：判你没做到的不是 AI，
// 是你自己先立的那个说法。
//
// 还没有结果的（预测没到期、事情还在做）一律不进档案。悬着的事不构成人格。

import { MIN_CLASS_SAMPLE, type Deed } from "./deeds";
import type { SelfWindow } from "./tiers";

/** 兑现 = 说了会怎样，后来对上了；欠着 = 说了，没对上。 */
export type DossierSide = "kept" | "unkept";

export const EVIDENCE_SOURCES = [
  "prediction",
  "deed",
  "adoption",
  "window",
  "hypothesis",
] as const;

export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

/** 每条证据都是一次真事，点得开，回得去。 */
export type DossierEvidence = {
  /** 稳定 key，用于去重与跳转。 */
  key: string;
  source: EvidenceSource;
  /** 原始行的 id，UI 拿它跳回那一次。 */
  sourceId: string;
  occurredOn: string;
  /** 当时说了什么。 */
  claim: string;
  side: DossierSide;
  /** 主题。同一个主题两侧都出现，就是分水岭。 */
  subject: string;
  /** 当时的处境。分水岭靠它区分「什么情况下会翻面」。 */
  context: string | null;
};

/**
 * 一个簇要有几条证据才配叫标签。
 *
 * 低于这个数只是苗头 —— 按宪法原则 1，样本不足时只报样本数、不报比率，
 * 更不该起一个听着很准的名字。两件事不构成一个人的特点。
 */
export const MIN_LABEL_EVIDENCE = MIN_CLASS_SAMPLE;

export type LabelStrength = "label" | "lead";

/**
 * 一张标签。
 *
 * `name` 留空由 AI 填 —— 代码不起名字，AI 不算数，两边各干各的。
 * `falsifier` 是这张标签的推翻条件，也就是「想改掉它得发生什么」。
 * 同一行字兼这两个用途：知道它怎么被推翻，就知道该怎么改。
 */
export type DossierLabel = {
  subject: string;
  side: DossierSide;
  strength: LabelStrength;
  /** 这一侧的证据。 */
  evidence: DossierEvidence[];
  /** 同主题另一侧的条数。0 表示这个主题目前一边倒。 */
  opposite: number;
  /** 推翻它需要几条相反的记录。 */
  flipsAfter: number;
  /** 可以直接读的推翻条件。 */
  falsifier: string;
  /** AI 填。代码永远不写这两栏。 */
  name: string | null;
  /** 这簇里真实发生过的一次，写成看得见的样子。 */
  scene: string | null;
};

/** 分水岭：同一主题两侧都有记录 —— 这个人在什么情况下会翻面。 */
export type Divide = {
  subject: string;
  kept: DossierEvidence[];
  unkept: DossierEvidence[];
  keptContexts: string[];
  unkeptContexts: string[];
  /** AI 填：什么情况下你是前者，什么情况下是后者。 */
  condition: string | null;
};

/** 同一主题的两侧，当面摆在一起。 */
export type Confrontation = {
  subject: string;
  kept: DossierLabel | null;
  unkept: DossierLabel | null;
  divide: Divide;
};

export type Dossier = {
  kept: DossierLabel[];
  unkept: DossierLabel[];
  divides: Divide[];
  /** 每种来源各贡献了几条。全 0 时 UI 必须说实话，不能装作有档案。 */
  bySource: Record<EvidenceSource, number>;
  total: number;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

// ---------------------------------------------------------------- 取证

/**
 * 预测 → 证据。
 *
 * 只收已对账的。pending 不进档案 —— 押了还没开奖的注说明不了你是谁。
 */
export function fromPrediction(row: {
  id: string;
  text: string;
  outcome: string;
  due_at: string | null;
  resolved_at: string | null;
  subject?: string | null;
}): DossierEvidence | null {
  if (row.outcome !== "hit" && row.outcome !== "miss") return null;
  return {
    key: `prediction:${row.id}`,
    source: "prediction",
    sourceId: row.id,
    occurredOn: (row.resolved_at ?? row.due_at ?? "").slice(0, 10),
    claim: row.text,
    side: row.outcome === "hit" ? "kept" : "unkept",
    subject: normalize(row.subject ?? "事前预测"),
    context: null,
  };
}

/**
 * 事迹 → 两条独立证据。
 *
 * 做完没有、有没有人要，是两件事。四个项目全做完、零采纳的人，
 * 在「做得完」那栏是满分，在「有人要」那栏是零 —— 拆开才看得见。
 * 合起来算一个总评，就什么都看不见了。
 */
export function fromDeed(deed: Deed): DossierEvidence[] {
  const out: DossierEvidence[] = [];
  if (deed.outcome !== "ongoing") {
    out.push({
      key: `deed-done:${deed.id}`,
      source: "deed",
      sourceId: deed.id,
      occurredOn: deed.occurredOn,
      claim: deed.title,
      side: deed.outcome === "done" ? "kept" : "unkept",
      subject: normalize(`${deed.classKey}·做完`),
      context: deed.cost,
    });
  }
  if (deed.adopted !== null) {
    out.push({
      key: `deed-adopted:${deed.id}`,
      source: "adoption",
      sourceId: deed.id,
      occurredOn: deed.occurredOn,
      claim: deed.title,
      side: deed.adopted ? "kept" : "unkept",
      subject: normalize(`${deed.classKey}·有人要`),
      context: deed.cost,
    });
  }
  return out;
}

/**
 * 假设窗口 → 证据。
 *
 * `outcome=miss` 是整个档案里最值钱的一类：符合条件的情境出现了，
 * 而你没动。这种事没人会主动记，所以只能靠系统问出来 ——
 * 但一旦记下，它比任何自述都准。
 */
export function fromWindow(
  row: SelfWindow & { id: string; hypothesis_label?: string | null }
): DossierEvidence {
  return {
    key: `window:${row.id}`,
    source: "window",
    sourceId: row.id,
    occurredOn: row.occurred_on,
    claim: row.hypothesis_label ?? row.context_key,
    side: row.outcome === "hit" ? "kept" : "unkept",
    subject: normalize(row.hypothesis_label ?? row.context_key),
    context: row.context_key,
  };
}

/** 被推翻的自我假设 —— 最硬的一条欠着，因为是你自己拆的。 */
export function fromHypothesis(row: {
  id: string;
  label: string;
  tier: string;
  stated_on?: string | null;
}): DossierEvidence | null {
  if (row.tier !== "refuted") return null;
  return {
    key: `hypothesis:${row.id}`,
    source: "hypothesis",
    sourceId: row.id,
    occurredOn: (row.stated_on ?? "").slice(0, 10),
    claim: row.label,
    side: "unkept",
    subject: normalize(row.label),
    context: null,
  };
}

// ---------------------------------------------------------------- 成档

/**
 * 推翻条件 —— 同时也是「想改掉它得发生什么」。
 *
 * 按来源分开写：采纳那栏说的是有没有人用，做完那栏说的是有没有烂尾，
 * 都写成「说到做到」会答非所问。
 */
function falsifierFor(
  side: DossierSide,
  strength: LabelStrength,
  n: number,
  flipsAfter: number,
  source: EvidenceSource
): string {
  if (strength === "lead") {
    const need = MIN_LABEL_EVIDENCE - n;
    return `目前只有 ${n} 次，还不够算一条。再遇上 ${need} 次，它才成立。`;
  }

  const flip: Record<EvidenceSource, [string, string]> = {
    // [推翻兑现那侧要发生的事, 推翻欠着那侧要发生的事]
    adoption: ["做出来没人用", "做出来有人真的用起来"],
    deed: ["开了头没做完", "从头做到尾"],
    window: ["赶上这种情况你没动", "赶上这种情况你动了"],
    prediction: ["押的没中", "押的中了"],
    hypothesis: ["它又站住了", "它又站住了"],
  };

  const [breaksKept, breaksUnkept] = flip[source];
  return side === "kept"
    ? `再有 ${flipsAfter} 次${breaksKept}，这条就不成立了。`
    : `再有 ${flipsAfter} 次${breaksUnkept}，这条就翻过来了。`;
}

/** 这一簇主要来自哪种记录。取最多的那种。 */
function dominantSource(items: DossierEvidence[]): EvidenceSource {
  const tally = new Map<EvidenceSource, number>();
  for (const item of items) {
    tally.set(item.source, (tally.get(item.source) ?? 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function toLabel(
  subject: string,
  side: DossierSide,
  own: DossierEvidence[],
  opposite: number
): DossierLabel {
  const strength: LabelStrength =
    own.length >= MIN_LABEL_EVIDENCE ? "label" : "lead";
  const flipsAfter = Math.max(1, own.length - opposite + 1);
  return {
    subject,
    side,
    strength,
    evidence: [...own].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)),
    opposite,
    flipsAfter,
    falsifier: falsifierFor(
      side,
      strength,
      own.length,
      flipsAfter,
      dominantSource(own)
    ),
    name: null,
    scene: null,
  };
}

function uniqueContexts(items: DossierEvidence[]): string[] {
  return [
    ...new Set(
      items
        .map((item) => item.context?.trim())
        .filter((value): value is string => Boolean(value))
    ),
  ];
}

/**
 * 把证据切成三份档案。
 *
 * 排序一律按证据条数，不按「精彩程度」—— 没有重要性打分，
 * 因为一旦有，它迟早会变成评分。
 */
export function buildDossier(evidence: DossierEvidence[]): Dossier {
  const deduped = [...new Map(evidence.map((item) => [item.key, item])).values()];

  const bySource = EVIDENCE_SOURCES.reduce(
    (acc, source) => ({ ...acc, [source]: 0 }),
    {} as Record<EvidenceSource, number>
  );
  for (const item of deduped) bySource[item.source] += 1;

  const bySubject = new Map<string, DossierEvidence[]>();
  for (const item of deduped) {
    bySubject.set(item.subject, [...(bySubject.get(item.subject) ?? []), item]);
  }

  const kept: DossierLabel[] = [];
  const unkept: DossierLabel[] = [];
  const divides: Divide[] = [];

  for (const [subject, own] of bySubject) {
    const keptSide = own.filter((item) => item.side === "kept");
    const unkeptSide = own.filter((item) => item.side === "unkept");

    if (keptSide.length > 0) {
      kept.push(toLabel(subject, "kept", keptSide, unkeptSide.length));
    }
    if (unkeptSide.length > 0) {
      unkept.push(toLabel(subject, "unkept", unkeptSide, keptSide.length));
    }

    // 两侧都有 = 这个主题上你会翻面。那才是最该看的一档。
    if (keptSide.length > 0 && unkeptSide.length > 0) {
      divides.push({
        subject,
        kept: keptSide,
        unkept: unkeptSide,
        keptContexts: uniqueContexts(keptSide),
        unkeptContexts: uniqueContexts(unkeptSide),
        condition: null,
      });
    }
  }

  const byEvidenceCount = (
    a: { evidence: DossierEvidence[] },
    b: { evidence: DossierEvidence[] }
  ) => b.evidence.length - a.evidence.length;

  return {
    kept: kept.sort(byEvidenceCount),
    unkept: unkept.sort(byEvidenceCount),
    divides: divides.sort(
      (a, b) =>
        b.kept.length + b.unkept.length - (a.kept.length + a.unkept.length)
    ),
    bySource,
    total: deduped.length,
  };
}


/**
 * 对质：同一主题的两侧摆在一起。
 *
 * 这是三份档案唯一的爽点。「自己挖坑自己填」和「做了没人用」说的是同一批
 * 项目，可它们各待在一个 tab 里，你永远看不到它们当面顶牛 ——
 * 而那个瞬间才是这套东西的全部意义：两句话都为真，所以你得知道
 * 什么时候是哪一句。
 *
 * 注意主题不同的两条不算对质（「做完」和「有人要」是两件事，
 * 它们不矛盾）。只有同一主题两侧都有记录，才是真的顶牛。
 */
export function confrontations(dossier: Dossier): Confrontation[] {
  const keptBySubject = new Map(dossier.kept.map((item) => [item.subject, item]));
  const unkeptBySubject = new Map(
    dossier.unkept.map((item) => [item.subject, item])
  );

  return dossier.divides.map((divide) => ({
    subject: divide.subject,
    kept: keptBySubject.get(divide.subject) ?? null,
    unkept: unkeptBySubject.get(divide.subject) ?? null,
    divide,
  }));
}

/**
 * 档案空到什么程度。
 *
 * 空的时候界面必须说实话：哪一类记录是零，以及记什么才能让它不是零。
 * 装作有档案比没有档案更糟 —— 那就成星座了。
 */
export function emptiness(dossier: Dossier): {
  empty: boolean;
  missing: EvidenceSource[];
} {
  const missing = EVIDENCE_SOURCES.filter(
    (source) => dossier.bySource[source] === 0
  );
  return { empty: dossier.total === 0, missing };
}

// ---------------------------------------------------------------- 背面

/**
 * 欠着那张卡的背面：更好的我。
 *
 * 不是第三份画像，是欠着那份的未来时。反复想的东西必须是「那一刻我怎么做」，
 * 不能是「我是什么样的人」—— 前者练的是情境到动作那根线，到了那个下午会响；
 * 后者练的是关于自己的信念，绑的是「我」不是「那个下午」，到时候不放电。
 *
 * 所以三行里没有一句是标签：
 *   proven  你做到过 —— 同主题兑现侧的真事。不是鼓励，是你自己的数据。
 *   trigger 那一刻长这样 —— 欠着侧出事时的处境，提前把画面走一遍。
 *   action  那一刻做这个 —— 一个动词。
 */
export type FlipSide = {
  /** 你做到过。没有就如实说没有。 */
  proven: string;
  /** 那一刻长这样。 */
  trigger: string;
  /** 那一刻做这个。 */
  action: string;
  /** 还差几次，这条就翻过来了。 */
  remaining: number;
};

function listDates(items: DossierEvidence[]): string {
  return items
    .map((item) => item.occurredOn.slice(5).replace(/^0/, "").replace("-0", "/").replace("-", "/"))
    .filter(Boolean)
    .slice(0, 3)
    .join("、");
}

function actionFor(label: DossierLabel): string {
  switch (label.evidence[0]?.source) {
    case "window":
      // 假设原句本身就是动作：「答应了的交付日期我会守住」。
      return label.subject;
    case "adoption":
      return "动手之前，先找到一个会用它的人，问他要不要。";
    case "deed":
      return "开了头就先定一个最小的「做完」，做到那儿再说。";
    case "prediction":
      return "押之前先写下：什么样算落空。";
    default:
      return label.subject;
  }
}

/**
 * 给一张欠着的卡拼背面。
 *
 * 只对欠着的卡有背面 —— 兑现的卡没什么可翻的，被推翻的假设也不该翻回去。
 */
export function flipSide(
  label: DossierLabel,
  dossier: Dossier
): FlipSide | null {
  if (label.side !== "unkept") return null;
  if (label.evidence[0]?.source === "hypothesis") return null;

  const kept = dossier.kept.find((item) => item.subject === label.subject);
  const keptContexts = kept ? uniqueContexts(kept.evidence) : [];
  const unkeptContexts = uniqueContexts(label.evidence);

  const proven = kept
    ? `你做到过。${listDates(kept.evidence)} 那${
        kept.evidence.length > 1 ? "几" : ""
      }次${
        keptContexts.length > 0 ? `，都是${keptContexts.join("、")}` : ""
      } —— 那不是运气，是你在那个条件下的常态。`
    : "还没有做到过的记录。这一行等你第一次做到就会有。";

  const trigger =
    unkeptContexts.length > 0
      ? `那一刻长这样：${unkeptContexts.join("，或者")}。`
      : `那一刻长这样：${label.evidence[0]?.claim ?? label.subject}。`;

  return {
    proven,
    trigger,
    action: actionFor(label),
    remaining: label.flipsAfter,
  };
}

// ---------------------------------------------------------------- 留下记录

/**
 * 档案里值得在「最近的变化」留时间的事。
 *
 * 其余所有东西都是「现在的状态」，只有 changelog 记得什么时候变的。
 * 三种事：一条苗头攒够次数长成了标签；同一件事第一次两边都有记录；
 * 一条主题的多数一侧换了边。全部由代码从证据算出，靠 dedupe_key 只记一次。
 */
export type DossierEvent = {
  kind: "label_formed" | "divide_found" | "label_flipped";
  title: string;
  detail: string | null;
  dedupeKey: string;
};

export function dossierEvents(dossier: Dossier): DossierEvent[] {
  const events: DossierEvent[] = [];

  for (const label of [...dossier.kept, ...dossier.unkept]) {
    if (label.strength !== "label") continue;
    events.push({
      kind: "label_formed",
      title:
        label.side === "kept"
          ? `兑现那栏多了一条：${label.subject}`
          : `欠着那栏多了一条：${label.subject}`,
      detail: `攒够 ${label.evidence.length} 次`,
      dedupeKey: `label:${label.side}:${label.subject}`,
    });
  }

  for (const divide of dossier.divides) {
    events.push({
      kind: "divide_found",
      title: `第一次两边都有记录：${divide.subject}`,
      detail: `做到 ${divide.kept.length} 次 · 没做到 ${divide.unkept.length} 次`,
      dedupeKey: `divide:${divide.subject}`,
    });

    // 多数一侧换边才算翻。两边一样多不算 —— 那是僵持，不是翻。
    if (divide.kept.length !== divide.unkept.length) {
      const now = divide.kept.length > divide.unkept.length ? "kept" : "unkept";
      events.push({
        kind: "label_flipped",
        title:
          now === "kept"
            ? `翻过来了：${divide.subject} —— 现在做到的多`
            : `翻回去了：${divide.subject} —— 现在没做到的多`,
        detail: `做到 ${divide.kept.length} 次 · 没做到 ${divide.unkept.length} 次`,
        dedupeKey: `flip:${divide.subject}:${now}`,
      });
    }
  }

  return events;
}
