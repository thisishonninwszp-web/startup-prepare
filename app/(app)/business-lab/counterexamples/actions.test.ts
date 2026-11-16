import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({enabled:vi.fn(),getUser:vi.fn(),list:vi.fn(),command:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser:mocks.getUser}})}));
vi.mock('@/lib/domains/business-teardowns/daily',()=>({businessTeardownsEnabled:mocks.enabled}));
vi.mock('@/lib/domains/business-teardowns/counterexamples/transport',()=>({listCounterexamples:mocks.list,commandCounterexample:mocks.command}));
import {loadCounterexamplesAction,saveCounterexampleAction} from './actions';
const owner='20000000-0000-4000-8000-000000000001';
beforeEach(()=>{vi.clearAllMocks();mocks.enabled.mockReturnValue(true);mocks.getUser.mockResolvedValue({data:{user:{id:owner}}});});
describe('反例研究服务器入口',()=>{
 it('只用登录身份派生owner',async()=>{await loadCounterexamplesAction();expect(mocks.list).toHaveBeenCalledWith(owner,{});const command={operation:'delete' as const,id:owner,requestId:owner,expectedRevision:1};await saveCounterexampleAction(command);expect(mocks.command).toHaveBeenCalledWith(owner,command);});
 it('关闭和未登录都不访问领域读写',async()=>{mocks.enabled.mockReturnValue(false);await expect(loadCounterexamplesAction()).rejects.toThrow('尚未开启');mocks.enabled.mockReturnValue(true);mocks.getUser.mockResolvedValue({data:{user:null}});await expect(loadCounterexamplesAction()).rejects.toThrow('请先登录');expect(mocks.list).not.toHaveBeenCalled();expect(mocks.command).not.toHaveBeenCalled();});
});
