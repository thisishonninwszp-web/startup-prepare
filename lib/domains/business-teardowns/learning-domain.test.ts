import {describe,it,expect} from 'vitest';
import {validateLearningInput,assessFollowup} from './learning-domain';
const id='00000000-0000-4000-8000-000000000001';
describe('business learning boundaries',()=>{
 it('requires explicit identity confirmation and both verification sources',()=>{
  expect(()=>validateLearningInput({operation:'identity',requestId:id,caseId:id,expectedVersion:0,leftMerchantId:id,rightMerchantId:id,reason:'同名'})).toThrow();
 });
 it('rejects backdated expectations and past deadlines',()=>{
  expect(()=>validateLearningInput({operation:'expectation',requestId:id,caseId:id,reportId:id,baselineSnapshotId:id,question:'销量',scope:'商品A',supportCriteria:'有购买',refuteCriteria:'无购买',deadline:'2000-01-01',madeAt:'1999-01-01'})).toThrow();
 });
 it('keeps failed retrieval and list absence unknown even when user asks support',()=>{
  expect(assessFollowup({outcome:'support',sameScopeConfirmed:true,quote:'上榜',accessStatus:'unavailable',coverage:'failed_fetch',due:true,afterPrediction:true})).toBe('unknown');
  expect(assessFollowup({outcome:'refute',sameScopeConfirmed:true,quote:'未列出',accessStatus:'public',coverage:'list_absence',due:true,afterPrediction:true})).toBe('unknown');
 });
 it('requires due date, later evidence, same scope and exact quote for conclusions',()=>{
  const base={outcome:'support' as const,sameScopeConfirmed:true,quote:'原文',accessStatus:'public' as const,coverage:'complete' as const,due:true,afterPrediction:true};
  expect(assessFollowup(base)).toBe('support');
  for(const patch of [{due:false},{afterPrediction:false},{sameScopeConfirmed:false},{quote:''}])expect(assessFollowup({...base,...patch})).toBe('unknown');
 });
});
