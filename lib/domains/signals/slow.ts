/**
 * 慢变量：每天几乎不动、从不上头条，但决定未来十年的那几个数字（人口、老龄化、汇率……）。
 * 每天的新闻里，倒产潮、外国司机、自助收银机，常常是同一个慢变量的不同表面。
 * 一周看一次就够。
 *
 * 不是固定的：想加别的指标，在 SLOW_VARIABLES 里加一行，写明从哪里取。
 * 数据源：日本政府统计 e-Stat（每月，要 ESTAT_APP_ID）、世界银行（每年）、欧洲央行的汇率（每天，经 frankfurter）。
 * 有 e-Stat 的指标在没配 appId、或者 e-Stat 取失败时，退回世界银行的年度数据。
 * 有效求人倍率、实际工资取不到：职业安定业务统计在 e-Stat 的 API 里查不到，毎月勤労統計在 API 上停在 2021 年。
 *
 * 2026-10 起加了几个离生意更近的数（访日游客、访日中国游客、在日中国人、最低工资、无现金支付比例）：
 * 它们没有能直接读的接口，是从官方公布值手填的（type: "table"），每个数都对过出处；对不上的年份空着，不凭印象补。
 * 每年要手动加一行 —— 最近一年的数过了一年还没填，页面上会提醒。
 */

export type SlowSource =
  | { type: "worldbank"; indicator: string }
  | { type: "fx"; base: string; symbol: string }
  /** e-Stat 的统计表 + 筛选条件（cdTab、cdCat01… 这类参数）。scale：取到的数乘以它换成显示单位。 */
  | { type: "estat"; statsDataId: string; params: Record<string, string>; scale?: number; label: string }
  /** 没有接口的：从官方公布值手填（每个数都对过出处，对不上的年份空着）。 */
  | { type: "table"; label: string; url: string; points: SlowPoint[] };

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
  /** 看这个数要知道的一句（口径变了、哪几年空着）。 */
  note?: string;
  /** 手填的这一组故意停在某一年（口径变了接不上），不提醒"该更新了"。 */
  frozen?: boolean;
};

const y = (date: string, value: number): SlowPoint => ({ date, value });

