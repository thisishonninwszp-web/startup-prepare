export const REPORT_VALIDATION_RULES=['numeric_claim','fractional_claim','flattery_or_score','population_or_profit','missing_hypothesis','metric_source','quote_source'] as const;
export type ReportValidationRule=typeof REPORT_VALIDATION_RULES[number];
export const REPORT_VALIDATOR_VERSION='business-validator-v3';
export const REPORT_DETAIL_FIELDS=['text','competingExplanation','distinguishingObservation','unknowns','observations','refs'] as const;
export type ReportDetailField=typeof REPORT_DETAIL_FIELDS[number];
export class BusinessReportValidationError extends Error{
 constructor(readonly rule:ReportValidationRule,readonly detailField:ReportDetailField,message:string){super(message);this.name='BusinessReportValidationError';}
}
const prohibited=/很有潜力|不错的想法|前景广阔|照做能成功|值得投资|想法评分|机会评分|评分|星级|score|rating/i;
const quantitative=/[\p{N}%％]|[零〇壹贰叁肆伍陆柒捌玖拾佰仟二三四五六七八九十百千万亿两]|一(?=[个件枚袋盒包人单成倍万元千百十])|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|percent|dozen)\b/iu;
const fractional=/过半|一半|半(?:数|成(?!品)|价|折|个|件|枚|袋|盒|包|人|单|倍|美?元|日元|欧元|英镑|年|月|天|日|小时|分钟|公斤|斤|份)|\b(?:half|halves|quarter|quarters)\b/iu;
const actionPrefix='(?:(?:建议|计划|准备|尝试|需要|先|请|可以|拟)\\s*)*';
const interview=new RegExp(`^${actionPrefix}(?:访谈|访问|联系|询问|采访)\\s*[0-9一二三四五六七八九十百两]{1,3}\\s*(?:位|名|个)?(?:受访者|用户|顾客|买家|人)`,'u');
const smallTest=new RegExp(`^${actionPrefix}(?:做|安排|开展|进行)(?:一|1)(?:次|个)(?:访谈|小实验|实验|测试)`,'u');
const compare=new RegExp(`^${actionPrefix}(?:比较|对照|核对)(?:两|二|2)(?:种|个)(?:解释|假设|方案)`,'u');

// Only an imperative/future action prefix may carry a sample count; observed outcomes never qualify.
function withoutPlannedCounts(text:string):string{
 if(/已经|已完成|曾经|结果|发现|显示|证明|成交|占比|支付了|付了/.test(text))return text;
 return text.split(/([。；;！？!?])/u).map(clause=>{
  const researchPrefix=clause.trimStart().match(/^(?:(?:建议|计划|准备|尝试|需要|先|请|可以|拟)\s*)*对[^，,。；;]{1,40}(?:进行|开展)(?:市场调研|调研|核对|验证)[，,]\s*/u)?.[0]??'';
  const trimmed=clause.trimStart().slice(researchPrefix.length);
  for(const pattern of [interview,smallTest,compare]){
   const match=trimmed.match(pattern);if(!match)continue;
   const continuation=trimmed.slice(match[0].length).trim();
   if(!continuation||/^[，,]\s*(?:核对|了解|询问|比较|观察|记录|收集|确认|检验|验证|测试|排查|辨别)/.test(continuation))return `${researchPrefix}开展核对${continuation}`;
  }
  return clause;
 }).join('');
}
export function checkReportProse(text:string,field:ReportDetailField,allowPlannedActions:boolean):void{
 if(prohibited.test(text))throw new BusinessReportValidationError('flattery_or_score',field,'报告校验失败：自由文字含数值、迎合或评分');
 const qualitative=text.replace(/第三方|三方物流/g,'外部').replace(/零部件/g,'部件').replace(/一个(?:普遍的)?特征/g,'定性特征');
 const checked=allowPlannedActions?withoutPlannedCounts(qualitative):qualitative;
 if(quantitative.test(checked))throw new BusinessReportValidationError('numeric_claim',field,'报告校验失败：自由文字含数值、迎合或评分');
 if(fractional.test(checked))throw new BusinessReportValidationError('fractional_claim',field,'报告校验失败：自由文字含数值、迎合或评分');
}
