/**
 * 慢变量：每天几乎不动、从不上头条，但决定未来十年的那几个数字（人口、老龄化、汇率……）。
 * 每天的新闻里，倒产潮、外国司机、自助收银机，常常是同一个慢变量的不同表面。
 * 一周看一次就够。
 *
 * 不是固定的：想加别的指标，在 SLOW_VARIABLES 里加一行，写明从哪里取。
 * 数据源：日本政府统计 e-Stat（每月，要 ESTAT_APP_ID）、世界银行（每年）、欧洲央行的汇率（每天，经 frankfurter）。
 * 有 e-Stat 的指标在没配 appId、或者 e-Stat 取失败时，退回世界银行的年度数据。
 * 有效求人倍率、实际工资取不到：职业安定业务统计在 e-Stat 的 API 里查不到，毎月勤労統計在 API 上停在 2021 年。
 */

export type SlowSource =
  | { type: "worldbank"; indicator: string }
  | { type: "fx"; base: string; symbol: string }
  /** e-Stat 的统计表 + 筛选条件（cdTab、cdCat01… 这类参数）。scale：取到的数乘以它换成显示单位。 */
  | { type: "estat"; statsDataId: string; params: Record<string, string>; scale?: number; label: string };

export type SlowVariable = {
  key: string;
  label: string;
  /** 为什么值得盯：它是哪些新闻背后的那只手。 */
  why: string;
  unit: string;
  /** 小数点后保留几位。 */
  digits: number;
  source: SlowSource;
  /** source 取不到时退回的数据源（e-Stat 没配 appId 时用世界银行）。 */
  fallback?: SlowSource;
};

export const SLOW_VARIABLES: SlowVariable[] = [
  {
    key: "population",
    label: "日本总人口",
    why: "客户和员工都在一年年变少。几乎所有生意的天花板都在往下压，只是快慢不同。",
    unit: "万人",
    digits: 0,
    source: {
      type: "estat",
      statsDataId: "0003443838",
      params: { cdCat02: "000", cdCat03: "01000" },
      label: "总务省 人口推计（概算值）",
    },
    fallback: { type: "worldbank", indicator: "SP.POP.TOTL" },
  },
  {
    key: "foreign",
    label: "在日外国人人口",
    why: "总人口在减，外国人在增：外国司机、护理、便利店店员是一面，面向在日外国人的生意（汇款、住房、语言、食品）是另一面。",
    unit: "万人",
    digits: 1,
    source: {
      type: "estat",
      statsDataId: "0003443840",
      params: { cdCat02: "000", cdCat03: "01000", cdCat04: "003" },
      scale: 0.1,
      label: "总务省 人口推计（确定值）",
    },
  },
  {
    key: "working_age",
    label: "劳动年龄人口（15–64 岁）占比",
    why: "人手不足的根。倒产潮、外国司机、自助收银机、自研排班 App，多半是它的表面。",
    unit: "%",
    digits: 1,
    source: { type: "worldbank", indicator: "SP.POP.1564.TO.ZS" },
  },
  {
    key: "aged",
    label: "65 岁以上占比",
    why: "护理、医疗、事业承继（老板退休没人接）的需求，跟着它走。",
    unit: "%",
    digits: 1,
    source: { type: "worldbank", indicator: "SP.POP.65UP.TO.ZS" },
  },
  {
    key: "inflation",
    label: "物价涨幅（CPI，同比）",
    why: "物价高倒产、涨薪、日银加息，都绕着它转。几十年不涨之后又开始涨，是人们观念在变的一个源头。",
    unit: "%",
    digits: 1,
    source: {
      type: "estat",
      statsDataId: "0004052037",
      params: { cdTab: "3", cdCat01: "0001", cdArea: "00000" },
      label: "总务省 消费者物价指数（综合，同比）",
    },
    fallback: { type: "worldbank", indicator: "FP.CPI.TOTL.ZG" },
  },
  {
    key: "unemployment",
    label: "失业率",
    why: "和人手不足是一体两面。低到这个程度，招人就只能靠涨工资或者省人。",
    unit: "%",
    digits: 1,
    source: {
      type: "estat",
      statsDataId: "0003005865",
      params: { cdTab: "02", cdCat02: "08", cdCat03: "0" },
      label: "总务省 劳动力调查（完全失业率，原数值）",
    },
    fallback: { type: "worldbank", indicator: "SL.UEM.TOTL.ZS" },
  },
  {
    key: "usdjpy",
    label: "1 美元兑日元",
    why: "进口成本、海外游客、跨境电商卖不卖得动，都看它。",
    unit: "日元",
    digits: 1,
    source: { type: "fx", base: "USD", symbol: "JPY" },
  },
  {
    key: "cnyjpy",
    label: "1 人民币兑日元",
    why: "中日之间的生意（代购、跨境电商、访日中国游客）对它最敏感。",
    unit: "日元",
    digits: 2,
    source: { type: "fx", base: "CNY", symbol: "JPY" },
  },
];

export type SlowPoint = { date: string; value: number };

export type SlowSeries = {
  variable: SlowVariable;
  /** 从旧到新。取不到就是空数组。 */
  points: SlowPoint[];
  sourceLabel: string;
  sourceUrl: string;
};

const WB_YEARS = 20;
const FX_YEARS = 5;
const ONE_DAY = 86_400;

