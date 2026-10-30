import {z} from 'zod';
import {SECTION_KEYS,type CaseSection,type ReportSource} from './report-domain';
import {BusinessReportValidationError,checkReportProse} from './report-rules';

const snapshotId=z.string().min(1),metricId=z.string().min(1);
const ref=z.object({snapshotId,quote:z.string().min(1).max(2000)}).strict();
const references=z.array(ref).max(10);
const observations=z.array(z.object({metricId,snapshotId}).strict()).max(50);
const section=z.object({key:z.enum(SECTION_KEYS),observations,interpretations:z.array(z.object({text:z.string().min(1).max(2000),refs:references,competingExplanation:z.string().min(1).max(2000),distinguishingObservation:z.string().min(1).max(2000)}).strict()).max(12),unknowns:z.array(z.string().min(1).max(1000)).max(20)}).strict();
const schema=z.object({sections:z.array(section).length(12)}).strict();
// Gemini rejects nested size bounds as too many decoding states; enforce those on save below.
export function businessReportOutputSchema(sources:ReportSource[]){
 const sourceIds=sources.map(source=>source.id),metricIds=[...new Set(sources.flatMap(source=>source.quantities.map(metric=>metric.id)))];
 return z.toJSONSchema(schema,{override:({jsonSchema,zodSchema})=>{
  delete jsonSchema.minItems;delete jsonSchema.maxItems;delete jsonSchema.minLength;delete jsonSchema.maxLength;
  if(zodSchema===snapshotId&&sourceIds.length)jsonSchema.enum=sourceIds;
  if(zodSchema===metricId&&metricIds.length)jsonSchema.enum=metricIds;
  if(zodSchema===observations)jsonSchema.maxItems=0;
  if(zodSchema===references&&!sources.some(source=>source.capturedText?.trim()))jsonSchema.maxItems=0;
 }});
}
const unsupportedAssertion=/(?:总体|整体|所有|全部|多数|大多|主要)(?:的)?(?:顾客|买家|客户|消费者)|(?:顾客|买家|客户|消费者)(?:主要|大多|多数|都是|均为|以.+为主)|真实利润|实际利润|净利润|盈利已|稳赚|\b(?:most|all|majority of) (?:buyers|customers|consumers)\b/i;
/** Checks structure and provenance, not whether an interpretation is causally true. */
export function parseBusinessReportStructure(value:unknown,sources:ReportSource[]):CaseSection[] {
 const parsed=schema.parse(value);const selected=new Map(sources.map(source=>[source.id,source]));
 if(selected.size!==sources.length||new Set(parsed.sections.map(s=>s.key)).size!==12)throw new Error('报告校验失败：章节或材料重复');
 return SECTION_KEYS.map(key=>parsed.sections.find(s=>s.key===key)!);
}
export function validateBusinessReport(value:unknown,sources:ReportSource[]):CaseSection[] {
 const sections=parseBusinessReportStructure(value,sources),selected=new Map(sources.map(source=>[source.id,source]));
 for(const s of sections){
  if(!s.observations.length&&!s.interpretations.length&&!s.unknowns.length)throw new Error('报告校验失败：空章节须明确未知');
  for(const observation of s.observations){const source=selected.get(observation.snapshotId);if(!source?.quantities.some(q=>q.id===observation.metricId))throw new BusinessReportValidationError('metric_source','observations','citation：未选择的来源或数值');}
  for(const interpretation of s.interpretations){
   for(const field of ['text','competingExplanation'] as const){
    if(!/^假设[：:]/.test(interpretation[field]))throw new BusinessReportValidationError('missing_hypothesis',field,'报告校验失败：解释必须明确标为假设');
    checkReportProse(interpretation[field],field,false);
    if(unsupportedAssertion.test(interpretation[field]))throw new BusinessReportValidationError('population_or_profit',field,'报告校验失败：未获支持的总体画像或利润断言');
   }
   checkReportProse(interpretation.distinguishingObservation,'distinguishingObservation',true);
   for(const reference of interpretation.refs){const source=selected.get(reference.snapshotId);if(!source?.capturedText?.includes(reference.quote))throw new BusinessReportValidationError('quote_source','refs','citation：原文或来源无法逐字核对');}
  }
  s.unknowns.forEach(text=>checkReportProse(text,'unknowns',s.key==='experiment'));
 }
 return sections;
}

export function renderSavedMetric(source:ReportSource,metricId:string):string {
 const q=source.quantities.find(metric=>metric.id===metricId);if(!q)throw new Error('数值来源不存在');
 const labels={pack_contents:'包装含量',units_per_order:'单次购买件数',displayed_sales:'平台显示销量',review_count:'评价数',repeat_mention:'复购提及'};
 const period=q.period.label??(q.period.from||q.period.to?`${q.period.from??'未知'}至${q.period.to??'未知'}`:'期间未知');
 return `${labels[q.metric]}：${q.raw}（${q.relation==='gte'?'下界':q.relation==='eq'?'原始记录':'数量关系未知'}；${period}；范围：${q.sampleScope}；单位：${q.unit}；归属：${q.attribution}）`;
}
