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

export const ATLAS_CARRIERS = {
  local: "日本公司",
  us: "美国公司",
  china: "中国公司",
  other: "别的",
  none: "还没人带进来",
} as const;
export type AtlasCarrier = keyof typeof ATLAS_CARRIERS;

export type AtlasSource = { url: string; title: string; excerpt: string };

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
};

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
