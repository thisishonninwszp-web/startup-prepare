import {z} from 'zod';
import {SECTION_KEYS,type CaseSection,type ReportSource,type ReportValidationGap} from './report-domain';
import {parseBusinessReportStructure,validateBusinessReport} from './report-validation';

const gaps=z.array(z.object({field:z.enum(['observations','interpretations','unknowns']),reason:z.enum(['citation_rejected','content_rejected']),count:z.number().int().min(1).max(50)}).strict()).min(1).max(6);
const fields=['observations','interpretations','unknowns'] as const;
const placeholder='本节尚无通过校验的内容';
function emptySections():CaseSection[]{return SECTION_KEYS.map(key=>({key,observations:[],interpretations:[],unknowns:[placeholder]}));}

/** Discard entire unsafe items; keep only fixed gap metadata, never rejected text. */
export function filterBusinessReport(value:unknown,sources:ReportSource[]):CaseSection[]{
 const sections=parseBusinessReportStructure(value,sources);
 return sections.map(section=>{
  if(!fields.some(field=>section[field].length))throw new Error('报告校验失败：空章节须明确未知');
  const clean:CaseSection={key:section.key,observations:[],interpretations:[],unknowns:[]};
  const rejected:ReportValidationGap[]=[];
  for(const field of fields)for(const item of section[field]){
   const trial=emptySections();Object.assign(trial[0],{[field]:[item]});
   try{
    validateBusinessReport({sections:trial},sources);
    if(field==='observations')clean.observations.push(item as CaseSection['observations'][number]);
    else if(field==='interpretations')clean.interpretations.push(item as CaseSection['interpretations'][number]);
    else clean.unknowns.push(item as string);
   }catch(error){
    if(!(error instanceof Error)||!(/^(?:citation：|报告校验失败：)/.test(error.message)))throw error;
    const reason=error instanceof Error&&error.message.startsWith('citation：')?'citation_rejected':'content_rejected';
    const existing=rejected.find(gap=>gap.field===field&&gap.reason===reason);
    if(existing)existing.count++;else rejected.push({field,reason,count:1});
   }
  }
  return rejected.length?{...clean,validationGaps:rejected}:clean;
 });
}

/** Recheck retained content against the post-call source manifest before saving. */
export function validateSavedBusinessReport(value:unknown,sources:ReportSource[]):CaseSection[]{
 const envelope=z.object({sections:z.array(z.unknown()).length(12)}).strict().parse(value);
 const metadata=envelope.sections.map(section=>{
  const candidate=z.object({validationGaps:gaps.optional()}).passthrough().parse(section);
  const {validationGaps,...content}=candidate;
  return {content,validationGaps};
 });
 const content=parseBusinessReportStructure({sections:metadata.map(item=>item.content)},sources);
 const byKey=new Map(metadata.map(item=>[item.content.key,item.validationGaps]));
 const checked=content.map(section=>({...section,unknowns:!fields.some(field=>section[field].length)&&byKey.get(section.key)?[placeholder]:section.unknowns}));
 validateBusinessReport({sections:checked},sources);
 return content.map(section=>byKey.get(section.key)?{...section,validationGaps:byKey.get(section.key)}:section);
}

export {hasBusinessReportGaps,canPublishBusinessReport} from './report-domain';
