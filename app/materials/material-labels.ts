import type {
  MaterialDepartment,
  MaterialRouteTarget,
  MaterialSourceType,
  MaterialStatus,
} from "./types";

export const SOURCE_LABELS: Record<MaterialSourceType, string> = {
  text: "文本",
  url: "URL",
  file: "文件",
  customer_quote: "顾客话语",
  business_fragment: "供应商/成本/财务片段",
  emotion_fragment: "情绪/极限感片段",
};

export const STATUS_LABELS: Record<MaterialStatus, string> = {
  captured: "已捕捉",
  extracted: "已提取",
  drafted: "已起草",
  reviewed: "待朱批",
  confirmed: "已确认",
  parked: "暂存",
  rejected: "已驳回",
  summary_only: "仅存脱敏摘要",
  failed: "AI 审阅失败",
};

export const DEPARTMENT_LABELS: Record<MaterialDepartment, string> = {
  customer: "顾客部",
  company: "公司部",
  market: "市场部",
  judgment: "判断部",
  action: "行动部",
  self: "自我部",
};

export const ROUTE_LABELS: Record<MaterialRouteTarget, string> = {
  reality: "现状认识",
  customer_view: "顾客视点",
  company_kb: "公司档案",
  idea: "Idea",
  retrospective: "复盘",
  reasoning: "推理工具",
  decision_closure: "统一收束",
};

export function routeHref(target: MaterialRouteTarget): string {
  return {
    reality: "/reality",
    customer_view: "/customer-view",
    company_kb: "/company-kb",
    idea: "/ideas",
    retrospective: "/retrospectives",
    reasoning: "/reasoning",
    decision_closure: "/workbench",
  }[target];
}
