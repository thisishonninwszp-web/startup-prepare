import {beforeEach,expect,it,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());vi.mock('@/lib/supabase',()=>({supabaseAdminUncached:{rpc}}));
import {savePremise} from './commands';
import {readPremises} from './queries';
const id='aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
beforeEach(()=>rpc.mockReset());
it('uses authenticated owner context and rejects malformed receipts',async()=>{rpc.mockResolvedValue({data:{id},error:null});await expect(savePremise(id,{operation:'erase',requestId:id,id,expectedRevision:1})).rejects.toThrow();expect(rpc).toHaveBeenCalledWith('shared_premise_command',expect.objectContaining({p_user_id:id}));});
it('keeps missing migration guidance local to the new module',async()=>{rpc.mockResolvedValue({data:null,error:{code:'PGRST202',message:'missing'}});expect(await readPremises(id,{operation:'list'})).toEqual({available:false,items:[],nextCursor:null});});
it('rejects malformed reads and owner ids before any query',async()=>{await expect(readPremises('wrong',{operation:'list'})).rejects.toThrow();expect(rpc).not.toHaveBeenCalled();rpc.mockResolvedValue({data:{items:[]},error:null});await expect(readPremises(id,{operation:'list'})).rejects.toThrow();});
