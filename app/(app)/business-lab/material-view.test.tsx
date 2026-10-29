import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MaterialView } from './material-view';
import type { MaterialSnapshot } from '@/lib/domains/business-teardowns/domain';

it('shows source price ranges without picking one representative price', () => {
  const snapshot: MaterialSnapshot = { id: 'price', merchantId: 'shop', platform: 'rakuten', itemId: 'shop:1', origin: 'official_api', sourceUrl: 'https://item.rakuten.co.jp/shop/1/', capturedAt: '2026-10-28', publishedAt: null, captureScope: 'api_fields', capturedText: null, quantities: [], structured: { itemPrice: 1000, hasPriceRange: true, itemPriceMin1: 1000, itemPriceMax1: 2500, itemPriceBaseField: 'itemPriceMin1', currency: 'JPY' }, coverage: '单商品价格字段', contentHash: 'hash' };
  const html = renderToStaticMarkup(<MaterialView snapshot={snapshot} />);
  expect(html).toContain('价格范围');
  expect(html).toContain('1000 — 2500');
  expect(html).toContain('计价单位');
});

it('keeps packaging, orders, sales and review counts separate and preserves exact excerpts', () => {
  const html = renderToStaticMarkup(<MaterialView snapshot={{
    id: 'snap', merchantId: 'shop', platform: 'rakuten', itemId: 'shop:1',
    origin: 'manual_excerpt', sourceUrl: 'https://item.rakuten.co.jp/shop/1/',
    capturedAt: '2026-10-28T01:00:00Z', publishedAt: null,
    captureScope: 'manual_transcription', capturedText: 'independent 每包12枚',
    quantities: [{ id: 'pack', metric: 'pack_contents', raw: '每包12枚', value: 12,
      relation: 'eq', unit: 'pieces', period: { from: null, to: null, label: null },
      sampleScope: '单个商品包装', attribution: 'merchant' }],
    structured: {}, coverage: '仅一个商品页面', contentHash: 'hash',
  }} />);
  expect(html).toContain('每包12枚');
  expect(html).toContain('单次下单件数');
  expect(html).toContain('公开销售显示');
  expect(html).toContain('评价数量');
  expect(html).toContain('未知：材料未提供');
  expect(html).toContain('independent 每包12枚');
  expect(html).toContain('2026-10-28');
  expect(html).toContain('仅一个商品页面');
  expect(html).not.toContain('平均每单12');
});

it('does not claim manually supplied Xiaohongshu excerpts are verified API data', () => {
  const html = renderToStaticMarkup(<MaterialView snapshot={{
    id: 'xhs', merchantId: 'shop', platform: 'xiaohongshu', itemId: null,
    origin: 'manual_excerpt', sourceUrl: 'https://www.xiaohongshu.com/explore/example',
    capturedAt: '2026-10-28T01:00:00Z', publishedAt: null,
    captureScope: 'manual_transcription', capturedText: '再次购买', quantities: [],
    structured: {}, coverage: '用户选择的一段公开摘录', contentHash: 'hash',
  }} />);
  expect(html).toContain('手动摘录');
  expect(html).toContain('未独立核实');
  expect(html).toContain('发布时间未知');
  expect(html).toContain('价格与计价单位未知');
});
