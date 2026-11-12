import {describe,expect,it} from 'vitest';
import {buildResearchStarter,adoptResearchDraft,researchDraftMatchesCases} from './starter';
import type {StarterCase} from './starter-types';

const makeCase=(n:number):StarterCase=>({id:`case-${n}`,name:`商家${n}`,date:'2026-11-12',merchantId:`merchant-${n}`,platform:'rakuten',sources:[{id:`source-${n}`,kind:'snapshot',title:'公开快照',text:'企业采购人员为员工购买礼品，公司支付。',url:'https://example.com',date:'2026-11-12'}],sourcesTruncated:false,report:{id:`report-${n}`,revision:2,sections:[{key:'buyers',observations:[],unknowns:[],interpretations:[{text:'购买者可能是企业采购人员',refs:[{snapshotId:`source-${n}`,quote:'企业采购人员为员工购买礼品'}],competingExplanation:'可能是自购',distinguishingObservation:'询问购买场景'}]}]}});

describe('research starter',()=>{
 it('requires the same ordered case selection before a carried draft can be saved',()=>{
  expect(researchDraftMatchesCases(['a','b'],['a','b'])).toBe(true);
  expect(researchDraftMatchesCases(['a','b'],['b','a'])).toBe(false);
  expect(researchDraftMatchesCases(['a'],['a','b'])).toBe(false);
  expect(researchDraftMatchesCases(['a','b'],['a','b'],true)).toBe(false);
 });
 it('carries selected cases and a source-backed report interpretation while leaving other fields unknown',()=>{
  const starter=buildResearchStarter('comparison',[makeCase(1),makeCase(2)],[]);
  expect(starter.cases.map(c=>c.id)).toEqual(['case-1','case-2']);
  expect(starter.hints).toHaveLength(2);
  expect(starter.hints[0]).toMatchObject({caseId:'case-1',reportId:'report-1',reportRevision:2,quote:'企业采购人员为员工购买礼品'});
  const dimensions=starter.draft.payload.dimensions as Record<string,unknown>[];
  expect(dimensions.find(d=>d.key==='buyer')?.left).toBe('报告解释（待核对）：购买者可能是企业采购人员');
  expect(dimensions.find(d=>d.key==='payer')?.left).toBe('');
  expect(dimensions.every(d=>d.leftSourceKey===null&&d.rightSourceKey===null)).toBe(true);
 });
 it('never attaches or confirms an excerpt until the user selects that hint',()=>{
  const starter=buildResearchStarter('comparison',[makeCase(1),makeCase(2)],[]);
  expect(adoptResearchDraft(starter,[]).sources).toEqual([]);
  const adopted=adoptResearchDraft(starter,[starter.hints[0].id]);
  expect(adopted.sources).toHaveLength(1);
  expect(adopted.sources[0]).toMatchObject({kind:'snapshot',id:'source-1',quote:'企业采购人员为员工购买礼品',publicConfirmed:true});
  const dimensions=adopted.payload.dimensions as Record<string,unknown>[];
  expect(dimensions.find(d=>d.key==='buyer')?.leftSourceKey).toBe(adopted.sources[0].key);
  expect(dimensions.find(d=>d.key==='buyer')?.rightSourceKey).toBeNull();
  expect(()=>adoptResearchDraft(starter,['foreign-hint'])).toThrow();
  expect(starter.draft.payload).not.toEqual(adopted.payload);
 });
 it('drops explanations with missing, changed, too-short or nonmember source quotes',()=>{
  for(const mutate of [(c:StarterCase)=>{c.sources=[];},(c:StarterCase)=>{c.sources[0].text='正文已经更改';},(c:StarterCase)=>{c.report!.sections[0].interpretations[0].refs[0].quote='企业';},(c:StarterCase)=>{c.report!.sections[0].interpretations[0].refs.push({snapshotId:'foreign',quote:'企业采购人员'});}]){
   const c=makeCase(1);mutate(c);const starter=buildResearchStarter('comparison',[c],[]);
   expect(starter.hints).toEqual([]);expect(JSON.stringify(starter.draft)).not.toContain('购买者可能');expect(starter.gaps.length).toBeGreaterThan(0);
  }
 });
 it('does not infer an exit, a demand conflict, constraints, experience or job linkage',()=>{
  for(const kind of ['failure','tension','apprenticeship'] as const){
   const c=makeCase(1);const starter=buildResearchStarter(kind,[c],[]);const draft=adoptResearchDraft(starter,[]);
   expect(draft.payload.confirmedDisclosure).not.toBe(true);expect(draft.payload.constraintsConfirmed).not.toBe(true);
   expect(draft.payload.leftNeed??'').toBe('');expect(draft.payload.timeBudget??'').toBe('');expect(draft.payload.jobLink??null).toBeNull();
  }
 });
 it('offers different merchants with explicit comparison caveats and bounded deterministic order',()=>{
  const current=makeCase(1);const same=makeCase(2);same.merchantId=current.merchantId;
  const starter=buildResearchStarter('comparison',[current],[current,same,...Array.from({length:12},(_,i)=>makeCase(i+3))]);
  expect(starter.candidates).toHaveLength(6);expect(starter.candidates.map(c=>c.id)).not.toContain(same.id);
  expect(starter.candidates[0].reason).toContain('不代表经营结构相同');
  expect(buildResearchStarter('comparison',[current],[]).candidates).toEqual([]);
 });
 it('surfaces missing publication and clipped material coverage without guessing',()=>{
  const c=makeCase(1);c.report=null;c.sourcesTruncated=true;
  const starter=buildResearchStarter('comparison',[c],[]);
  expect(starter.truncated).toBe(true);expect(starter.hints).toEqual([]);expect(starter.gaps.join(' ')).toContain('已发布');expect(starter.gaps.join(' ')).toContain('20');
 });
});
