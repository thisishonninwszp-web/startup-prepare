import {describe,it,expect} from 'vitest';
import {checkReportProse,BusinessReportValidationError} from './report-rules';
describe('business report prose rules',()=>{
 it('accepts an archived future description-comparison plan without exempting quantities inside its labels',()=>{
  const plan='针对“新品”宣称，可以进行A/B测试，比较突出“新品”和突出“功能”两种描述对转化率的影响';expect(()=>checkReportProse(plan,'unknowns',true)).not.toThrow();expect(()=>checkReportProse(plan,'text',false)).toThrow();
  for(const text of [plan.replace('“新品”宣称','“月销300单”宣称'),plan.replace('突出“功能”','突出“利润50%”'),plan+'，结果增加了一倍',plan.replace('可以进行','已经进行')])expect(()=>checkReportProse(text,'unknowns',true)).toThrow();
 });
 it.each(['假设：商品名称中的“送料無料”可能是一个吸引顾客的运营策略','假设：赠礼可能是一个可选的解释','假设：免费配送可能是一个营销策略'])('does not mistake an indefinite abstract description for a measured quantity: %s',text=>{expect(()=>checkReportProse(text,'text',false)).not.toThrow();});
 it.each(['假设：有一个顾客愿意付费','假设：该策略带来一个订单','假设：这个营销策略赚了一万元','假设：一个营销策略带来300个订单','假设：一个吸引顾客的运营策略让销量增长一倍','假设：一个特征是半数顾客复购','假设：一个很有潜力的营销策略','假设：该店只有一个营销策略','假设：该店共有一个运营策略','假设：商家采用了一个营销策略'])('retains quantitative and flattery guards beside abstract descriptions: %s',text=>{expect(()=>checkReportProse(text,'text',false)).toThrow();});
 it.each(['假设：B2B采购也可能是渠道来源','假设：b2c渠道可能面向个人'])('allows exact business model identifiers: %s',text=>{expect(()=>checkReportProse(text,'text',false)).not.toThrow();});
 it.each(['B2B月销300单','B2C利润50%','AB2B产品','B2B3渠道','2B2B','B2B2','B2B一万元'])('keeps numeric claims beside identifiers blocked: %s',text=>{expect(()=>checkReportProse(text,'text',false)).toThrow();});
 it.each(['比较两种解释，可以通过进一步访谈五位顾客来区分','访谈机构采购人员，了解他们在选择备蓄水时最看重的三项因素'])('accepts archived future actions without business quantities: %s',text=>{expect(()=>checkReportProse(text,'distinguishingObservation',true)).not.toThrow();expect(()=>checkReportProse(text,'text',false)).toThrow();});
 it.each(['访谈过机构采购人员，了解他们最看重的三项因素','访谈了机构采购人员，了解他们最看重的三项因素','访谈机构采购人员了，了解他们最看重的三项因素','访谈机构采购人员，了解到他们最看重的三项因素','访谈机构采购人员，了解他们最看重的三项因素，均表示愿意付费','访谈机构采购人员，了解他们均表示愿意付费后最看重的三项因素','比较两种解释，可以通过进一步访谈五位顾客来区分，月销300单','比较两种解释，可以通过进一步访谈五位顾客来区分，结果均愿意付费','已经访谈机构采购人员，了解他们最看重的三项因素','访谈月销300单的机构采购人员，了解他们最看重的三项因素','访谈机构采购人员，了解他们是否愿意付一万元及最看重的三项因素'])('does not strip business facts with planned question quantities: %s',text=>{expect(()=>checkReportProse(text,'distinguishingObservation',true)).toThrow();});

 it.each(['访谈5人','计划访谈五位用户，核对购买情境','做一个访谈','比较两种解释','建议先比较两种解释','对目标家居品类进行市场调研，访谈5人，了解消费者需求'])('allows explicit planned action quantity: %s',text=>{expect(()=>checkReportProse(text,'distinguishingObservation',true)).not.toThrow();});
 it.each(['假设：日本制造只是一个普遍的特征','假设：零部件可能来自其他地区'])('does not mistake fixed qualitative terms for business quantities: %s',text=>{expect(()=>checkReportProse(text,'text',false)).not.toThrow();});
 it.each(['假设：有一个买家愿意付费','假设：可以零成本获客','对顾客进行市场调研，访谈5人均愿意付费'])('keeps genuine quantities and results blocked beside qualitative exceptions: %s',text=>{expect(()=>checkReportProse(text,'distinguishingObservation',true)).toThrow();});
 it.each(['已经访谈5人','访谈5人发现销量300单','访谈5人均愿意付费','访谈5人中有人愿意付费','联系3位顾客都购买过产品','计划访谈5人均愿意付费','访谈5人，结果所有买家都愿意付费','每月销量300单','利润为半美元','计划访谈5人，月销一万单'])('never uses action wording to launder observed business figures: %s',text=>{expect(()=>checkReportProse(text,'distinguishingObservation',true)).toThrow();});
 it('does not allow action quantities in factual or hypothesis prose',()=>{expect(()=>checkReportProse('访谈5人','text',false)).toThrow();});
 it('identifies a fixed rule and field without putting rejected text in the error',()=>{try{checkReportProse('私密片段销量300单','unknowns',false);throw new Error('expected rejection');}catch(error){expect(error).toBeInstanceOf(BusinessReportValidationError);expect(error).toMatchObject({rule:'numeric_claim',detailField:'unknowns'});expect(String(error)).not.toContain('私密片段');}});
 it('keeps flattery blocked even alongside valid action plans',()=>{expect(()=>checkReportProse('访谈5人，这个想法很有潜力','distinguishingObservation',true)).toThrow();});
 it.each(['对月销300单的产品进行市场调研，访谈5人，了解购买情境','对利润率50%的店铺进行核对，访谈5人，了解购买情境'])('checks the research target even when its action count is allowed: %s',text=>{expect(()=>checkReportProse(text,'distinguishingObservation',true)).toThrow();});
});
