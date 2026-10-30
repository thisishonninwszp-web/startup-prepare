import {z} from 'zod';
import {SECTION_KEYS,type CaseSection,type ReportSource,type ReportValidationGap,type ReportValidationDiagnostic} from './report-domain';
import {parseBusinessReportStructure,validateBusinessReport} from './report-validation';
import {BusinessReportValidationError,REPORT_VALIDATION_RULES,REPORT_DETAIL_FIELDS} from './report-rules';

const fieldSchema=z.enum(['observations','interpretations','unknowns']);
const gaps=z.array(z.object({field:fieldSchema,reason:z.enum(['citation_rejected','content_rejected']),count:z.number().int().min(1).max(50),rule:z.enum(REPORT_VALIDATION_RULES).optional(),detailField:z.enum(REPORT_DETAIL_FIELDS).optional()}).strict()).min(1).max(42);
const diagnostics=z.array(z.object({field:fieldSchema,itemIndex:z.number().int().min(0).max(49),rule:z.enum(REPORT_VALIDATION_RULES),detailField:z.enum(REPORT_DETAIL_FIELDS),rejectedText:z.string().max(32000),truncated:z.boolean(),validatorVersion:z.literal('business-validator-v2')}).strict()).min(1).max(82);
const fields=['observations','interpretations','unknowns'] as const;
const placeholder='本节尚无通过校验的内容';
function emptySections():CaseSection[]{return SECTION_KEYS.map(key=>({key,observations:[],interpretations:[],unknowns:[placeholder]}));}

/** Exclude rejected items from prose; retain them only in the separate owner diagnostic field. */
export function filterBusinessReport(value:unknown,sources:ReportSource[]):CaseSection[]{
 const sections=parseBusinessReportStructure(value,sources);
 return sections.map(section=>{
  if(!fields.some(field=>section[field].length))throw new Error('报告校验失败：空章节须明确未知');
  const clean:CaseSection={key:section.key,observations:[],interpretations:[],unknowns:[]};
  const rejected:ReportValidationGap[]=[];
  const retainedDiagnostics:ReportValidationDiagnostic[]=[];
  for(const field of fields)for(const [itemIndex,item] of section[field].entries()){
   const trial=emptySections();Object.assign(trial.find(candidate=>candidate.key===section.key)!,{[field]:[item]});
   try{
    validateBusinessReport({sections:trial},sources);
    if(field==='observations')clean.observations.push(item as CaseSection['observations'][number]);
    else if(field==='interpretations')clean.interpretations.push(item as CaseSection['interpretations'][number]);
    else clean.unknowns.push(item as string);
   }catch(error){
    if(!(error instanceof BusinessReportValidationError))throw error;
    const reason=error.rule==='metric_source'||error.rule==='quote_source'?'citation_rejected':'content_rejected';
    const existing=rejected.find(gap=>gap.field===field&&gap.rule===error.rule&&gap.detailField===error.detailField);
    if(existing)existing.count++;else rejected.push({field,reason,rule:error.rule,detailField:error.detailField,count:1});
    const original=typeof item==='string'?item:JSON.stringify(item);
    const rejectedText=original.slice(0,32000).replace(/[\uD800-\uDBFF]$/,'');
    retainedDiagnostics.push({field,itemIndex,rule:error.rule,detailField:error.detailField,rejectedText,truncated:original.length>rejectedText.length,validatorVersion:'business-validator-v2'});
   }
  }
  return rejected.length?{...clean,validationGaps:rejected,validationDiagnostics:retainedDiagnostics}:clean;
 });
}

/** Recheck retained content against the post-call source manifest before saving. */
export function validateSavedBusinessReport(value:unknown,sources:ReportSource[]):CaseSection[]{
 const envelope=z.object({sections:z.array(z.unknown()).length(12)}).strict().parse(value);
 const metadata=envelope.sections.map(section=>{
  const candidate=z.object({validationGaps:gaps.optional(),validationDiagnostics:diagnostics.optional(),factCoverage:z.object({displayed:z.number().int().min(0).max(50),available:z.number().int().min(51).max(3000)}).strict().optional()}).passthrough().parse(section);
  const {validationGaps,validationDiagnostics,factCoverage,...content}=candidate;
  if(validationDiagnostics){
   if(new Set(validationDiagnostics.map(item=>`${item.field}:${item.itemIndex}`)).size!==validationDiagnostics.length)throw new Error('诊断条目重复');
   for(const gap of validationGaps??[])if(validationDiagnostics.filter(item=>item.field===gap.field&&item.rule===gap.rule&&item.detailField===gap.detailField).length!==gap.count)throw new Error('诊断与缺口数量不符');
   if(!validationGaps||validationGaps.reduce((count,gap)=>count+gap.count,0)!==validationDiagnostics.length)throw new Error('诊断缺少对应缺口');
  }
  return {content,validationGaps,validationDiagnostics,factCoverage};
 });
 const content=parseBusinessReportStructure({sections:metadata.map(item=>item.content)},sources);
 const byKey=new Map(metadata.map(item=>[item.content.key,item]));
 const checked=content.map(section=>({...section,unknowns:!fields.some(field=>section[field].length)&&byKey.get(section.key)?.validationGaps?[placeholder]:section.unknowns}));
 for(const section of content){const coverage=byKey.get(section.key)?.factCoverage;if(coverage&&coverage.displayed!==section.observations.length)throw new Error('事实覆盖数量不符');}
 validateBusinessReport({sections:checked},sources);
 return content.map(section=>{const item=byKey.get(section.key)!;return {...section,...(item.validationGaps?{validationGaps:item.validationGaps}:{}),...(item.validationDiagnostics?{validationDiagnostics:item.validationDiagnostics}:{}),...(item.factCoverage?{factCoverage:item.factCoverage}:{})};});
}

export {hasBusinessReportGaps,canPublishBusinessReport} from './report-domain';
