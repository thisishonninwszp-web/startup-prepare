/**
 * 时差图谱里浏览器端也要用的部分：类别、结果、谁带进来的叫法，算时间差，按类别只数次数。不碰数据库。
 *
 * 时光机经营的前提：同一类东西从中国 / 美国到日本，有一个大致的时间差，也有常见的死法（法规、谁带进来）。
 * 攒起来，回答"两年内日本会不会出现"时就有同类的基准。只数次数，不算比率、不打分（原则 1）。
 */

export const ATLAS_CATEGORIES = {
  payment: "支付、金融",
  mobility: "出行",
  commerce: "零售、电商",
  food: "外卖、餐饮",
  content: "内容、社交",
  work: "工具、企业服务",
  hardware: "硬件、设备",
  other: "其他",
} as const;
export type AtlasCategory = keyof typeof ATLAS_CATEGORIES;

export const ATLAS_OUTCOMES = {
  widespread: "普及了",
  partial: "部分普及",
  niche: "小规模",
  exited: "进来又退出了",
  blocked: "被法规卡住",
  absent: "至今没有",
} as const;
export type AtlasOutcome = keyof typeof ATLAS_OUTCOMES;

/**
 * 每一档的意思。说的是这样东西在日本**整体**的状况，不是某一家公司的结果
 * （メルカリ关了直播带货，不等于日本没有直播带货）。AI 出候选和核实时都按这个分。
 */
export const OUTCOME_DEFINITIONS: Record<AtlasOutcome, string> = {
  widespread: "普及了：全国日常在用，资料里有数据能看出覆盖了很大一部分人（比如用户数占人口一成以上、全国大部分地方都有）",
  partial: "部分普及：在一些城市、一些人群里常用，但还没到全国日常",
  niche: "小规模：有人在做，但只在少数地点或很小的人群里（几十、几百个点，或几家公司试点）",
  exited: "进来又退出了：进来过，后来做的公司基本都退了，现在日本几乎没有",
  blocked: "被法规卡住：法规不允许，或者只开了一个很小的口子",
  absent: "至今没有：日本还没有人做",
};

/** 越往前越"成"。核实只许往后改（资料显示更差可以降），不许往前提 —— AI 看到"100 处"就会把小规模提成普及。 */
const OUTCOME_RANK: Record<AtlasOutcome, number> = { widespread: 4, partial: 3, niche: 2, exited: 1, blocked: 1, absent: 0 };

/** 核实给的结果比原来说的更"成"，就不认，留原来的。 */
export function noUpgrade(claimed: AtlasOutcome, verified: AtlasOutcome): AtlasOutcome {
  return OUTCOME_RANK[verified] > OUTCOME_RANK[claimed] ? claimed : verified;
}

export const ATLAS_CARRIERS = {
  local: "日本公司",
  us: "美国公司",
  china: "中国公司",
  other: "别的",
  none: "还没人带进来",
} as const;
export type AtlasCarrier = keyof typeof ATLAS_CARRIERS;

/** 三样说法：那边的日子、日本的日子（或没有）、在日本的结果。 */
export const ATLAS_CLAIMS = ["origin", "japan", "outcome"] as const;
export type AtlasClaim = (typeof ATLAS_CLAIMS)[number];
export const CLAIM_LABELS: Record<AtlasClaim, string> = { origin: "那边什么时候有", japan: "日本什么时候有", outcome: "在日本的结果" };

/** 一条原文。proves：裁判判它证明的是哪一样（null = 都证明不了）；没请裁判看过的没有这个字段。 */
export type AtlasSource = { url: string; title: string; excerpt: string; proves?: AtlasClaim | null };

export type JudgeStatus = "passed" | "failed" | "unavailable";

/**
 * 裁判看完每条原文以后，这一件过没过：三样里每一样都至少有一条原文被判"证明了它"才算过。
 * 返回没被证明的那几样（空 = 过了）。
 */
export function unprovenClaims(sources: Pick<AtlasSource, "proves">[]): AtlasClaim[] {
  return ATLAS_CLAIMS.filter((claim) => !sources.some((s) => s.proves === claim));
}

