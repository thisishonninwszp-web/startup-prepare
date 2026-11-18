import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({enabled:vi.fn(),getUser:vi.fn(),list:vi.fn(),get:vi.fn(),cases:vi.fn(),context:vi.fn(),command:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser:mocks.getUser}})}));
vi.mock('@/lib/domains/business-teardowns/daily',()=>({businessTeardownsEnabled:mocks.enabled}));
vi.mock('@/lib/domains/business-teardowns/simulation/transport',()=>({listSimulations:mocks.list,getSimulation:mocks.get,listSimulationCases:mocks.cases,loadSimulationContext:mocks.context,simulationCommand:mocks.command}));
import {simulationListAction,simulationGetAction,simulationCasesAction,simulationContextAction,simulationSaveAction} from './actions';
describe('simulation action authorization',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.enabled.mockReturnValue(true);mocks.getUser.mockResolvedValue({data:{user:{id:'owner'}}});});
 it('blocks the entire domain behind the feature flag',async()=>{mocks.enabled.mockReturnValue(false);await expect(simulationListAction()).rejects.toThrow('尚未开启');expect(mocks.list).not.toHaveBeenCalled();});
 it('uses the authenticated owner for reads and mutations',async()=>{await simulationListAction({caseId:'case'});await simulationGetAction('record');await simulationCasesAction();await simulationContextAction('case');await simulationSaveAction({operation:'erase',id:'record',requestId:'request',expectedRevision:1});expect(mocks.list).toHaveBeenCalledWith('owner',{caseId:'case'});expect(mocks.get).toHaveBeenCalledWith('owner','record');expect(mocks.cases).toHaveBeenCalledWith('owner',{});expect(mocks.context).toHaveBeenCalledWith('owner','case');expect(mocks.command).toHaveBeenCalledWith('owner',expect.objectContaining({operation:'erase'}));});
 it('rejects unauthenticated requests before querying tables',async()=>{mocks.getUser.mockResolvedValue({data:{user:null}});await expect(simulationListAction()).rejects.toThrow('请先登录');expect(mocks.list).not.toHaveBeenCalled();});
});
