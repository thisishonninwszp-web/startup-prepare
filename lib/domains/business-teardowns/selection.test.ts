import {describe,it,expect} from 'vitest';
import {selectCandidate} from './selection';
import {RULE_VERSION,type QueuedCandidate} from './rules';
const candidate=(shop:string,category='food',priceBand='low',businessModel='retail'):QueuedCandidate=>({merchant:{platform:'rakuten',platformShopId:shop,name:shop,sourceUrl:`https://www.rakuten.co.jp/${shop}/`,identityScope:'platform_shop_id'},itemCode:`${shop}:one`,itemName:'Item',itemUrl:`https://item.rakuten.co.jp/${shop}/one/`,price:{itemPrice:100},reviewCount:null,rank:null,coverage:'keyword search page=1',category,priceBand,businessModel,sourcePage:1,capturedAt:'2026-10-29T00:00:00Z'});
describe('deterministic business selection',()=>{
 it('never reuses a main merchant, while prior comparisons remain eligible',()=>{expect(selectCandidate([candidate('used'),candidate('comparison')],{excluded:[],priorMain:['rakuten:used'],recent:[]} )?.candidate.merchant.platformShopId).toBe('comparison');});
 it('applies explicit exclusions and requires official consistent shop identities',()=>{expect(selectCandidate([candidate('excluded'),{...candidate('fake'),itemCode:'other:x'}],{excluded:['rakuten:excluded'],priorMain:[],recent:[]})).toBeNull();});
 it('rotates categories then price bands then business models without a score',()=>{const rows=[candidate('a'),candidate('b','tools','high','maker')];const result=selectCandidate(rows,{excluded:[],priorMain:[],recent:[{category:'food',priceBand:'low',businessModel:'retail'}]});expect(result?.candidate.merchant.platformShopId).toBe('b');expect(result?.ruleVersion).toBe(RULE_VERSION);expect(result?.reason).toContain('轮换');});
 it('breaks ties by stable identity regardless of source order',()=>{const rows=[candidate('z'),candidate('a')];expect(selectCandidate(rows,{excluded:[],priorMain:[],recent:[]})).toEqual(selectCandidate(rows.reverse(),{excluded:[],priorMain:[],recent:[]}));});
});
