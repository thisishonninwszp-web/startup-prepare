import {describe,it,expect} from 'vitest';
import {checkReportProse,BusinessReportValidationError} from './report-rules';
describe('business report prose rules',()=>{
 it.each(['访谈5人','计划访谈五位用户，核对购买情境','做一个访谈','比较两种解释','建议先比较两种解释'])('allows explicit planned action quantity: %s',text=>{expect(()=>checkReportProse(text,'distinguishingObservation',true)).not.toThrow();});
 it.each(['已经访谈5人','访谈5人发现销量300单','访谈5人均愿意付费','访谈5人中有人愿意付费','联系3位顾客都购买过产品','计划访谈5人均愿意付费','访谈5人，结果所有买家都愿意付费','每月销量300单','利润为半美元','计划访谈5人，月销一万单'])('never uses action wording to launder observed business figures: %s',text=>{expect(()=>checkReportProse(text,'distinguishingObservation',true)).toThrow();});
 it('does not allow action quantities in factual or hypothesis prose',()=>{expect(()=>checkReportProse('访谈5人','text',false)).toThrow();});
 it('identifies a fixed rule and field without putting rejected text in the error',()=>{try{checkReportProse('私密片段销量300单','unknowns',false);throw new Error('expected rejection');}catch(error){expect(error).toBeInstanceOf(BusinessReportValidationError);expect(error).toMatchObject({rule:'numeric_claim',detailField:'unknowns'});expect(String(error)).not.toContain('私密片段');}});
 it('keeps flattery blocked even alongside valid action plans',()=>{expect(()=>checkReportProse('访谈5人，这个想法很有潜力','distinguishingObservation',true)).toThrow();});
});
