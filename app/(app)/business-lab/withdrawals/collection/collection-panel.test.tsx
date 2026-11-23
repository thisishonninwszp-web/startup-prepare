import {it,expect,vi} from 'vitest';import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('./actions',()=>({loadWithdrawalCollectionAction:vi.fn(),loadMoreCollectionIssuersAction:vi.fn(),saveWithdrawalCollectionSettingsAction:vi.fn(),runWithdrawalCollectionAction:vi.fn()}));
import {CollectionPanel} from './collection-panel';
import {DEFAULT_COLLECTION_SETTINGS} from '@/lib/domains/business-teardowns/withdrawals/collection/domain';
it('shows separate extra budgets/public scope, paused default, private metadata only',()=>{const html=renderToStaticMarkup(<CollectionPanel initial={{state:{available:true,settings:DEFAULT_COLLECTION_SETTINGS,run:null,attempts:[],diagnostics:[]},issuers:{available:true,items:[],nextCursor:null},globalEnabled:false}}/>);for(const text of ['2 次搜索','3 次网页请求','1 次 Gemini','额外费用','公开正文','楽天','12 HTTP','人工确认','部署开关关闭','不发送私下笔记'])expect(html).toContain(text);expect(html).not.toContain('checked=""');expect(html).toContain('disabled=""');});
