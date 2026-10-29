import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase',()=>({supabaseAdmin:{rpc:mocks.rpc}}));
import {findBusinessReceipt,saveCaseMaterial,semanticInputHash} from './commands';
beforeEach(()=>vi.clearAllMocks());
describe('business service commands',()=>{
 it('hashes canonical semantics without depending on property order',()=>expect(semanticInputHash({b:2,a:{d:4,c:3}})).toBe(semanticInputHash({a:{c:3,d:4},b:2})));
 it('rejects invalid owner before SQL',async()=>{await expect(findBusinessReceipt('',{requestId:'10000000-0000-4000-8000-000000000001',operation:'primary',userInputHash:'x'})).rejects.toThrow();expect(mocks.rpc).not.toHaveBeenCalled();});
 it('passes receipt operation and original semantic identity before material access',async()=>{mocks.rpc.mockResolvedValue({data:{id:'saved'},error:null});expect(await findBusinessReceipt('10000000-0000-4000-8000-000000000001',{requestId:'20000000-0000-4000-8000-000000000001',operation:'attach',userInputHash:'x'})).toEqual({id:'saved'});expect(mocks.rpc.mock.calls[0][1].p_operation).toBe('attach');});
 it('propagates database failure instead of reporting a save',async()=>{mocks.rpc.mockResolvedValue({data:null,error:{message:'revision conflict'}});await expect(saveCaseMaterial('10000000-0000-4000-8000-000000000001',{requestId:'20000000-0000-4000-8000-000000000001'} as Parameters<typeof saveCaseMaterial>[1])).rejects.toThrow('revision conflict');});
});
