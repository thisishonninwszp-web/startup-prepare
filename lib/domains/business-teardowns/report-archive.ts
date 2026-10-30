import type {CaseSection} from './report-domain';
type ReportDraft={sections:CaseSection[];model:string|null;promptVersion:string|null};
const byteLength=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value,null,1)).length;
/** Keep ordinary report content intact; shorten only diagnostic text with an explicit flag. */
export function fitBusinessReportArchive(envelope:object,input:ReportDraft):ReportDraft{
 const report={...input,sections:input.sections.map(section=>({...section,...(section.validationDiagnostics?{validationDiagnostics:section.validationDiagnostics.map(item=>({...item}))}:{})}))};
 const size=()=>byteLength({...envelope,report});
 if(size()<=180000)return report;
 const items=report.sections.flatMap(section=>section.validationDiagnostics??[]).reverse();
 for(const item of items){
  const original=Array.from(item.rejectedText);item.rejectedText='';item.truncated=true;
  if(size()>180000)continue;
  let low=0,high=original.length;
  while(low<high){const middle=Math.ceil((low+high)/2);item.rejectedText=original.slice(0,middle).join('');if(size()<=180000)low=middle;else high=middle-1;}
  item.rejectedText=original.slice(0,low).join('');return report;
 }
 if(size()>180000)throw new Error('报告超过可保存容量，未保存新报告；请减少选定材料后重新确认生成');
 return report;
}
