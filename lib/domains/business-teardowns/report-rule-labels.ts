import type {ReportValidationRule,ReportDetailField} from './report-rules';
export const REPORT_RULE_LABELS:Record<ReportValidationRule,string>={numeric_claim:'未经核对的数值断言',fractional_claim:'未经核对的比例或分数量',flattery_or_score:'迎合、评分或保证性表述',population_or_profit:'未经支持的顾客总体或利润断言',missing_hypothesis:'解释未明确标为假设',metric_source:'来源或数值指针无法核对',quote_source:'来源或逐字引文无法核对'};
export const REPORT_FIELD_LABELS:Record<ReportDetailField,string>={text:'经营解释',competingExplanation:'竞争解释',distinguishingObservation:'区分问题',unknowns:'未知项或验证动作',observations:'数值引用',refs:'逐字引文'};
