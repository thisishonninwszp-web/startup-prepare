import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('./actions', () => ({ searchBusinessCandidates: vi.fn(), selectBusinessCandidate: vi.fn(), createManualBusinessCase: vi.fn(), attachManualBusinessMaterial: vi.fn(), attachBusinessComparison: vi.fn(), loadBusinessCaseAction: vi.fn() }));
import { BusinessSourcePanel, businessCandidateAction } from './source-panel';
import type { CaseDetail, Merchant } from '@/lib/domains/business-teardowns/domain';

it('retries only the reserved primary shop when its initial material is missing', () => {
  const merchant: Merchant = { id: 'shop', platform: 'rakuten', platformShopId: 'reserved', name: '待核对店铺', sourceUrl: 'https://www.rakuten.co.jp/reserved/', identityScope: 'platform_shop_id' };
  const detail: CaseDetail = { merchant, members: [], dailyCase: { id: 'case', localDate: '2026-10-28', timezone: 'Asia/Tokyo', merchantId: 'shop', state: 'unavailable', publishedRevisionId: null, failureReason: '接口暂时不可用', revision: 1, selectionReason: '核对经营条件' } };
  expect(businessCandidateAction(detail, merchant)).toBe('retry_primary');
  expect(businessCandidateAction(detail, { ...merchant, platformShopId: 'another' })).toBe('comparison');
  expect(businessCandidateAction(detail, { ...merchant, platform: 'xiaohongshu' })).toBe('comparison');
  expect(businessCandidateAction(null, merchant)).toBe('primary');
  const html = renderToStaticMarkup(<BusinessSourcePanel initialCase={detail} />);
  expect(html).toContain('补齐今日主店材料');
  expect(html).toContain('接口暂时不可用');
});

it('keeps the first step small and makes manual-source identity and privacy explicit', () => {
  const html = renderToStaticMarkup(<BusinessSourcePanel initialCase={null} />);
  expect(html).toContain('查找乐天候选');
  expect(html).toContain('手动提供公开材料');
  expect(html).toContain('平台店铺 ID');
  expect(html).toContain('公开摘录');
  expect(html).toContain('买家昵称');
  expect(html).toContain('未独立核实');
  expect(html).not.toContain('生成 AI');
});
