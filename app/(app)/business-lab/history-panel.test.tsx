import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('./actions', () => ({ loadBusinessHistoryAction: vi.fn() }));
import { BusinessHistoryPanel } from './history-panel';
it('keeps unavailable daily slots readable instead of silently replacing the shop', () => {
  const html = renderToStaticMarkup(<BusinessHistoryPanel initialHistory={{ items: [{
    id: 'case', localDate: '2026-10-27', timezone: 'Asia/Tokyo', merchantId: 'shop', state: 'unavailable',
    publishedRevisionId: null, failureReason: '来源暂时不可用', revision: 1, selectionReason: '核对交付条件',
  }], nextCursor: 'cursor' }} />);
  expect(html).toContain('/business-lab/case');
  expect(html).toContain('来源暂时不可用');
  expect(html).toContain('读取更早案例');
  expect(html).toContain('2026-10-27');
});
