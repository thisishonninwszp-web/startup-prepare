import {it,expect} from 'vitest';
import {fitBusinessReportArchive} from './report-archive';
import {SECTION_KEYS,type CaseSection} from './report-domain';
it('keeps retained prose while explicitly shortening diagnostic originals to fit the RPC byte budget',()=>{
 const sections:CaseSection[]=SECTION_KEYS.map(key=>({key,observations:[],interpretations:[],unknowns:['保留的正常内容'],validationDiagnostics:[{field:'unknowns',itemIndex:0,rule:'numeric_claim',detailField:'unknowns',rejectedText:'被拒绝的原文'.repeat(4500),truncated:false,validatorVersion:'business-validator-v2'}]}));
 const input={sections,model:'model',promptVersion:'v7'},lease={caseId:'case',requestId:'request'};
 const result=fitBusinessReportArchive(lease,input);expect(new TextEncoder().encode(JSON.stringify({...lease,report:result},null,1)).length).toBeLessThanOrEqual(180000);
 expect(result.sections.every(section=>section.unknowns[0]==='保留的正常内容')).toBe(true);expect(result.sections.some(section=>section.validationDiagnostics?.[0].truncated)).toBe(true);expect(input.sections[0].validationDiagnostics?.[0].truncated).toBe(false);
});
