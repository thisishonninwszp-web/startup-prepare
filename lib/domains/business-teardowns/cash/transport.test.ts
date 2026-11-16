import {describe,it,expect,vi,beforeEach} from 'vitest';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('@/lib/supabase',()=>({supabaseAdminUncached:{rpc}}));
import {cashCommand,listCash,getCash,listCashCases,loadCashContext} from './transport';
const id='10000000-0000-4000-8000-000000000001';
describe('cash uncached owner transport',()=>{
 beforeEach(()=>rpc.mockReset());
 it('rejects invalid owner, payload and cursor before database access',async()=>{await expect(cashCommand('bad',{operation:'erase',id,requestId:id,expectedRevision:1})).rejects.toThrow();await expect(cashCommand(id,{operation:'erase',id,requestId:id,expectedRevision:1,score:1} as never)).rejects.toThrow();await expect(listCashCases(id,{before:'bad'})).rejects.toThrow();expect(rpc).not.toHaveBeenCalled();});
 it('validates exact identifier-only save receipts',async()=>{const input={operation:'erase' as const,id,requestId:id,expectedRevision:1};rpc.mockResolvedValue({data:{id,revision:2},error:null});expect(await cashCommand(id,input)).toEqual({id,revision:2});expect(rpc).toHaveBeenCalledWith('business_cash_command',{p_user_id:id,p_operation:'erase',p_input:input});rpc.mockResolvedValue({data:{id,revision:1},error:null});await expect(cashCommand(id,input)).rejects.toThrow('回执');});
 it('only degrades missing migration and propagates other failures',async()=>{rpc.mockResolvedValue({data:null,error:{code:'PGRST202',message:'missing'}});expect(await listCash(id)).toEqual({available:false,items:[],nextCursor:null});rpc.mockResolvedValue({data:null,error:{code:'XX000',message:'retry'}});await expect(listCash(id)).rejects.toThrow('retry');});
 it('rejects malformed records, source metadata, or context mismatches',async()=>{for(const data of [null,{items:[],nextCursor:'bad'},{items:[{id}],nextCursor:null}]){rpc.mockResolvedValue({data,error:null});await expect(listCash(id)).rejects.toThrow();}rpc.mockResolvedValue({data:{caseId:'10000000-0000-4000-8000-000000000002',caseTitle:'x'},error:null});await expect(loadCashContext(id,id)).rejects.toThrow();rpc.mockResolvedValue({data:null,error:null});expect(await getCash(id,id)).toBeNull();});
});
