import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('./actions',()=>({boundarySaveAction:vi.fn(),boundaryListAction:vi.fn(),boundaryGetAction:vi.fn(),boundarySourceAction:vi.fn(),boundarySourcesAction:vi.fn()}));
import {BoundaryPanel,BoundaryOutput} from './boundary-panel';
import type {CashRecord} from '@/lib/domains/business-teardowns/cash/domain';
import type {BoundaryRecord} from '@/lib/domains/business-teardowns/boundaries/domain';
const id='10000000-0000-4000-8000-000000000001',stamp='2026-11-17T00:00:00Z';
const source:CashRecord={id,revision:1,createdAt:stamp,updatedAt:stamp,sources:{caseAvailable:true,caseTitle:'案例'},scenario:{caseId:id,title:'来源',currency:'JPY',startDate:'2026-01-01',openingMinor:100,baseline:[{id,date:'2026-01-02',label:'付款',direction:'out',amountMinor:200,assumption:'本人说明'}],alternative:[]}};
const record:BoundaryRecord={id,caseId:id,revision:1,createdAt:stamp,updatedAt:stamp,definition:{cashId:id,cashRevision:1,title:'范围',side:'baseline',variable:{kind:'amount',flowId:id,minMinor:0,maxMinor:300}},source:{available:true,currentRevision:1,caseId:id}};
describe('boundary workflow rendering',()=>{
 it('isolates missing134',()=>{const html=renderToStaticMarkup(<BoundaryPanel initialState={{available:false,items:[],nextCursor:null}} initialSources={{items:[],nextCursor:null}}/>);expect(html).toContain('134');expect(html).not.toContain('保存范围');});
 it('shows exact adjacent values, source revision, full assumptions and daily-close caveat',()=>{const html=renderToStaticMarkup(<BoundaryOutput source={source} definition={record.definition}/>);for(const text of ['100','101','本人说明','日终','第 1 版','起始日','同日'])expect(html).toContain(text);expect(html).not.toContain('评分');});
 it('keeps stale range inputs but hides calculated output until explicit adoption',()=>{const html=renderToStaticMarkup(<BoundaryPanel initialState={{available:true,items:[record],nextCursor:null}} initialSources={{items:[],nextCursor:null}} initialRecord={{...record,source:{available:false,currentRevision:2,caseId:id}}} initialSource={{...source,revision:2}}/>);expect(html).toContain('来源已变化');expect(html).toContain('采用来源新版重新分析');expect(html).not.toContain('相邻金额');expect(html).toContain('value="300"');});
 it('offers full saved and source pagination and independent range input',()=>{const html=renderToStaticMarkup(<BoundaryPanel initialState={{available:true,items:[],nextCursor:'next'}} initialSources={{items:[source],nextCursor:'more'}} initialSource={source}/>);for(const text of ['更多范围','更多来源','期初现金','一笔金额','一笔日期','基准假设','替代假设','先分析这个范围'])expect(html).toContain(text);});
});
