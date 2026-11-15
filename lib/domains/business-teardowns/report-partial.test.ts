import {describe,it,expect} from 'vitest';
import {filterBusinessReport,validateSavedBusinessReport} from './report-partial';
import {SECTION_KEYS,publicBusinessReport,type CaseRevision,type ReportSource} from './report-domain';
const report=()=>({sections:SECTION_KEYS.map(key=>({key,observations:[],interpretations:[],unknowns:['材料不足，待核对']}))});
const source={id:'selected',capturedText:'买3盒送朋友。',quantities:[{id:'pack'}]} as ReportSource;
const valid={text:'假设：赠礼可能是购买情境',refs:[{snapshotId:'selected',quote:'买3盒送朋友。'}],competingExplanation:'假设：也可能是自用囤货',distinguishingObservation:'访谈实际购买者'};
describe('partial business report',()=>{
 it('quarantines misplaced section fields instead of losing the valid report',()=>{
  const input=report();Object.assign(input.sections[11],{distinguishingObservation:'访谈实际购买者'});
  const original=structuredClone(input);
  const result=filterBusinessReport(input,[]);
  expect(input).toEqual(original);
  expect(result[11].unknowns).toEqual(['材料不足，待核对']);
  expect(result[11]).not.toHaveProperty('distinguishingObservation');
  expect(result[11].validationGaps).toEqual([{field:'structure',reason:'content_rejected',count:1,rule:'unexpected_field',detailField:'section'}]);
  expect(result[11].validationDiagnostics?.[0]).toMatchObject({field:'structure',itemIndex:0,rule:'unexpected_field',detailField:'section',validatorVersion:'business-validator-v5',truncated:false});
  expect(JSON.parse(result[11].validationDiagnostics![0].rejectedText)).toEqual([{path:[],fields:{distinguishingObservation:'访谈实际购买者'}}]);
  expect(JSON.stringify(publicBusinessReport({sections:result} as CaseRevision))).not.toContain('访谈实际购买者');
  expect(validateSavedBusinessReport({sections:result},[])).toEqual(result);
 });
 it('retains a structural gap for an otherwise empty chapter without inventing prose',()=>{
  const input=report();input.sections[11].unknowns=[];Object.assign(input.sections[11],{distinguishingObservation:'访谈实际购买者'});
  const result=filterBusinessReport(input,[]);
  expect(result[11].unknowns).toEqual([]);expect(result[11].validationGaps).toHaveLength(1);
  expect(validateSavedBusinessReport({sections:result},[])).toEqual(result);
 });
 it('groups nested extra fields by chapter while still rejecting unsafe actual content',()=>{
  const input=report();Object.assign(input.sections[0],{interpretations:[{...valid,text:'假设：有300个买家',extra:'隐藏解释',refs:[{...valid.refs[0],extra:'隐藏引文'}]}]});
  const result=filterBusinessReport({sections:[...input.sections].reverse()},[source]);
  expect(result[0].interpretations).toEqual([]);
  expect(result[0].validationGaps?.map(gap=>gap.rule)).toEqual(['unexpected_field','numeric_claim']);
  expect(JSON.parse(result[0].validationDiagnostics![0].rejectedText)).toEqual(expect.arrayContaining([{path:['interpretations',0],fields:{extra:'隐藏解释'}},{path:['interpretations',0,'refs',0],fields:{extra:'隐藏引文'}}]));
  expect(validateSavedBusinessReport({sections:result},[source])).toEqual(result);
 });
 it('does not normalize saved content, root extras, missing fields or forged metadata',()=>{
  const extra=report();Object.assign(extra.sections[0],{unexpected:'不能直接存'});
  expect(()=>validateSavedBusinessReport(extra,[])).toThrow();
  expect(()=>filterBusinessReport({...extra,unexpected:'根字段'},[])).toThrow();
  const missing=report();Object.assign(missing.sections[0],{unknowns:undefined,extra:'不修复核心结构'});expect(()=>filterBusinessReport(missing,[])).toThrow();
  for(const field of ['validationGaps','validationDiagnostics','factCoverage']){
   const forged=report();Object.assign(forged.sections[0],{[field]:[]});expect(()=>filterBusinessReport(forged,[])).toThrow();
  }
 });
 it('keeps uniqueness and nested required fields strict after quarantining extras',()=>{
  const duplicate=report();duplicate.sections[0]=duplicate.sections[1];Object.assign(duplicate.sections[2],{extra:'多余'});
  expect(()=>filterBusinessReport(duplicate,[])).toThrow();
  const input=report();Object.assign(input.sections[0],{extra:'多余'});
  expect(()=>filterBusinessReport(input,[source,source])).toThrow();
  Object.assign(input.sections[0],{interpretations:[{text:'假设：无法自动补出缺少的解释',extra:'多余'}]});
  expect(()=>filterBusinessReport(input,[])).toThrow();
 });
 it('bounds quarantined originals with a visible truncation flag',()=>{
  const input=report();Object.assign(input.sections[0],{extra:'公开但不合结构'.repeat(6000)});
  const result=filterBusinessReport(input,[]),diagnostic=result[0].validationDiagnostics![0];
  expect(diagnostic.rejectedText.length).toBeLessThanOrEqual(32000);expect(diagnostic.truncated).toBe(true);
  expect(validateSavedBusinessReport({sections:result},[])).toEqual(result);
 });
 it.each(['business-validator-v2','business-validator-v3','business-validator-v4'])('keeps archived diagnostics unchanged under %s',version=>{
  const input=report();input.sections[0].unknowns=['销量300单'];const saved=filterBusinessReport(input,[]);
  saved[0].validationDiagnostics![0].validatorVersion=version;
  expect(validateSavedBusinessReport({sections:saved},[])).toEqual(saved);
  expect(saved[0].unknowns).toEqual([]);
  expect(saved[0].validationDiagnostics![0].rejectedText).toBe('销量300单');
 });
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
