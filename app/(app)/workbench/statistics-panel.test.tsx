import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('./statistics-actions',()=>({loadStatisticsAction:vi.fn(),loadStatisticalMetadataAction:vi.fn(),previewStatisticsAction:vi.fn(),approveStatisticsAction:vi.fn(),refreshStatisticsAction:vi.fn(),deleteStatisticalSourceAction:vi.fn(),linkStatisticsIdeaAction:vi.fn(),compareStatisticsAction:vi.fn()}));
import {StatisticsPanel} from './statistics-panel';
describe('statistical denominator progressive panel',()=>{it('starts collapsed without provider requests and describes denominator limits',()=>{const html=renderToStaticMarkup(<StatisticsPanel ideas={[]}/>);expect(html).toContain('统计分母');expect(html).toContain('aria-expanded="false"');expect(html).not.toContain('<select');});});
