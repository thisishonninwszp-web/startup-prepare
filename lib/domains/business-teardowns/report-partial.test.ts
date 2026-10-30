import {describe,it,expect} from 'vitest';
import {filterBusinessReport,validateSavedBusinessReport} from './report-partial';
import {SECTION_KEYS,publicBusinessReport,type CaseRevision,type ReportSource} from './report-domain';
const report=()=>({sections:SECTION_KEYS.map(key=>({key,observations:[],interpretations:[],unknowns:['材料不足，待核对']}))});
const source={id:'selected',capturedText:'买3盒送朋友。',quantities:[{id:'pack'}]} as ReportSource;
const valid={text:'假设：赠礼可能是购买情境',refs:[{snapshotId:'selected',quote:'买3盒送朋友。'}],competingExplanation:'假设：也可能是自用囤货',distinguishingObservation:'访谈实际购买者'};
describe('partial business report',()=>{
 it('keeps valid items, discards whole invalid items and stores only fixed gap metadata',()=>{
  const input=report();Object.assign(input.sections[0],{observations:[{snapshotId:'selected',metricId:'pack'},{snapshotId:'private',metricId:'made-up'}],interpretations:[valid,{...valid,text:'假设：有300个买家私密正文'}],unknowns:['实际利润未知','有300个买家私密正文']});
  const result=filterBusinessReport(input,[source]);
  expect(result[0].interpretations).toEqual([valid]);expect(result[0].observations).toHaveLength(1);expect(result[0].unknowns).toEqual(['实际利润未知']);
  expect(result[0].validationGaps).toHaveLength(3);
  expect(result[0].validationDiagnostics).toHaveLength(3);expect(JSON.stringify(result[0].validationDiagnostics)).toContain('私密正文');
  const normal=publicBusinessReport({sections:result} as CaseRevision);expect(JSON.stringify(normal)).not.toContain('私密正文');expect(JSON.stringify(normal)).not.toContain('made-up');
  expect(validateSavedBusinessReport({sections:result},[source])).toEqual(result);
 });
 it('retains a classified gap when every item in a section is rejected',()=>{const input=report();input.sections[0].unknowns=['销量300单'];const result=filterBusinessReport(input,[]);expect(result[0].unknowns).toEqual([]);expect(result[0].validationGaps).toEqual([{field:'unknowns',reason:'content_rejected',rule:'numeric_claim',detailField:'unknowns',count:1}]);expect(result[0].validationDiagnostics?.[0]).toMatchObject({rule:'numeric_claim',detailField:'unknowns',itemIndex:0,rejectedText:'销量300单'});expect(validateSavedBusinessReport({sections:result},[])).toEqual(result);});
 it('rejects malformed structure, duplicate chapters and model supplied gap metadata',()=>{
  expect(()=>filterBusinessReport({sections:report().sections.slice(1)},[])).toThrow();
  const duplicate=report();duplicate.sections[0]=duplicate.sections[1];expect(()=>filterBusinessReport(duplicate,[])).toThrow();
  const forged=report();Object.assign(forged.sections[0],{validationGaps:[{field:'unknowns',reason:'content_rejected',count:1}]});expect(()=>filterBusinessReport(forged,[])).toThrow();
 });
 it('drops an interpretation with a fabricated quote and rechecks source ownership on save',()=>{
  const input=report();Object.assign(input.sections[0],{interpretations:[valid,{...valid,refs:[{snapshotId:'selected',quote:'不存在的引文'}]}]});
  const result=filterBusinessReport(input,[source]);expect(result[0].interpretations).toEqual([valid]);expect(()=>validateSavedBusinessReport({sections:result},[])).toThrow();
 });
 it('rejects free text in gap metadata and still rejects unfiltered unsafe saved content',()=>{
  const input=report();Object.assign(input.sections[0],{validationGaps:[{field:'unknowns',reason:'私密正文',count:1}]});expect(()=>validateSavedBusinessReport(input,[])).toThrow();
  const bad=report();bad.sections[0].unknowns=['销量300单'];expect(()=>validateSavedBusinessReport(bad,[])).toThrow();
 });
 it('keeps gap metadata on its chapter when saved input arrives out of order',()=>{const input=report();input.sections[0].unknowns=['销量300单'];const result=filterBusinessReport(input,[]);const reordered=[...result].reverse();const saved=validateSavedBusinessReport({sections:reordered},[]);expect(saved[0].validationGaps).toEqual(result[0].validationGaps);expect(saved[11].validationGaps).toBeUndefined();});
 it('preserves planned counts in the experiment chapter without misclassifying its context',()=>{const input=report();input.sections[11].unknowns=['访谈5人'];const result=filterBusinessReport(input,[]);expect(result[11].unknowns).toEqual(['访谈5人']);expect(result[11].validationGaps).toBeUndefined();});
});
