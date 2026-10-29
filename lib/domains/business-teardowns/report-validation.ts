import {z} from 'zod';
import {SECTION_KEYS,type CaseSection,type ReportSource} from './report-domain';

const ref=z.object({snapshotId:z.string().min(1),quote:z.string().min(1).max(2000)}).strict();
const section=z.object({key:z.enum(SECTION_KEYS),observations:z.array(z.object({metricId:z.string().min(1),snapshotId:z.string().min(1)}).strict()).max(50),interpretations:z.array(z.object({text:z.string().min(1).max(2000),refs:z.array(ref).max(10),competingExplanation:z.string().min(1).max(2000),distinguishingObservation:z.string().min(1).max(2000)}).strict()).max(12),unknowns:z.array(z.string().min(1).max(1000)).max(20)}).strict();
const schema=z.object({sections:z.array(section).length(12)}).strict();
// Gemini rejects nested size bounds as too many decoding states; enforce those on save below.
export const BUSINESS_REPORT_OUTPUT_SCHEMA=z.toJSONSchema(schema,{override:({jsonSchema})=>{
 delete jsonSchema.minItems;delete jsonSchema.maxItems;delete jsonSchema.minLength;delete jsonSchema.maxLength;
}});
const prohibited=/很有潜力|不错的想法|前景广阔|照做能成功|值得投资|想法评分|机会评分|评分|星级|score|rating/i;
const unsupportedAssertion=/(?:总体|整体|所有|全部|多数|大多|主要)(?:的)?(?:顾客|买家|客户|消费者)|(?:顾客|买家|客户|消费者)(?:主要|大多|多数|都是|均为|以.+为主)|真实利润|实际利润|净利润|盈利已|稳赚|\b(?:most|all|majority of) (?:buyers|customers|consumers)\b/i;
// Free prose cannot carry quantities; exact source quotations and typed observations are separate fields.
const quantitative=/[\p{N}%％]|[零〇壹贰叁肆伍陆柒捌玖拾佰仟二三四五六七八九十百千万亿两]|一(?=[个件枚袋盒包人单成倍万元千百十])|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|percent|dozen)\b/iu;
const fractional=/过半|一半|半(?:数|成(?!品)|价|折|个|件|枚|袋|盒|包|人|单|倍|美?元|日元|欧元|英镑|年|月|天|日|小时|分钟|公斤|斤|份)|\b(?:half|halves|quarter|quarters)\b/iu;
function prose(text:string):void {
 // These fixed business terms describe an external party, not an observed quantity.
 const quantityText=text.replace(/第三方|三方物流/g,'外部');
 if(prohibited.test(text)||quantitative.test(quantityText)||fractional.test(quantityText))throw new Error('报告校验失败：自由文字含数值、迎合或评分');
}

/** Checks structure and provenance, not whether an interpretation is causally true. */
export function validateBusinessReport(value:unknown,sources:ReportSource[]):CaseSection[] {
 const parsed=schema.parse(value);const selected=new Map(sources.map(source=>[source.id,source]));
 if(selected.size!==sources.length||new Set(parsed.sections.map(s=>s.key)).size!==12)throw new Error('报告校验失败：章节或材料重复');
 for(const s of parsed.sections){
  if(!s.observations.length&&!s.interpretations.length&&!s.unknowns.length)throw new Error('报告校验失败：空章节须明确未知');
  for(const observation of s.observations){const source=selected.get(observation.snapshotId);if(!source?.quantities.some(q=>q.id===observation.metricId))throw new Error('citation：未选择的来源或数值');}
  for(const interpretation of s.interpretations){
   if(!/^假设[：:]/.test(interpretation.text)||!/^假设[：:]/.test(interpretation.competingExplanation))throw new Error('报告校验失败：解释必须明确标为假设');
   [interpretation.text,interpretation.competingExplanation,interpretation.distinguishingObservation].forEach(prose);
   if([interpretation.text,interpretation.competingExplanation].some(text=>unsupportedAssertion.test(text)))throw new Error('报告校验失败：未获支持的总体画像或利润断言');
   for(const reference of interpretation.refs){const source=selected.get(reference.snapshotId);if(!source?.capturedText?.includes(reference.quote))throw new Error('citation：原文或来源无法逐字核对');}
  }
  s.unknowns.forEach(prose);
 }
 return SECTION_KEYS.map(key=>parsed.sections.find(s=>s.key===key)!);
}

export function renderSavedMetric(source:ReportSource,metricId:string):string {
 const q=source.quantities.find(metric=>metric.id===metricId);if(!q)throw new Error('数值来源不存在');
 const labels={pack_contents:'包装含量',units_per_order:'单次购买件数',displayed_sales:'平台显示销量',review_count:'评价数',repeat_mention:'复购提及'};
 const period=q.period.label??(q.period.from||q.period.to?`${q.period.from??'未知'}至${q.period.to??'未知'}`:'期间未知');
 return `${labels[q.metric]}：${q.raw}（${q.relation==='gte'?'下界':q.relation==='eq'?'原始记录':'数量关系未知'}；${period}；范围：${q.sampleScope}；单位：${q.unit}；归属：${q.attribution}）`;
}
