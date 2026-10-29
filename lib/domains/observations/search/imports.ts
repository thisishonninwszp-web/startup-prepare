export type SearchProvider = "trends_web" | "ads_planner";
export type SearchContext = { region: string; language: string; timeframe: string };
export type SearchPoint = {
  term: string; period: string | null; metric: "relative_interest" | "avg_monthly_searches";
  value: number | null; lowerBound: number | null; upperBound: number | null;
  state: "value" | "below_threshold" | "range" | "missing"; rawValue: string;
};
export type SearchImportPreview = {
  provider: SearchProvider; context: SearchContext; points: SearchPoint[];
  issues: { row: number; message: string }[]; warnings: string[]; canConfirm: boolean; comparisonKey: string; exportMetadata: string[][];
};

export function decodeSearchFile(bytes: Uint8Array): string {
  if (bytes.byteLength > 500000) throw new Error("文件超过500000字节，请缩小导出范围。");
  const encoding = bytes[0] === 255 && bytes[1] === 254 ? "utf-16le" : bytes[0] === 254 && bytes[1] === 255 ? "utf-16be" : "utf-8";
  try { return new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch { throw new Error("无法解码文件，请使用UTF-8或带BOM的UTF-16导出。"); }
}

/** Bounded CSV/TSV reader. Quoted newlines and escaped quotes are supported. */
function readTable(text: string): string[][] {
  if (text.length > 250000) throw new Error("文件超过250000字符，请缩小导出范围。");
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const delimiter = lines.split("\n").some((line) => /^(Keyword|キーワード)\t/.test(line)) ? "\t" : ",";
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false, closed = false;
  function pushCell() { if (cell.length > 10000) throw new Error("单元格过长。"); row.push(cell.trim()); cell = ""; closed = false; if (row.length > 32) throw new Error("最多支持32列。"); }
  function pushRow() { pushCell(); if (row.some(Boolean)) rows.push(row); row = []; if (rows.length > 1020) throw new Error("一次最多导入1000个数据行。"); }
  for (let i = 0; i < lines.length; i++) {
    const c = lines[i];
    if (quoted) { if (c === '"') { if (lines[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } } else cell += c; }
    else if (c === delimiter) pushCell();
    else if (c === "\n") pushRow();
    else if (c === '"') { if (cell.trim() || closed) throw new Error("引号位置不正确。"); cell = ""; quoted = true; }
    else { if (closed && c.trim()) throw new Error("闭合引号之后存在多余内容。"); cell += c; }
  }
  if (quoted) throw new Error("存在未闭合引号。");
  if (cell || row.length) pushRow();
  return rows;
}

const TREND_HEADERS = ["Week", "Day", "Month", "週", "日", "月"];
const ADS_TERMS = ["Keyword", "キーワード"];
const ADS_METRICS = ["Avg. monthly searches", "月間平均検索ボリューム"];
function validPeriod(value: string) {
  if (/^\d{4}-\d{2}$/.test(value)) return +value.slice(0, 4) >= 1900 && +value.slice(5) >= 1 && +value.slice(5) <= 12;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function numeric(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.includes(",") && !/^\d{1,3}(?:,\d{3})+(?:\.\d+)?[KMB]?$/i.test(trimmed)) return null;
  const value = trimmed.replaceAll(",", "");
  const m = /^(\d+(?:\.\d+)?)([KMB])?$/i.exec(value); if (!m) return null;
  const num = +m[1] * ({ K: 1000, M: 1000000, B: 1000000000 }[m[2]?.toUpperCase()] ?? 1);
  return Number.isFinite(num) && num <= Number.MAX_SAFE_INTEGER ? num : null;
}
function parseValue(rawValue: string, trend: boolean): Pick<SearchPoint, "value" | "lowerBound" | "upperBound" | "state" | "rawValue"> {
  const empty = { value: null, lowerBound: null, upperBound: null, rawValue };
  if (["", "—", "–", "-", "--", "N/A"].includes(rawValue)) return { ...empty, state: "missing" };
  if (trend && /^<\s*1$/.test(rawValue)) return { ...empty, state: "below_threshold", upperBound: 1 };
  if (!trend) {
    const range = /^(.*?)\s*[-–—]\s*(.*?)$/.exec(rawValue);
    if (range) { const lo = numeric(range[1]), hi = numeric(range[2]); if (lo == null || hi == null || hi < lo) throw new Error("搜索量区间无效。"); return { ...empty, lowerBound: lo, upperBound: hi, state: "range" }; }
  }
  const value = trend && !/^\d+$/.test(rawValue) ? null : numeric(rawValue);
  if (value == null || (trend && (value > 100 || !Number.isInteger(value))) || (!trend && !Number.isSafeInteger(value))) throw new Error(trend ? "趋势值必须为0–100、<1或缺失。" : "搜索量必须为非负整数、区间或缺失。");
  return { ...empty, value, state: "value" };
}

export function parseSearchImport(provider: SearchProvider, text: string, context: SearchContext): SearchImportPreview {
  const result: SearchImportPreview = { provider, context, points: [], issues: [], warnings: [], canConfirm: false, comparisonKey: "", exportMetadata: [] };
  try {
    if (!["trends_web", "ads_planner"].includes(provider)) throw new Error("不支持的导出来源。");
    if (![context.region, context.language, context.timeframe].every((v) => typeof v === "string" && v.trim() && v.length <= 200)) throw new Error("请明确填写地区、语言和导出时间范围。");
    const rows = readTable(text); const trend = provider === "trends_web";
    const headerAt = rows.findIndex((row) => trend ? TREND_HEADERS.includes(row[0]) && row.length > 1 : ADS_TERMS.includes(row[0]) && row.some((v) => ADS_METRICS.includes(v)));
    if (headerAt < 0) throw new Error("无法识别格式。支持Google Trends时间序列CSV和含Keyword/Avg. monthly searches（或日文对应列）的关键词规划CSV/TSV。");
    const header = rows[headerAt];
    result.exportMetadata = rows.slice(0, headerAt);
    if (header.some((v) => !v) || new Set(header).size !== header.length) throw new Error("列标题为空或重复，请检查导出。");
    if (header.some(v => v.length > 500)) throw new Error("列标题超过500字符，请缩小导出范围。");
    const metricAt = trend ? -1 : header.findIndex((v) => ADS_METRICS.includes(v));
    const data = rows.slice(headerAt + 1); if (!data.length || data.length > 1000) throw new Error("需包含1–1000个数据行。");
    const seen = new Set<string>();
    for (let i = 0; i < data.length; i++) {
      const row = data[i]; const number = headerAt + i + 2;
      try {
        if (row.length !== header.length) throw new Error("数据列数与标题不一致。");
        if (trend && !validPeriod(row[0])) throw new Error("日期无效，需YYYY-MM-DD或YYYY-MM。");
        if (!trend && (!row[0] || row[0].length > 500)) throw new Error("关键词为空或过长。");
        const items = trend ? header.slice(1).map((term, idx) => ({ term, raw: row[idx + 1] })) : [{ term: row[0], raw: row[metricAt] }];
        const parsed = items.map(({ term, raw }) => ({ term, period: trend ? row[0] : null, metric: trend ? "relative_interest" as const : "avg_monthly_searches" as const, ...parseValue(raw, trend) }));
        for (const point of parsed) { const key = JSON.stringify([point.term, point.period]); if (seen.has(key)) throw new Error("同一关键词和日期出现重复记录。"); }
        for (const point of parsed) { seen.add(JSON.stringify([point.term, point.period])); result.points.push(point); }
      } catch (error) { result.issues.push({ row: number, message: error instanceof Error ? error.message : "该行无法读取。" }); }
    }
    if (result.points.length > 500) throw new Error("展开后最多支持500条观测，请缩小范围。");
    const terms = [...new Set(result.points.map((p) => p.term))].sort();
    result.comparisonKey = JSON.stringify({ provider, ...context, exportMetadata: result.exportMetadata, terms, periods: [...new Set(result.points.map((p) => p.period))].sort(), normalization: trend ? "web_export_scope" : "provider_estimate" });
    result.warnings = trend ? ["这是导出范围内的相对关注指数，不是搜索次数或人数；换词组、地区和时间范围后不能直接拼接。"] : ["搜索量为平台口径下的估计，可能合并近似词；平均月量不代表每天搜索量、独立人数或付费意愿。"];
    if (result.points.some((p) => p.state === "missing")) result.warnings.push("有缺失值；保持未知，不按0处理。");
    if (result.issues.length) result.warnings.push("存在无法读取的行，修正后才能确认，当前预览不是完整数据。");
    result.canConfirm = result.points.length > 0 && result.issues.length === 0;
  } catch (error) { result.issues.push({ row: 0, message: error instanceof Error ? error.message : "读取失败。" }); }
  return result;
}

export function compareSearchImports(a: SearchImportPreview, b: SearchImportPreview): { comparable: boolean; reason: string } {
  if (!a.canConfirm || !b.canConfirm) return { comparable: false, reason: "至少一份导入尚未通过完整性检查。" };
  if (a.comparisonKey !== b.comparisonKey) return { comparable: false, reason: "来源、地区、语言、范围、日期或对照词组不同，不能直接比较。" };
  return { comparable: true, reason: "采集口径一致，可并列核对；平台估计和修订仍可能变化。" };
}
