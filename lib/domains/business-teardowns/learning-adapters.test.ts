import {beforeEach,describe,it,expect,vi} from 'vitest';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('@/lib/supabase',()=>({supabaseAdmin:{rpc}}));
import {saveBusinessLearning} from './learning-commands';
import {loadBusinessLearning,searchBusinessMethods} from './learning-queries';
const owner='10000000-0000-4000-8000-000000000001',id='20000000-0000-4000-8000-000000000001';
const correction={operation:'correction' as const,caseId:id,requestId:id,snapshotId:id,explanation:'用户发现来源日期此前不明'};
describe('learning RPC trust boundary',()=>{
 beforeEach(()=>rpc.mockReset());
 it('rejects malformed IDs and null text before RPC',async()=>{await expect(saveBusinessLearning('other',correction)).rejects.toThrow();await expect(saveBusinessLearning(owner,{...correction,explanation:null} as unknown as typeof correction)).rejects.toThrow();expect(rpc).not.toHaveBeenCalled();});
 it('passes the owner and immutable semantic payload to one guarded command',async()=>{const entry={id,operation:'correction',payload:correction};rpc.mockResolvedValue({data:entry,error:null});expect(await saveBusinessLearning(owner,correction)).toEqual(entry);expect(rpc).toHaveBeenCalledWith('business_learning_command',{p_user_id:owner,p_operation:'correction',p_input:correction});});
 it('lets the database resolve an existing receipt after its deadline',async()=>{rpc.mockResolvedValue({data:{id},error:null});await saveBusinessLearning(owner,{operation:'expectation',caseId:id,requestId:id,reportId:id,baselineSnapshotId:id,question:'未来是否出现声明',scope:'商品A同口径',deadline:'2000-01-01T00:00:00Z',supportCriteria:'明确出现',refuteCriteria:'明确否定'});expect(rpc).toHaveBeenCalledOnce();});
 it('does not disguise write or unknown read failures as success',async()=>{rpc.mockResolvedValue({error:{code:'42501',message:'owner required'}});await expect(saveBusinessLearning(owner,correction)).rejects.toThrow('owner required');await expect(loadBusinessLearning(owner,id)).rejects.toThrow('owner required');});
 it('keeps old pages readable when migration122 is missing',async()=>{rpc.mockResolvedValue({error:{code:'PGRST202',message:'function missing'}});expect((await loadBusinessLearning(owner,id)).available).toBe(false);expect((await searchBusinessMethods(owner,'')).available).toBe(false);});
 it('forwards owner-scoped pagination cursors and search without silent truncation',async()=>{rpc.mockResolvedValue({data:{available:true,items:[],nextCursor:id},error:null});await loadBusinessLearning(owner,id,id);expect(rpc).toHaveBeenLastCalledWith('business_learning_read',{p_user_id:owner,p_case_id:id,p_before:id});await searchBusinessMethods(owner,'  配送条件  ',id);expect(rpc).toHaveBeenLastCalledWith('business_method_search',{p_user_id:owner,p_query:'配送条件',p_before:id});});
});
