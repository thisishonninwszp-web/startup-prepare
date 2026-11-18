import {beforeEach,describe,it,expect,vi} from 'vitest';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase',()=>({supabaseAdminUncached:{rpc}}));
import {listSimulations,getSimulation,simulationCommand} from './transport';
const owner='10000000-0000-4000-8000-000000000001',id='20000000-0000-4000-8000-000000000001';
describe('simulation transport trust boundary',()=>{
 beforeEach(()=>rpc.mockReset());
 it('isolates missing migration to the simulation list',async()=>{rpc.mockResolvedValue({error:{code:'42883',message:'missing'}});expect(await listSimulations(owner)).toEqual({available:false,items:[],nextCursor:null});});
 it('passes case-scoped bounds and rejects arbitrary cursors',async()=>{rpc.mockResolvedValue({data:{items:[],nextCursor:null},error:null});await listSimulations(owner,{caseId:id});expect(rpc).toHaveBeenCalledWith('business_simulation_read',{p_user_id:owner,p_operation:'list',p_input:{caseId:id}});await expect(listSimulations(owner,{before:'forged'})).rejects.toThrow();});
 it('checks exact receipt identity and revision',async()=>{rpc.mockResolvedValue({data:{id:owner,revision:3},error:null});await expect(simulationCommand(owner,{operation:'erase',id,requestId:id,expectedRevision:1})).rejects.toThrow();});
 it('exact record lookup never falls back to a first list item',async()=>{rpc.mockResolvedValue({data:null,error:null});expect(await getSimulation(owner,id)).toBe(null);expect(rpc).toHaveBeenCalledWith('business_simulation_read',{p_user_id:owner,p_operation:'get',p_input:{id}});});
});