async function fetchJson(url: string): Promise<unknown> {
  // 世界银行的接口很慢（一次十秒上下）、偶尔返回空内容，不带浏览器标识还会一直挂着：
  // 带上标识、等久一点、重试一次；结果缓存一天（慢变量一天之内不会变），只有每天第一次打开会慢
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ideaos/1.0)" },
        next: { revalidate: ONE_DAY },
        signal: AbortSignal.timeout(25_000),
      });
      const text = await res.text();
      if (res.ok && text.trim()) return JSON.parse(text);
    } catch {
      // 下一次
    }
  }
  return null;
}

/** 世界银行的返回：[元信息, [{date, value}, ...]]（从新到旧，value 可能为 null）。 */
export function parseWorldBank(json: unknown): SlowPoint[] {
  const rows = Array.isArray(json) && Array.isArray(json[1]) ? (json[1] as { date?: unknown; value?: unknown }[]) : [];
  return rows
    .filter((r) => typeof r.value === "number" && typeof r.date === "string")
    .map((r) => ({ date: r.date as string, value: r.value as number }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** frankfurter 的返回：{rates: {"2026-10-09": {JPY: 153.2}}}。每个月只留最后一个交易日。 */
export function parseFx(json: unknown, symbol: string): SlowPoint[] {
  const rates = (json as { rates?: Record<string, Record<string, number>> } | null)?.rates ?? {};
  const byMonth = new Map<string, SlowPoint>();
  for (const date of Object.keys(rates).sort()) {
    const value = rates[date]?.[symbol];
    if (typeof value === "number") byMonth.set(date.slice(0, 7), { date, value });
  }
  return Array.from(byMonth.values());
}

/**
 * e-Stat 的返回：VALUE 里每条有 @time（"2026000909" = 2026 年 9 月，"2026000000" 是年份合计）和 $（值）。
 * 只留月度的点，从旧到新；"-"、"…" 这类缺值跳过。
 */
export function parseEstat(json: unknown, scale = 1): SlowPoint[] {
  const raw = (json as { GET_STATS_DATA?: { STATISTICAL_DATA?: { DATA_INF?: { VALUE?: unknown } } } } | null)
    ?.GET_STATS_DATA?.STATISTICAL_DATA?.DATA_INF?.VALUE;
  const rows = (Array.isArray(raw) ? raw : raw ? [raw] : []) as { "@time"?: string; $?: string }[];
  const out: SlowPoint[] = [];
  for (const r of rows) {
    const m = (r["@time"] ?? "").match(/^(\d{4})00(\d{2})\2$/);
    const value = Number(r.$);
    if (!m || m[2] === "00" || Number(m[2]) > 12 || !Number.isFinite(value)) continue;
    out.push({ date: `${m[1]}-${m[2]}`, value: value * scale });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchFrom(variable: SlowVariable, s: SlowSource, now: Date): Promise<SlowSeries> {
  if (s.type === "estat") {
    const appId = process.env.ESTAT_APP_ID;
    if (!appId) return { variable, points: [], sourceLabel: s.label, sourceUrl: "" };
    const url = new URL("https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData");
    url.searchParams.set("appId", appId);
    url.searchParams.set("lang", "J");
    url.searchParams.set("statsDataId", s.statsDataId);
    url.searchParams.set("metaGetFlg", "N");
    url.searchParams.set("cntGetFlg", "N");
    for (const [k, v] of Object.entries(s.params)) url.searchParams.set(k, v);
    const points = parseEstat(await fetchJson(url.toString()), s.scale);
    return {
      variable,
      // 月度数据只留最近 10 年多一点，够看一年前、十年前
      points: points.slice(-125),
      sourceLabel: s.label,
      sourceUrl: `https://www.e-stat.go.jp/dbview?sid=${s.statsDataId}`,
    };
  }
  if (s.type === "worldbank") {
    const url = `https://api.worldbank.org/v2/country/JPN/indicator/${s.indicator}?format=json&per_page=${WB_YEARS}&mrv=${WB_YEARS}`;
    const points = parseWorldBank(await fetchJson(url));
    return {
      variable,
      points: variable.key === "population" ? points.map((p) => ({ ...p, value: p.value / 10_000 })) : points,
      sourceLabel: "世界银行",
      sourceUrl: `https://data.worldbank.org/indicator/${s.indicator}?locations=JP`,
    };
  }
  const start = new Date(now.getTime() - FX_YEARS * 365 * ONE_DAY * 1000).toISOString().slice(0, 10);
  const json = await fetchJson(`https://api.frankfurter.dev/v1/${start}..?base=${s.base}&symbols=${s.symbol}`);
  return {
    variable,
    points: parseFx(json, s.symbol),
    sourceLabel: "欧洲央行（经 frankfurter）",
    sourceUrl: `https://www.frankfurter.app/`,
  };
}

/** 先用主数据源；取不到（没配 appId、接口失败）再用退路。 */
export async function fetchSlowSeries(variable: SlowVariable, now = new Date()): Promise<SlowSeries> {
  const primary = await fetchFrom(variable, variable.source, now);
  if (primary.points.length > 0 || !variable.fallback) return primary;
  return fetchFrom(variable, variable.fallback, now);
}

/** 这个序列是月度的还是年度的（决定"比一年前"往回数几个点）。 */
export function isMonthly(series: SlowSeries): boolean {
  return series.points.some((p) => /^\d{4}-\d{2}/.test(p.date));
}

/** 和 n 个点之前比变了多少（同一单位）。点不够就返回 null。 */
export function changeOver(points: SlowPoint[], back: number): { from: SlowPoint; delta: number } | null {
  if (points.length <= back) return null;
  const from = points[points.length - 1 - back];
  return { from, delta: points[points.length - 1].value - from.value };
}