export const SLOW_VARIABLES: SlowVariable[] = [
  {
    key: "visitors",
    label: "访日外国游客（全年）",
    why: "游客生意（住宿、免税、体验、支付、翻译、行李寄存）的客人池有多大、回来了多少。",
    unit: "万人",
    digits: 0,
    source: {
      type: "table",
      label: "日本政府观光局（JNTO）访日外客数：2023 年以前取观光厅资料里的万人值，2024、2025 年取 JNTO 公布值",
      url: "https://www.jnto.go.jp/statistics/data/visitors-statistics/",
      points: [
        y("2013", 1036), y("2014", 1341), y("2015", 1974), y("2016", 2404), y("2017", 2869), y("2018", 3119), y("2019", 3188),
        y("2020", 412), y("2021", 25), y("2022", 383), y("2023", 2507), y("2024", 3687), y("2025", 4268),
      ],
    },
    note: "2025 年是 JNTO 的推计值。",
  },
  {
    key: "visitors_cn",
    label: "访日中国游客（全年）",
    why: "你最直接的一群客人：中国游客的支付、语言、消费习惯和日本本地人不一样。中日关系一变，这个数最先动。",
    unit: "万人",
    digits: 1,
    source: {
      type: "table",
      label: "日本政府观光局（JNTO）访日外客数（中国）",
      url: "https://www.jnto.go.jp/statistics/data/visitors-statistics/",
      points: [y("2019", 959.4), y("2022", 18.9), y("2023", 242.5), y("2024", 698.1), y("2025", 909.6)],
    },
    note: "2020、2021 年的数没核对到出处，空着；2024、2025 年是推计值。",
  },
  {
    key: "cn_residents",
    label: "在日中国人（年末）",
    why: "在日本生活的中国人：汇款、租房、中文服务、家乡食品、孩子教育的客户池，也是你最容易先接触到的人。",
    unit: "万人",
    digits: 1,
    source: {
      type: "table",
      label: "出入国在留管理厅 在留外国人统计（国籍：中国，各年末）",
      url: "https://www.moj.go.jp/isa/policies/statistics/toukei_ichiran_touroku.html",
      points: [y("2019", 81.4), y("2020", 77.8), y("2021", 71.7), y("2022", 76.2), y("2023", 82.2), y("2024", 87.3), y("2025", 93.0)],
    },
  },
  {
    key: "min_wage",
    label: "最低工资（全国加权平均，每小时）",
    why: "人手成本的地板：它涨得越快，靠大量兼职的生意越难做，帮人省人手的东西回本越快。",
    unit: "日元",
    digits: 0,
    source: {
      type: "table",
      label: "厚生劳动省 地域别最低工资（全国加权平均，按年度，每年 10 月前后生效）",
      url: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/",
      points: [y("2020", 902), y("2021", 930), y("2022", 961), y("2023", 1004), y("2024", 1055), y("2025", 1121)],
    },
    note: "按年度算（2025 年度 = 2025 年 10 月前后生效的那一次）；2020 年度以前的没核对，没填。",
  },
  {
    key: "cashless",
    label: "无现金支付比例",
    why: "扫码、App、线上预约这类服务推不推得开，看日本人有多少钱已经不用现金付。",
    unit: "%",
    digits: 1,
    source: {
      type: "table",
      label: "经济产业省 キャッシュレス決済比率",
      url: "https://www.meti.go.jp/policy/mono_info_service/cashless/",
      points: [y("2018", 24.1), y("2019", 26.8), y("2020", 29.7), y("2021", 32.5), y("2022", 36.0), y("2023", 39.3), y("2024", 42.8)],
    },
    note: "2025 年起经产省改用「国内指标」（2025 年是 58.0%），算法不同，接不到这条线上，所以只填到 2024 年。",
    frozen: true,
  },
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
  if (s.type === "table") {
    return { variable, points: [...s.points].sort((a, b) => a.date.localeCompare(b.date)), sourceLabel: s.label, sourceUrl: s.url };
  }
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

function fmtNumber(v: number, digits: number): string {
  return v.toLocaleString("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** "比一年前（2025-08）-55 万人"；点不够返回 null。四舍五入后是 0 的说"几乎没变"。 */
export function changeText(series: SlowSeries, back: number, label: string): string | null {
  const c = changeOver(series.points, back);
  if (!c) return null;
  const { digits, unit } = series.variable;
  const when = `${label}（${c.from.date.slice(0, 7)}）`;
  if (Number(c.delta.toFixed(digits)) === 0) return `${when}几乎没变`;
  return `${when}${c.delta > 0 ? "+" : ""}${fmtNumber(c.delta, digits)}${unit === "%" ? " 个百分点" : ` ${unit}`}`;
}

/** 给 AI 往下推用的一句话：现在多少、比一年前、比五年前（年度的是十年前）。数字全由代码算。没数据返回 null。 */
export function slowSummary(series: SlowSeries): string | null {
  const last = series.points[series.points.length - 1];
  if (!last) return null;
  const yearly = !isMonthly(series);
  const { digits, unit } = series.variable;
  return [
    `现在 ${fmtNumber(last.value, digits)} ${unit}（${yearly ? `${last.date} 年` : last.date}）`,
    changeText(series, yearly ? 1 : 12, "比一年前"),
    changeText(series, yearly ? 10 : 59, yearly ? "比十年前" : "比五年前"),
  ]
    .filter(Boolean)
    .join("；");
}

/** 日子换成年份上的位置（"2024" → 2024，"2024-07" → 2024.5）：折线按时间摆，空着的年份看得出来是空的。 */
export function timeOf(date: string): number {
  const m = date.match(/^(\d{4})(?:-(\d{2}))?/);
  if (!m) return 0;
  return Number(m[1]) + (m[2] ? (Number(m[2]) - 1) / 12 : 0);
}

/** 手填的年度数：最近一年过了一年多还没填新的，就该更新了。 */
export function needsUpdate(series: SlowSeries, now = new Date()): boolean {
  if (series.variable.source.type !== "table" || series.variable.frozen) return false;
  const last = series.points[series.points.length - 1];
  return !!last && timeOf(last.date) < now.getUTCFullYear() - 1;
}

