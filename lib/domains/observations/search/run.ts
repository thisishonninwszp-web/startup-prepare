import type { RunInput, TaskConfig } from "../domain";
import { parseSearchImport, type SearchContext, type SearchProvider } from "./imports";

export type SearchPurpose = "problem" | "solution" | "alternative" | "purchase";
type ResearchOptions = { purpose?: SearchPurpose; fixedPhrases?: string[]; exploratoryPhrases?: string[]; seeds?: TaskConfig["seeds"]; termMappings?: Record<string, string> };
export function buildSearchRun(provider: SearchProvider, rawText: string, context: SearchContext, research: ResearchOptions = {}): RunInput {
  const purpose = research.purpose ?? "problem";
  if (!["problem", "solution", "alternative", "purchase"].includes(purpose)) throw new Error("不支持的研究用途。");
  const preview = parseSearchImport(provider, rawText, context);
  if (!preview.canConfirm) throw new Error(preview.issues.map((item) => `${item.row ? `第${item.row}行：` : ""}${item.message}`).join("；") || "没有可导入的完整观测。");
  const allowed = new Set([...(research.fixedPhrases ?? []), ...(research.exploratoryPhrases ?? []), ...(research.seeds ?? []).map(s => s.text)]);
  const mappings = research.termMappings ?? {};
  if (!mappings || typeof mappings !== "object" || Array.isArray(mappings) || Object.keys(mappings).length > 100) throw new Error("词组映射无效。");
  for (const [label, target] of Object.entries(mappings)) if (typeof target !== "string" || !preview.points.some(p => p.term === label) || !allowed.has(target)) throw new Error("词组映射必须指向这版配置中明确的词组。");
  return {
    status: "success", resultState: preview.points.every(p => p.state === "missing") ? "unknown" : preview.points.every(p => p.state === "below_threshold") ? "suppressed" : "observed", parserVersion: "search-csv-v1",
    rawSnapshot: rawText, dataPeriod: context.timeframe, truncated: false,
    returnedScope: "用户导入的导出文件；未经本系统向来源在线核验，不代表全部搜索者。",
    requestConditions: { ...context, provider },
    providerMetadata: { provider, context, comparisonKey: preview.comparisonKey, exportMetadata: preview.exportMetadata, warnings: preview.warnings, authenticity: "user_imported", purpose, termMappings: mappings },
    records: preview.points.map((point) => ({
      title: `${point.term}${point.period ? ` · ${point.period}` : ""}`,
      text: `${point.term}：${point.rawValue || "缺失"}；${point.metric === "relative_interest" ? "相对关注指数，非人数/次数" : "平台估计的平均月搜索量，非独立人数"}`,
      origin: "manual", sourceUrl: null, publishedAt: null,
      metric: point.metric, value: point.value, unit: point.metric === "relative_interest" ? "index" : "estimated_searches_per_month",
      time: point.period ?? context.timeframe, region: context.region,
      data: { ...point, term: mappings[point.term] ?? point.term, providerLabel: point.term, termMapping: mappings[point.term] ? "user_confirmed" : "unchanged", purpose, observedOrigin: "provider_export", collectionSet: research.fixedPhrases?.includes(mappings[point.term] ?? point.term) ? "fixed" : research.exploratoryPhrases?.includes(mappings[point.term] ?? point.term) ? "exploratory" : "unassigned", seedOrigins: (research.seeds ?? []).filter(seed => seed.text === (mappings[point.term] ?? point.term)).map(seed => seed.origin) }, providerMetadata: { provider, language: context.language },
    })),
  };
}
