import {describe,it,expect,vi,beforeEach} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());vi.mock('@/lib/supabase',()=>({supabaseAdminUncached:{rpc}}));
import {listCounterexamples,getCounterexample,commandCounterexample,loadCounterexampleMethodStart} from './transport';
const id='20000000-0000-4000-8000-000000000001';
beforeEach(()=>rpc.mockReset());
describe('反例研究独立边界',()=>{
 it('只对129缺失提供局部提示，其他错误原样失败',async()=>{rpc.mockResolvedValueOnce({data:null,error:{code:'PGRST202',message:'missing'}});expect((await listCounterexamples(id)).available).toBe(false);rpc.mockResolvedValueOnce({error:{code:'42501',message:'denied'}});await expect(listCounterexamples(id)).rejects.toThrow('denied');});
 it('使用未缓存RPC且拒绝回读错位记录',async()=>{rpc.mockResolvedValue({data:{wrong:'shape'},error:null});await expect(getCounterexample(id,id)).rejects.toThrow();expect(rpc).toHaveBeenCalledWith('business_counterexample_read',{p_user_id:id,p_operation:'get',p_input:{id}});});
 it('深链精确查找本人方法不受第一页限制',async()=>{rpc.mockResolvedValue({data:null,error:null});expect(await loadCounterexampleMethodStart(id,id)).toBe(null);expect(rpc.mock.calls[0][1].p_operation).toBe('method_start');});
 it('命令回执必须对应同一记录和下一版本',async()=>{rpc.mockResolvedValue({data:{id,revision:8,methodId:null},error:null});await expect(commandCounterexample(id,{operation:'delete',id,requestId:id,expectedRevision:1})).rejects.toThrow();});
});
