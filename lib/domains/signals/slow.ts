/**
 * 慢变量：每天几乎不动、从不上头条，但决定未来十年的那几个数字（人口、老龄化、汇率……）。
 * 每天的新闻里，倒产潮、外国司机、自助收银机，常常是同一个慢变量的不同表面。
 * 一周看一次就够。
 *
 * 不是固定的：想加别的指标，在 SLOW_VARIABLES 里加一行，写明从哪里取。
 * 现在用的都是不用注册的公开数据：世界银行（每年）、欧洲央行的汇率（每天，经 frankfurter）。
 * 有效求人倍率、实际工资在日本政府统计（e-Stat）里，要注册免费的 appId，注册了再加。
 */

export type SlowSource =
  | { type: "worldbank"; indicator: string }
  | { type: "fx"; base: string; symbol: string };

export type SlowVariable = {
  key: string;
  label: string;
  /** 为什么值得盯：它是哪些新闻背后的那只手。 */
  why: string;
  unit: string;
  /** 小数点后保留几位。 */
  digits: number;
  source: SlowSource;
};

export const SLOW_VARIABLES: SlowVariable[] = [
  {
    key: "population",
    label: "日本总人口",
    why: "客户和员工都在一年年变少。几乎所有生意的天花板都在往下压，只是快慢不同。",
    unit: "万人",
    digits: 0,
    source: { type: "worldbank", indicator: "SP.POP.TOTL" },
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
    label: "物价涨幅（CPI，年）",
    why: "物价高倒产、涨薪、日银加息，都绕着它转。几十年不涨之后又开始涨，是人们观念在变的一个源头。",
    unit: "%",
    digits: 1,
    source: { type: "worldbank", indicator: "FP.CPI.TOTL.ZG" },
  },
  {
    key: "unemployment",
    label: "失业率",
    why: "和人手不足是一体两面。低到这个程度，招人就只能靠涨工资或者省人。",
    unit: "%",
    digits: 1,
    source: { type: "worldbank", indicator: "SL.UEM.TOTL.ZS" },
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

export async function fetchSlowSeries(variable: SlowVariable, now = new Date()): Promise<SlowSeries> {
  const s = variable.source;
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

/** 和 n 个点之前比变了多少（同一单位）。点不够就返回 null。 */
export function changeOver(points: SlowPoint[], back: number): { from: SlowPoint; delta: number } | null {
  if (points.length <= back) return null;
  const from = points[points.length - 1 - back];
  return { from, delta: points[points.length - 1].value - from.value };
}