export type TransferCase = {
  id: string;
  thing: string;
  category: AtlasCategory;
  origin: "china" | "us";
  origin_event: string;
  origin_date: string;
  japan_event: string | null;
  japan_date: string | null;
  outcome: AtlasOutcome;
  carrier: AtlasCarrier;
  lag_months: number | null;
  sources: AtlasSource[];
  found_via: "seed" | "research" | "recheck";
  /** 裁判看没看过、过没过（迁移 074 之前、没判过为 null）。没过的不算进统计。 */
  judge_status: JudgeStatus | null;
  judge_note: string | null;
};

/** 算进统计的：没过裁判的不算（没判过、裁判不可用的照算，页面上标出来）。 */
export function countedCases<T extends Pick<TransferCase, "judge_status">>(cases: T[]): T[] {
  return cases.filter((c) => c.judge_status !== "failed");
}

/** "2018"、"2018-10"、"2018-10-05" 都认；认不出返回 null。只精确到月。 */
export function monthIndex(date: string): number | null {
  const m = date.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = m[2] ? Number(m[2]) : 1;
  if (year < 1990 || year > 2100 || month < 1 || month > 12) return null;
  return year * 12 + (month - 1);
}

/** 两边日子之间隔几个月；日本那边没有、或日子认不出、或倒过来（日本更早）的返回 null。 */
export function lagMonths(originDate: string, japanDate: string | null): number | null {
  if (!japanDate) return null;
  const a = monthIndex(originDate);
  const b = monthIndex(japanDate);
  if (a === null || b === null || b < a) return null;
  return b - a;
}

/** 几个月说成人话：不到一年说几个月，一年以上说约几年。 */
export function lagLabel(months: number | null): string {
  if (months === null) return "—";
  if (months < 12) return `${months} 个月`;
  return `约 ${(months / 12).toFixed(months % 12 === 0 ? 0 : 1)} 年`;
}

/** 多少个月以内算"很快到了"（周刊押的是两年，基准给三年这一档）。 */
export const QUICK_MONTHS = 36;

export type CategoryBase = {
  total: number;
  /** 三年内到了日本的。 */
  quick: number;
  /** 到了，但三年以上。 */
  slow: number;
  /** 至今没有、被卡住的。 */
  notYet: number;
  outcomes: Record<AtlasOutcome, number>;
  /** 中国公司直接进来的几件里，退出了几件。 */
  chinaCarried: number;
  chinaExited: number;
};

/** 一类东西的基准：只数次数。 */
export function categoryBase(cases: Pick<TransferCase, "lag_months" | "outcome" | "carrier">[]): CategoryBase {
  const outcomes = Object.fromEntries((Object.keys(ATLAS_OUTCOMES) as AtlasOutcome[]).map((o) => [o, 0])) as Record<AtlasOutcome, number>;
  for (const c of cases) outcomes[c.outcome] += 1;
  const china = cases.filter((c) => c.carrier === "china");
  return {
    total: cases.length,
    quick: cases.filter((c) => c.lag_months !== null && c.lag_months <= QUICK_MONTHS).length,
    slow: cases.filter((c) => c.lag_months !== null && c.lag_months > QUICK_MONTHS).length,
    notYet: cases.filter((c) => c.lag_months === null).length,
    outcomes,
    chinaCarried: china.length,
    chinaExited: china.filter((c) => c.outcome === "exited").length,
  };
}

/** 基准说成一句话（周刊点"这属于哪一类"之后显示）。 */
export function baseSentence(category: AtlasCategory, base: CategoryBase): string {
  if (base.total === 0) return `图谱里还没有「${ATLAS_CATEGORIES[category]}」这一类的先例，这次只能凭你自己想。`;
  const parts = [
    `图谱里「${ATLAS_CATEGORIES[category]}」有 ${base.total} 件：${base.quick} 件 3 年内到了日本`,
    base.slow ? `${base.slow} 件 3 年以上才到` : "",
    base.notYet ? `${base.notYet} 件至今没到或被卡住` : "",
  ].filter(Boolean);
  const exited = base.outcomes.exited ? `；进来又退出的 ${base.outcomes.exited} 件` : "";
  return `${parts.join("，")}${exited}。`;
}

