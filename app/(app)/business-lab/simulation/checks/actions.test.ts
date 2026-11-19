import {beforeEach,describe,it,expect,vi} from 'vitest';
const h=vi.hoisted(()=>({enabled:vi.fn(),user:vi.fn(),list:vi.fn(),get:vi.fn(),sources:vi.fn(),source:vi.fn(),command:vi.fn()}));
vi.mock('@/lib/domains/business-teardowns/daily',()=>({businessTeardownsEnabled:h.enabled}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser:h.user}})}));
vi.mock('@/lib/domains/business-teardowns/reality-checks/transport',()=>({listRealityChecks:h.list,getRealityCheck:h.get,listRealityCheckSources:h.sources,getRealityCheckSource:h.source,realityCheckCommand:h.command}));
import {realityChecksListAction,realityCheckGetAction,realityCheckSourcesAction,realityCheckSourceAction,realityCheckSaveAction} from './actions';
describe('reality check action ownership',()=>{
 beforeEach(()=>{vi.clearAllMocks();h.enabled.mockReturnValue(true);h.user.mockResolvedValue({data:{user:{id:'owner'}}});});
 it('gates reads and writes before contacting transport',async()=>{h.enabled.mockReturnValue(false);await expect(realityChecksListAction()).rejects.toThrow('尚未开启');expect(h.list).not.toHaveBeenCalled();h.enabled.mockReturnValue(true);h.user.mockResolvedValue({data:{user:null}});await expect(realityCheckSourceAction('source')).rejects.toThrow('请先登录');expect(h.source).not.toHaveBeenCalled();});
 it('takes the owner from the authenticated session for every action',async()=>{await realityChecksListAction();await realityCheckGetAction('record');await realityCheckSourcesAction();await realityCheckSourceAction('source');await realityCheckSaveAction({operation:'erase',id:'record',requestId:'request',expectedRevision:1});expect(h.list).toHaveBeenCalledWith('owner',{});expect(h.get).toHaveBeenCalledWith('owner','record');expect(h.sources).toHaveBeenCalledWith('owner',{});expect(h.source).toHaveBeenCalledWith('owner','source');expect(h.command).toHaveBeenCalledWith('owner',expect.objectContaining({operation:'erase'}));});
});
