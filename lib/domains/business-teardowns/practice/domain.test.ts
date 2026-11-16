import {describe,it,expect} from 'vitest';
import {parsePracticeCommand,practiceTemplate,practiceReceipt,parsePracticeStart,practiceVerifyTransition,practiceOutcomeAfterSave,practiceCreateRecoveryMatches} from './domain';
const id='10000000-0000-4000-8000-000000000001';
export const plan={caseId:id,reportId:null,apprenticeshipId:null,title:'制作报价单',objective:'暴露报价遗漏',deliverable:'一张练习报价单',checkMethod:'逐项核对输入与输出',plannedMinutes:45,constraints:'只用假设数，不冒充真实成本'};
describe('making practice contract',()=>{
 it('requires independently authored strict plan and bounded minutes',()=>{const parsed=parsePracticeCommand({operation:'plan',id,requestId:id,expectedRevision:0,plan});expect(parsed.operation==='plan'&&parsed.plan).toEqual(plan);for(const patch of [{score:8},{plannedMinutes:0},{reportId:'foreign'},{title:''}])expect(()=>parsePracticeCommand({operation:'plan',id,requestId:id,expectedRevision:0,plan:{...plan,...patch}})).toThrow();});
 it('rejects client supplied frozen plans and unsafe result URLs',()=>{const input={operation:'result',id,requestId:id,expectedRevision:1,result:{artifactDescription:'合成样例',artifactUrl:null,actualMinutes:30,obstacle:'漏了交付范围',nextChange:'先列不包含的事项'}};expect(parsePracticeCommand(input).operation).toBe('result');for(const extra of [{resultPlan:plan},{result:{...input.result,artifactUrl:'javascript:alert(1)'}},{result:{...input.result,actualMinutes:-1}}])expect(()=>parsePracticeCommand({...input,...extra})).toThrow();});
 it('offers four task-only templates without fabricated costs or outcomes',()=>{for(const key of ['quotation','suppliercomparison','orderprototype','custom'] as const){const draft=practiceTemplate(key);expect(draft.title).toBeTruthy();expect(draft).not.toHaveProperty('caseId');expect(draft).not.toHaveProperty('result');}expect(practiceTemplate('quotation').deliverable).toContain('待核对');});
 it('reuses stable request ids after lost responses and changes only with edited payload',()=>{const first=practiceReceipt(null,{title:'A'},()=>id);expect(practiceReceipt(first,{title:'A'},()=> 'other')).toEqual(first);expect(practiceReceipt(first,{title:'B'},()=> 'other').requestId).toBe('other');});
 it('ignores malformed or repeated start parameters',()=>{expect(parsePracticeStart({caseId:id,apprenticeshipId:id})).toEqual({caseId:id,apprenticeshipId:id});expect(parsePracticeStart({caseId:[id,id],apprenticeshipId:'x'})).toEqual({});});
 it('never passively rebases a dirty editor onto a newer remote revision',()=>{expect(practiceVerifyTransition({id,revision:2},{id,revision:3})).toBe('conflict');expect(practiceVerifyTransition({id,revision:2},{id,revision:2})).toBe('refresh');expect(practiceVerifyTransition({id,revision:2},null)).toBe('missing');});
 it('preserves unsaved outcome input while saving only a plan',()=>{const draft={artifactDescription:'未保存成果',artifactUrl:null,actualMinutes:22,obstacle:'卡点',nextChange:'修改'};expect(practiceOutcomeAfterSave('plan',draft,null)).toEqual(draft);expect(practiceOutcomeAfterSave('result',draft,{...draft,artifactDescription:'已保存'}).artifactDescription).toBe('已保存');});
 it('requires matching submitted plan and created revision before recovering a lost create response',()=>{
  const command=parsePracticeCommand({operation:'plan',id,requestId:id,expectedRevision:0,plan:{...plan,title:'  制作报价单  '}});
  expect(practiceCreateRecoveryMatches(command,{id,revision:1,plan})).toBe(true);
  expect(practiceCreateRecoveryMatches(command,{id,revision:2,plan})).toBe(false);
  expect(practiceCreateRecoveryMatches(command,{id,revision:1,plan:{...plan,title:'另一个页面修改的课题'}})).toBe(false);
  expect(practiceCreateRecoveryMatches(command,{id:'10000000-0000-4000-8000-000000000002',revision:1,plan})).toBe(false);
 });
 it('keeps a recovered-create comparison pending through matching passive focus reads',()=>{
  const command=parsePracticeCommand({operation:'plan',id,requestId:id,expectedRevision:0,plan});
  const recovered={id,revision:2,plan:{...plan,title:'另一个页面的修改'}};
  const comparisonPending=!practiceCreateRecoveryMatches(command,recovered);
  expect(comparisonPending).toBe(true);
  expect(practiceVerifyTransition(recovered,recovered,comparisonPending)).toBe('conflict');
  expect(practiceVerifyTransition(recovered,{...recovered,revision:3},comparisonPending)).toBe('conflict');
  expect(practiceVerifyTransition(recovered,recovered,false)).toBe('refresh');
 });
});
