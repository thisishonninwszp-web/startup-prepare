import {describe,it,expect,vi} from 'vitest';
import {buildDatedManualSource} from './manual-sources';
const input={platform:'xiaohongshu' as const,platformShopId:'shop-a',name:'人工核对店',sourceUrl:'https://www.xiaohongshu.com/explore/abc',capturedText:'商品公开描述',coverage:'只有单篇说明',dateSeen:'2026-10-29',accessStatus:'partial' as const,deidentified:true,gaps:'订单与复购不可见'};
describe('dated manual public sources',()=>{
 it('retains date seen separately and never invents publication date',()=>{const result=buildDatedManualSource(input);expect(result.snapshot.publishedAt).toBeNull();expect(result.snapshot.structured).toMatchObject({dateSeen:'2026-10-29',accessStatus:'partial',gaps:'订单与复购不可见'});});
 it('requires valid seen date, status and deidentification',()=>{for(const patch of [{dateSeen:''},{dateSeen:'2026-02-30'},{dateSeen:'2099-01-01'},{accessStatus:'complete'},{deidentified:false}])expect(()=>buildDatedManualSource({...input,...patch} as typeof input)).toThrow();});
 it('rejects private links and buyer contact details',()=>{expect(()=>buildDatedManualSource({...input,sourceUrl:'http://localhost/a'})).toThrow();expect(()=>buildDatedManualSource({...input,capturedText:'请联系 person@example.com'})).toThrow();});
 it('accepts the current Tokyo date before UTC midnight and rejects Tokyo tomorrow',()=>{vi.useFakeTimers();try{vi.setSystemTime(new Date('2026-10-28T15:30:00Z'));expect(()=>buildDatedManualSource({...input,dateSeen:'2026-10-29'})).not.toThrow();expect(()=>buildDatedManualSource({...input,dateSeen:'2026-10-30'})).toThrow();}finally{vi.useRealTimers();}});
 it('stores inaccessible gaps without inventing a quotation',()=>{const result=buildDatedManualSource({...input,accessStatus:'unavailable',capturedText:''});expect(result.snapshot.capturedText).toBeNull();expect(result.snapshot.structured.gaps).toBe(input.gaps);expect(()=>buildDatedManualSource({...input,accessStatus:'public',capturedText:''})).toThrow();});
});