/** 时间差分几段（只数次数）。至今没到的单列一段。 */
export const LAG_BUCKETS = [
  { label: "1 年以内", max: 12 },
  { label: "1–3 年", max: 36 },
  { label: "3–5 年", max: 60 },
  { label: "5 年以上", max: Infinity },
] as const;
export const NOT_ARRIVED_LABEL = "至今没到";

/** 每一段几件（只收算进统计的那几件由调用方挑）。 */
export function lagBuckets(cases: Pick<TransferCase, "lag_months">[]): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = LAG_BUCKETS.map((b) => ({ label: b.label, value: 0 }));
  let notYet = 0;
  for (const c of cases) {
    if (c.lag_months === null) {
      notYet += 1;
      continue;
    }
    const i = LAG_BUCKETS.findIndex((b) => (c.lag_months as number) <= b.max);
    out[i].value += 1;
  }
  return [...out, { label: NOT_ARRIVED_LABEL, value: notYet }];
}

export type TimelineRow = {
  id: string;
  thing: string;
  /** 横轴上的位置（0–100）：那边有了、日本有了（没到的画到今天）。 */
  from: number;
  to: number;
  arrived: boolean;
  /** 没过裁判的画淡一点，不算进统计。 */
  counted: boolean;
  /** 行末的小字：隔了多久 · 结果。 */
  label: string;
  /** 悬停 / 读屏的整句。 */
  text: string;
};

export type Timeline = { rows: TimelineRow[]; ticks: { year: number; at: number }[]; today: number };

/**
 * 时间轴：每件一行，从那边有了的那个月画到日本有了的那个月，没到的画到今天（虚线）。
 * 横轴从最早那件的那一年年初到明年年初；年份刻度按跨度隔一年、两年或五年。日子认不出、或日本比那边早的不画。
 */
export function atlasTimeline(
  cases: Pick<TransferCase, "id" | "thing" | "origin" | "origin_date" | "japan_date" | "outcome" | "lag_months" | "judge_status">[],
  today: string
): Timeline | null {
  const now = monthIndex(today.slice(0, 10));
  if (now === null) return null;
  const parsed = cases.flatMap((c) => {
    const start = monthIndex(c.origin_date);
    if (start === null || start > now) return [];
    const end = c.japan_date ? monthIndex(c.japan_date) : null;
    if (c.japan_date && (end === null || end < start)) return [];
    return [{ c, start, end }];
  });
  if (parsed.length === 0) return null;
  const loYear = Math.floor(Math.min(...parsed.map((p) => p.start)) / 12);
  const hiYear = Math.floor(now / 12) + 1;
  const lo = loYear * 12;
  const hi = hiYear * 12;
  const at = (m: number) => Math.round(((m - lo) / (hi - lo)) * 1000) / 10;
  const span = hiYear - loYear;
  const step = span <= 8 ? 1 : span <= 16 ? 2 : 5;
  const ticks: Timeline["ticks"] = [];
  for (let y = loYear; y <= hiYear; y += 1) if (y % step === 0) ticks.push({ year: y, at: at(y * 12) });

  const rows = parsed
    .sort((a, b) => a.start - b.start || a.c.thing.localeCompare(b.c.thing))
    .map(({ c, start, end }): TimelineRow => {
      const arrived = end !== null;
      const lag = arrived ? lagLabel(c.lag_months ?? end - start) : NOT_ARRIVED_LABEL;
      const counted = c.judge_status !== "failed";
      const place = c.origin === "china" ? "中国" : "美国";
      return {
        id: c.id,
        thing: c.thing,
        from: at(start),
        to: at(arrived ? end : now),
        arrived,
        counted,
        label: `${lag} · ${ATLAS_OUTCOMES[c.outcome]}`,
        text: `${c.thing}：${place} ${c.origin_date} → 日本 ${c.japan_date ?? "至今没有"}，${lag}，${ATLAS_OUTCOMES[c.outcome]}${counted ? "" : "（没过裁判，不算进统计）"}`,
      };
    });
  return { rows, ticks, today: at(now) };
}
