import { describe, expect, it } from 'vitest';
import { orderQuantityFrom, type QuantityObservation } from './domain';
import { merchantIdentityFromItem } from './identity';
import { tokyoDate } from './daily';
describe('business foundation', () => {
 it('uses shop identity across SKUs without merging names', () => {
  const a=merchantIdentityFromItem({platform:'rakuten',shopCode:'Shop',itemCode:'Shop:1'});
  expect(merchantIdentityFromItem({platform:'rakuten',shopCode:'Shop',itemCode:'Shop:2'}).key).toBe(a.key);
  expect(merchantIdentityFromItem({platform:'rakuten',shopCode:'shop',itemCode:'shop:1'}).key).not.toBe(a.key);
  expect(()=>merchantIdentityFromItem({platform:'rakuten',shopCode:'Shop',itemCode:'other:1'})).toThrow();
 });
 it('does not turn packaging into orders and keeps conflicting orders unknown', () => {
  const q:QuantityObservation={id:'pack',metric:'pack_contents',raw:'12 pieces',value:12,relation:'eq',unit:'pieces',period:{from:null,to:null,label:null},sampleScope:'one package',attribution:'merchant'};
  expect(orderQuantityFrom([q])).toBeNull();
  const order={...q,id:'order',metric:'units_per_order' as const};
  expect(orderQuantityFrom([order])).toBe(order);
  expect(orderQuantityFrom([order,{...order,id:'other',value:3}])).toBeNull();
 });
 it('uses Tokyo natural days at midnight',()=>{
  expect(tokyoDate(new Date('2026-10-28T14:59:59Z'))).toBe('2026-10-28');
  expect(tokyoDate(new Date('2026-10-28T15:00:00Z'))).toBe('2026-10-29');
 });
});
