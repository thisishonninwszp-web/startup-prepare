import {ZodError} from 'zod';
import type {CaseSection,ReportSource} from './report-domain';
import {parseBusinessReportStructure} from './report-validation';

type RejectedFields={path:(string|number)[];fields:Record<string,unknown>};
const reserved=new Set(['validationGaps','validationDiagnostics','factCoverage']);

/** Only model responses may quarantine extra fields; saved reports remain strictly parsed. */
export function parseBusinessModelStructure(value:unknown,sources:ReportSource[]):{
 sections:CaseSection[];rejected:Map<CaseSection['key'],RejectedFields[]>;
}{
 try{return {sections:parseBusinessReportStructure(value,sources),rejected:new Map()};}
 catch(error){
  if(!(error instanceof ZodError)||!error.issues.length)throw error;
  for(const issue of error.issues){
   if(issue.code!=='unrecognized_keys'||issue.path[0]!=='sections'||typeof issue.path[1]!=='number'||issue.path[1]<0||issue.path[1]>=12||issue.keys.some(key=>reserved.has(key)))throw error;
  }
  const candidate=structuredClone(value) as {sections:Record<string,unknown>[]};
  const byIndex=new Map<number,RejectedFields[]>();
  for(const issue of error.issues){
   if(issue.code!=='unrecognized_keys')throw error;
   let target:unknown=candidate;
   for(const part of issue.path){
    if((typeof part!=='string'&&typeof part!=='number')||!target||typeof target!=='object'||!Object.hasOwn(target,part))throw error;
    target=(target as Record<string|number,unknown>)[part];
   }
   const object=target as Record<string,unknown>;
   const fields=Object.fromEntries(issue.keys.map(key=>[key,object[key]]));
   for(const key of issue.keys)delete object[key];
   const index=issue.path[1] as number;
   const entries=byIndex.get(index)??[];
   entries.push({path:issue.path.slice(2) as (string|number)[],fields});
   byIndex.set(index,entries);
  }
  // Re-run all shape, chapter uniqueness and source checks after removing only those keys.
  const sections=parseBusinessReportStructure(candidate,sources);
  return {sections,rejected:new Map([...byIndex].map(([index,entries])=>[candidate.sections[index].key as CaseSection['key'],entries]))};
 }
}
