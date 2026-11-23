import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocked=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase',()=>({supabaseAdminUncached:mocked}));
import {withdrawalCommand,withdrawalRead} from './transport';
const owner='10000000-0000-4000-8000-000000000001',id='20000000-0000-4000-8000-000000000001';
beforeEach(()=>vi.clearAllMocks());
describe('withdrawal RPC boundary',()=>{
 it('uses server owner and preserves a receipt for empty queue selection',async()=>{mocked.rpc.mockResolvedValue({data:{id:null,caseId:null,revision:null},error:null});expect(await withdrawalCommand(owner,{operation:'select_today',requestId:id})).toEqual({id:null,caseId:null,revision:null});expect(mocked.rpc).toHaveBeenCalledWith('business_withdrawal_command',{p_user_id:owner,p_operation:'select_today',p_input:{operation:'select_today',requestId:id}});});
 it('rejects foreign get identities and unexpected DTO fields',async()=>{mocked.rpc.mockResolvedValue({data:{id,extra:'private'},error:null});await expect(withdrawalRead(owner,'get',{id})).rejects.toThrow();});
 it('treats only missing migrations as unavailable lists',async()=>{mocked.rpc.mockResolvedValue({data:null,error:{code:'42883',message:'missing'}});expect(await withdrawalRead(owner,'list',{})).toEqual({available:false,items:[],nextCursor:null});mocked.rpc.mockResolvedValue({data:null,error:{code:'NETWORK',message:'offline'}});await expect(withdrawalRead(owner,'list',{})).rejects.toThrow('offline');});
 it('validates cursor shape before making requests',async()=>{await expect(withdrawalRead(owner,'list',{before:'bad'})).rejects.toThrow();expect(mocked.rpc).not.toHaveBeenCalled();});
 it('rejects a receipt with an unexpected revision',async()=>{mocked.rpc.mockResolvedValue({data:{id,revision:9},error:null});await expect(withdrawalCommand(owner,{operation:'erase',id,requestId:id,expectedRevision:2})).rejects.toThrow('回执');});
});
