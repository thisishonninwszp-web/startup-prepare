import {beforeEach,describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
const mocks=vi.hoisted(()=>({list:vi.fn(),get:vi.fn(),cases:vi.fn(),context:vi.fn(),panel:vi.fn()}));
vi.mock('@/lib/domains/business-teardowns/daily',()=>({businessTeardownsEnabled:()=>true}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}}})}})}));
vi.mock('@/lib/domains/business-teardowns/simulation/transport',()=>({listSimulations:mocks.list,getSimulation:mocks.get,listSimulationCases:mocks.cases,loadSimulationContext:mocks.context}));
vi.mock('./simulation-panel',()=>({SimulationPanel:(props:unknown)=>{mocks.panel(props);return <div/>;}}));
import Page from './page';
const caseA='10000000-0000-4000-8000-000000000001',caseB='10000000-0000-4000-8000-000000000002',recordA='20000000-0000-4000-8000-000000000001',recordB='20000000-0000-4000-8000-000000000002';
describe('simulation exact deep links',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.list.mockResolvedValue({available:true,items:[],nextCursor:null});mocks.cases.mockResolvedValue({items:[],nextCursor:null});mocks.context.mockResolvedValue({caseId:caseA,caseTitle:'A'});});
 it('does not open a record under a different supplied case',async()=>{mocks.get.mockResolvedValue({id:recordB,setup:{caseId:caseB},revision:1});renderToStaticMarkup(await Page({searchParams:{caseId:caseA,recordId:recordB}}));expect(mocks.panel).toHaveBeenCalledWith(expect.objectContaining({initialRecord:null,initialMissing:true}));});
 it('keys by requested record identity but preserves same-record unsaved input on revision refresh',async()=>{mocks.get.mockResolvedValue({id:recordA,setup:{caseId:caseA},revision:1});const first=await Page({searchParams:{caseId:caseA,recordId:recordA}});mocks.get.mockResolvedValue({id:recordB,setup:{caseId:caseA},revision:1});const second=await Page({searchParams:{caseId:caseA,recordId:recordB}});mocks.get.mockResolvedValue({id:recordA,setup:{caseId:caseA},revision:2});const updated=await Page({searchParams:{caseId:caseA,recordId:recordA}});expect(first.props.children[1].key).toBeTruthy();expect(first.props.children[1].key).not.toBe(second.props.children[1].key);expect(first.props.children[1].key).toBe(updated.props.children[1].key);});
});
