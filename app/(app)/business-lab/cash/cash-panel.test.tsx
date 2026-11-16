import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('./actions',()=>({cashSaveAction:vi.fn(),cashListAction:vi.fn(),cashGetAction:vi.fn(),cashCasesAction:vi.fn(),cashContextAction:vi.fn()}));
import {CashPanel,CashComparison,CashFlowFields} from './cash-panel';
import type {CashScenario} from '@/lib/domains/business-teardowns/cash/domain';
const id='10000000-0000-4000-8000-000000000001';
const s:CashScenario={caseId:id,title:'本人假设',currency:'JPY',startDate:'2026-11-16',openingMinor:100,baseline:[{id,date:'2026-11-16',label:'采购假设',direction:'out',amountMinor:200,assumption:'合成测试，非公司成本'}],alternative:[]};
describe('cash hypothetical UI',()=>{
 it('blocks mutation when128 is unavailable',()=>{const html=renderToStaticMarkup(<CashPanel initialState={{available:false,items:[],nextCursor:null}} initialCases={{items:[],nextCursor:null}}/>);expect(html).toContain('128');expect(html).not.toContain('保存假设');});
 it('shows exact daily balances, every assumption and limited table scrolling',()=>{const html=renderToStaticMarkup(<CashComparison scenario={s}/>);for(const t of ['采购假设','合成测试，非公司成本','2026-11-16','-100','基准假设','替代假设','同日结算顺序未模拟','overflow-x-auto'])expect(html).toContain(t);expect(html).not.toContain('评分');});
 it('provides full flow input fields with decimal text entry',()=>{const html=renderToStaticMarkup(<CashFlowFields flows={[{...s.baseline[0],amount:'200'}]} currency="JPY" onChange={()=>{}}/>);for(const name of ['date','label','direction','amount','assumption'])expect(html).toContain(`name="${name}"`);expect(html).toContain('本人假设');});
 it('shows no invented business amounts and separate baseline/alternative editors',()=>{const html=renderToStaticMarkup(<CashPanel initialState={{available:true,items:[],nextCursor:null}} initialCases={{items:[{id,title:'案例',date:'2026-11-16'}],nextCursor:'more'}} initialContext={{caseId:id,caseTitle:'案例'}}/>);for(const text of ['期初现金假设','基准假设','替代假设','更多案例','保存假设','不换汇'])expect(html).toContain(text);expect(html).not.toContain('value="100000"');});
});
